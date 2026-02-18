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
  buildSessionRecap,
  type ChatContext,
  type BabyProfileContext,
} from "@/lib/ai/format-context";
import {
  requireBabyAccess,
  apiError,
  apiValidationError,
  authErrorResponse,
} from "@/lib/api";
import { Json, SleepEvent } from "@/types/database";
import {
  getStartOfDaysAgoForTimezone,
  getTodayBoundsForTimezone,
} from "@/lib/timezone";
import {
  computeSleepTrends,
  formatSleepTrends,
} from "@/lib/sleep-trend-stats";

// Schema for validating critical request fields
// Messages are validated by the SDK itself
const requestFieldsSchema = z.object({
  babyId: z.string().uuid(),
  timezone: z.string().optional(),
  showThinking: z.boolean().optional(),
  // Pre-injected context from client
  babyProfile: z
    .object({
      name: z.string(),
      age: z.string(),
      birthDate: z.string(),
      sleepTrainingMethod: z.string().nullable(),
      patternNotes: z.string().nullable(),
    })
    .optional(),
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

// Maximum number of recent messages to include in the model context.
// Older messages are available via the getChatHistory tool.
// Each "message" from the SDK may expand to multiple model messages (tool
// calls/results), so this keeps the context window bounded.
const MAX_CONVERSATION_MESSAGES = 20;

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
    const babyProfile = fieldsResult.data.babyProfile;
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

    // Fetch 30 days of sleep events (server-side, always fresh).
    // Used for both trend computation and extracting today's authoritative events.
    const startDate = getStartOfDaysAgoForTimezone(timezone, 30);
    const { data: historyEvents } = await supabase
      .from("sleep_events")
      .select("*")
      .eq("baby_id", babyId)
      .gte("event_time", startDate)
      .order("event_time", { ascending: true });

    let sleepTrendsFormatted: string | null = null;
    if (historyEvents && historyEvents.length > 0) {
      const trends = computeSleepTrends(
        historyEvents as SleepEvent[],
        timezone
      );
      sleepTrendsFormatted = formatSleepTrends(trends);
    }

    // Extract today's events from the server query — these are always fresh
    // from the DB, unlike the client-provided todayEvents which can be stale
    // (e.g. app was backgrounded, realtime lag, another caregiver logged events).
    const { start: todayStart, end: todayEnd } =
      getTodayBoundsForTimezone(timezone);
    const serverTodayEvents = (historyEvents ?? [])
      .filter(
        (e) => e.event_time >= todayStart && e.event_time < todayEnd
      )
      .sort(
        (a, b) =>
          new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
      ) as SleepEvent[];

    // Build chat context from pre-injected data
    let chatContext: ChatContext | undefined;
    const effectiveTodayEvents =
      serverTodayEvents.length > 0 ? serverTodayEvents : todayEvents;
    if (babyProfile || effectiveTodayEvents || recentMessages || sleepTrendsFormatted) {
      const eventsContext = effectiveTodayEvents
        ? formatEventsContext(effectiveTodayEvents as SleepEvent[], timezone)
        : undefined;

      const formattedMessages = recentMessages
        ?.map((m) => ({
          role: m.role,
          text: extractTextFromParts(m.parts),
        }))
        .filter((m) => m.text.length > 0);

      // Only include recent messages in the system prompt for the first
      // turn of a conversation. Once the model has live messages in its
      // context window, the pre-injected recap is redundant tokens.
      const isFirstTurn = messages.length <= 1;

      // Build a compact last-session recap for cross-session continuity.
      // Always included (even on subsequent turns) since it's cheap and
      // helps the model recall prior-session context that isn't in the
      // live message window.
      const lastSessionRecap =
        formattedMessages && formattedMessages.length > 0
          ? buildSessionRecap(formattedMessages)
          : undefined;

      chatContext = {
        babyProfile: babyProfile as BabyProfileContext | undefined,
        todayEvents: eventsContext?.formattedEvents,
        currentState: eventsContext?.currentState,
        eventSummary: eventsContext?.eventSummary,
        recentMessages: isFirstTurn ? formattedMessages : undefined,
        lastSessionRecap,
        sleepTrends: sleepTrendsFormatted,
      };
    }

    // Create tool context - AI can still use tools for additional data
    const toolContext = { supabase, babyId, timezone };

    const systemPrompt = buildChatSystemPrompt(timezone, chatContext);

    // Window the conversation: only send the most recent messages to the
    // model. Older messages are still saved and available via getChatHistory.
    const windowedMessages =
      messages.length > MAX_CONVERSATION_MESSAGES
        ? messages.slice(-MAX_CONVERSATION_MESSAGES)
        : messages;

    // Generate a consistent assistant message ID upfront so the stream
    // sends the same ID to the client that we save to the database.
    // Without this, the client generates its own nanoid while the server
    // saves with the model's response ID, causing realtime dedup to fail
    // and the message to appear twice.
    const assistantMessageId = crypto.randomUUID();

    const result = streamText({
      model: openai("gpt-5.2"),
      system: systemPrompt,
      messages: await convertToModelMessages(windowedMessages),
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

    // Read-only tools whose full output is expensive to persist.
    // We store a condensed summary instead to save DB storage and
    // reduce tokens when these messages are loaded back as history.
    const READ_TOOL_NAMES = new Set([
      "getBabyProfile",
      "getTodayEvents",
      "getSleepHistory",
      "getChatHistory",
    ]);

    function condenseToolOutput(
      toolName: string,
      output: unknown,
    ): unknown {
      if (!READ_TOOL_NAMES.has(toolName)) return output;
      if (typeof output !== "object" || output === null) return output;

      const o = output as Record<string, unknown>;
      // Keep success/error status but replace bulky data with a summary
      if (toolName === "getSleepHistory") {
        return {
          success: o.success,
          days_retrieved: o.days_retrieved,
          total_events: o.total_events,
          _condensed: true,
        };
      }
      if (toolName === "getChatHistory") {
        return {
          success: o.success,
          days_retrieved: o.days_retrieved,
          message_count: o.message_count,
          _condensed: true,
        };
      }
      if (toolName === "getTodayEvents") {
        const summary = (o.summary as Record<string, unknown>) ?? {};
        return {
          success: o.success,
          currentState: o.currentState,
          eventCount: Array.isArray(o.events) ? o.events.length : 0,
          summary,
          _condensed: true,
        };
      }
      if (toolName === "getBabyProfile") {
        return { success: o.success, _condensed: true };
      }
      return output;
    }

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
          const rawOutput =
            toolResult && "output" in toolResult
              ? toolResult.output
              : undefined;
          // Condense read-tool outputs before persisting to save storage
          const output = condenseToolOutput(toolCall.toolName, rawOutput);
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
      generateMessageId: () => assistantMessageId,
    });
  } catch (error) {
    console.error("Error in chat API:", error);
    return apiError("Error processing chat", 500);
  }
}
