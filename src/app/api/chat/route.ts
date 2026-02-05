import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createChatTools } from "@/lib/ai/tools";
import { buildChatSystemPrompt } from "@/lib/ai/prompts";
import {
  formatEventsContext,
  extractTextFromParts,
  type ChatContext,
} from "@/lib/ai/format-context";
import {
  requireBabyAccess,
  apiError,
  apiValidationError,
  authErrorResponse,
} from "@/lib/api";
import { Json, SleepEvent } from "@/types/database";

// Schema for validating critical request fields
// Messages are validated by the SDK itself
const requestFieldsSchema = z.object({
  babyId: z.string().uuid(),
  timezone: z.string().optional(),
  showThinking: z.boolean().optional(),
  // Pre-injected context from client
  todayEvents: z
    .array(
      z.object({
        id: z.string(),
        event_type: z.string(),
        event_time: z.string(),
        end_time: z.string().nullable().optional(),
        context: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      })
    )
    .optional(),
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        parts: z.any(),
      })
    )
    .optional(),
});

// Maximum tool invocation steps before stopping the AI response.
// Allows for data-fetching tools (2-3 calls) plus action tools (1-2 calls)
// with headroom for multi-step reasoning.
const MAX_TOOL_STEPS = 6;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Validate critical fields
    const fieldsResult = requestFieldsSchema.safeParse(body);
    if (!fieldsResult.success) {
      return apiValidationError(fieldsResult.error.flatten());
    }

    // Extract fields with defaults
    const messages = body.messages;
    const babyId = fieldsResult.data.babyId;
    const timezone = fieldsResult.data.timezone ?? "UTC";
    const showThinking = fieldsResult.data.showThinking ?? false;
    const todayEvents = fieldsResult.data.todayEvents;
    const recentMessages = fieldsResult.data.recentMessages;

    if (!Array.isArray(messages)) {
      return apiError("messages must be an array", 400);
    }

    const supabase = await createClient();

    // Verify user has access to this baby
    const auth = await requireBabyAccess(supabase, babyId);
    if (!auth.success) {
      return authErrorResponse(auth);
    }

    // Build chat context from pre-injected data
    let chatContext: ChatContext | undefined;
    if (todayEvents || recentMessages) {
      const eventsContext = todayEvents
        ? formatEventsContext(todayEvents as SleepEvent[], timezone)
        : undefined;

      const formattedMessages = recentMessages
        ?.map((m) => ({
          role: m.role,
          text: extractTextFromParts(m.parts),
        }))
        .filter((m) => m.text.length > 0);

      chatContext = {
        todayEvents: eventsContext?.formattedEvents,
        currentState: eventsContext?.currentState,
        eventSummary: eventsContext?.eventSummary,
        recentMessages: formattedMessages,
      };
    }

    // Create tool context - AI can still use tools for additional data
    const toolContext = { supabase, babyId, timezone };

    const systemPrompt = buildChatSystemPrompt(timezone, chatContext);

    // Generate a consistent assistant message ID upfront so the stream
    // sends the same ID to the client that we save to the database.
    // Without this, the client generates its own nanoid while the server
    // saves with the model's response ID, causing realtime dedup to fail
    // and the message to appear twice.
    const assistantMessageId = crypto.randomUUID();

    const result = streamText({
      model: openai("gpt-5.2"),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: createChatTools(toolContext),
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      // Always enable reasoning for quality - showThinking only controls
      // whether reasoning tokens are streamed to the client via sendReasoning
      providerOptions: {
        openai: {
          reasoningEffort: "medium",
        },
      },
    });

    // Save messages to database after stream completes
    // Using after() ensures this runs to completion even in serverless environments
    after(async () => {
      const maxRetries = 2;

      // Helper to save with retry logic
      async function saveWithRetry(
        data: { baby_id: string; message_id: string; role: string; parts: Json },
        attempt = 1
      ): Promise<boolean> {
        const { error } = await supabase.from("chat_messages").insert(data);
        if (error) {
          if (attempt < maxRetries) {
            // Exponential backoff: 100ms, 200ms
            await new Promise((r) => setTimeout(r, 100 * attempt));
            return saveWithRetry(data, attempt + 1);
          }
          console.error(
            `Failed to save chat message after ${maxRetries} attempts:`,
            { messageId: data.message_id, role: data.role, error }
          );
          return false;
        }
        return true;
      }

      try {
        // Save the user message
        const lastUserMessage = messages[messages.length - 1] as {
          id?: string;
          role?: string;
          parts?: unknown[];
        } | undefined;
        if (lastUserMessage?.role === "user" && lastUserMessage.id) {
          await saveWithRetry({
            baby_id: babyId,
            message_id: lastUserMessage.id,
            role: "user",
            parts: JSON.parse(JSON.stringify(lastUserMessage.parts ?? [])),
          });
        }

        // Wait for streaming to complete, then save assistant message
        const text = await result.text;
        const toolCalls = await result.toolCalls;
        const toolResults = await result.toolResults;
        const reasoning = await result.reasoning;

        // Build assistant message parts
        const assistantParts: Array<{
          type: string;
          text?: string;
          state?: string;
          input?: unknown;
          output?: unknown;
        }> = [];

        // Include reasoning parts if available
        if (reasoning && reasoning.length > 0) {
          for (const reasoningBlock of reasoning) {
            assistantParts.push({
              type: "reasoning",
              text: reasoningBlock.text,
            });
          }
        }

        if (text) {
          assistantParts.push({ type: "text", text });
        }

        for (const toolCall of toolCalls) {
          const toolResult = toolResults.find(
            (r) => r.toolCallId === toolCall.toolCallId,
          );
          // Access the input via type assertion since the SDK types vary
          const input = "input" in toolCall ? toolCall.input : undefined;
          const output =
            toolResult && "output" in toolResult
              ? toolResult.output
              : undefined;
          assistantParts.push({
            type: `tool-${toolCall.toolName}`,
            state: "output-available",
            input,
            output,
          });
        }

        if (assistantParts.length > 0) {
          await saveWithRetry({
            baby_id: babyId,
            message_id: assistantMessageId,
            role: "assistant",
            parts: JSON.parse(JSON.stringify(assistantParts)),
          });
        }
      } catch (saveError) {
        console.error("Error saving chat messages:", saveError);
        // Don't throw - saving is best-effort, don't break the stream
      }
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: showThinking,
      originalMessages: messages,
      generateMessageId: assistantMessageId,
    });
  } catch (error) {
    console.error("Error in chat API:", error);
    return apiError("Error processing chat", 500);
  }
}
