import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { after } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createChatTools } from "@/lib/ai/tools";
import { buildChatSystemPrompt } from "@/lib/ai/prompts";

// Schema for validating critical request fields
// Messages are validated by the SDK itself
const requestFieldsSchema = z.object({
  babyId: z.string().uuid(),
  timezone: z.string().optional(),
  showThinking: z.boolean().optional(),
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
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: fieldsResult.error.flatten(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Extract fields with defaults
    const messages = body.messages;
    const babyId = fieldsResult.data.babyId;
    const timezone = fieldsResult.data.timezone ?? "UTC";
    const showThinking = fieldsResult.data.showThinking ?? false;

    if (!Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "messages must be an array" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = await createClient();

    // Create tool context - no upfront data fetching, AI will use tools
    const toolContext = { supabase, babyId, timezone };

    const systemPrompt = buildChatSystemPrompt(timezone);

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
      try {
        // Save the user message
        const lastUserMessage = messages[messages.length - 1] as {
          id?: string;
          role?: string;
          parts?: unknown[];
        } | undefined;
        if (lastUserMessage?.role === "user" && lastUserMessage.id) {
          await supabase.from("chat_messages").insert({
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
          await supabase.from("chat_messages").insert({
            baby_id: babyId,
            message_id: `assistant-${crypto.randomUUID()}`,
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
    });
  } catch (error) {
    console.error("Error in chat API:", error);
    return new Response("Error processing chat", { status: 500 });
  }
}
