import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { UIMessage } from "@ai-sdk/react";
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
import type { SleepEvent } from "@/types/database";
import { validateTimezone } from "@/lib/timezone";
import { validateEnv } from "@/lib/env";
import { buildSleepHistoryContext } from "@/lib/ai/build-plan-context";
import { getBabyById } from "@/lib/services/babies";
import { formatAge } from "@/lib/sleep-utils";
import { persistChatTurn } from "@/lib/ai/chat-persistence";
import { logError } from "@/lib/error-reporting";
import {
  CHAT_MAX_TOOL_STEPS,
  MAX_CONVERSATION_MESSAGES,
} from "@/lib/config";

// Schema for validating critical request fields.
// babyProfile and todayEvents are NOT accepted from the client — they are
// fetched server-side to avoid trust-boundary issues.

const MAX_MESSAGE_TEXT_LENGTH = 10000
const MAX_PARTS_PER_MESSAGE = 50

/**
 * Validate a single UI message part.
 * Known part types are constrained; unknown types are accepted as objects
 * with a type string for forward compatibility, but text-bearing fields are
 * capped in length to prevent abuse.
 */
const uiMessagePartSchema = z
  .object({
    type: z.string().max(64),
  })
  .catchall(z.unknown())
  .refine(
    (part) => {
      if (typeof part.text === 'string' && part.text.length > MAX_MESSAGE_TEXT_LENGTH) {
        return false
      }
      if (typeof part.reasoning === 'string' && part.reasoning.length > MAX_MESSAGE_TEXT_LENGTH) {
        return false
      }
      return true
    },
    { message: 'Message part exceeds maximum allowed length' },
  )

/**
 * Validate client-sent chat messages.
 * Only user and assistant roles are allowed; the server controls the system
 * prompt. Messages are capped in size to limit abuse.
 */
const uiMessageSchema = z.object({
  id: z.string().max(128),
  role: z.enum(['user', 'assistant']),
  parts: z.array(uiMessagePartSchema).max(MAX_PARTS_PER_MESSAGE),
  createdAt: z.union([z.string(), z.date()]).optional(),
})

const requestFieldsSchema = z.object({
  babyId: z.string().uuid(),
  timezone: z.string().optional(),
  showThinking: z.boolean().optional(),
  messages: z.array(uiMessageSchema).max(MAX_CONVERSATION_MESSAGES),
  recentMessages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        parts: z.array(z.object({
          type: z.string(),
          text: z.string().optional(),
        }).catchall(z.unknown())).default([]),
      })
    )
    .optional(),
});

// Constants centralized in lib/config.ts
// CHAT_MAX_TOOL_STEPS = 6, MAX_CONVERSATION_MESSAGES = 20

export async function POST(req: Request) {
  try {
    validateEnv()
    const body = await req.json();

    // Validate critical fields
    const fieldsResult = requestFieldsSchema.safeParse(body);
    if (!fieldsResult.success) {
      return apiValidationError(fieldsResult.error.flatten());
    }

    // Extract fields with defaults
    const messages = fieldsResult.data.messages;
    const babyId = fieldsResult.data.babyId;
    const timezone = validateTimezone(fieldsResult.data.timezone ?? "UTC");
    const showThinking = fieldsResult.data.showThinking ?? false;
    const recentMessages = fieldsResult.data.recentMessages;

    const supabase = await createClient();

    // Verify user has access to this baby
    const auth = await requireBabyAccess(supabase, babyId);
    if (!auth.success) {
      return authErrorResponse(auth);
    }

    // Fetch baby profile server-side — never trust client-supplied profile data
    const { data: baby, error: babyError } = await getBabyById(supabase, babyId);
    if (babyError || !baby) {
      return apiError(
        babyError?.message ?? "Baby profile not found",
        babyError ? 500 : 404,
      );
    }

    const babyProfile: BabyProfileContext = {
      name: baby.name,
      age: formatAge(baby.birth_date),
      birthDate: baby.birth_date,
      sleepTrainingMethod: null,
      patternNotes: baby.pattern_notes,
    };

    // Fetch today's events server-side — authoritative source
    const {
      todayEvents: serverTodayEvents,
      sleepTrendsFormatted,
    } = await buildSleepHistoryContext(supabase, babyId, timezone);

    // Build chat context from server-fetched data
    let chatContext: ChatContext | undefined;
    if (serverTodayEvents.length > 0 || recentMessages || sleepTrendsFormatted) {
      const eventsContext = serverTodayEvents.length > 0
        ? formatEventsContext(serverTodayEvents as SleepEvent[], timezone)
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
        babyProfile,
        todayEvents: eventsContext?.formattedEvents,
        currentState: eventsContext?.currentState,
        eventSummary: eventsContext?.eventSummary,
        recentMessages: isFirstTurn ? formattedMessages : undefined,
        lastSessionRecap,
        sleepTrends: sleepTrendsFormatted,
      };
    }

    // Create tool context — AI can still use tools for additional data
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
      model: openai("gpt-5.4"),
      system: systemPrompt,
      messages: await convertToModelMessages(windowedMessages as UIMessage[]),
      tools: createChatTools(toolContext),
      stopWhen: stepCountIs(CHAT_MAX_TOOL_STEPS),
      // Always enable reasoning for quality — showThinking only controls
      // whether reasoning tokens are streamed to the client via sendReasoning
      providerOptions: {
        openai: {
          reasoningEffort: "high",
        },
      },
    });

    // Save messages to database after stream completes.
    // Using after() ensures this runs to completion even in serverless environments.
    after(async () => {
      await persistChatTurn({
        supabase,
        babyId,
        assistantMessageId,
        messages: messages as unknown[], // cast preserved for persistChatTurn which accepts unknown[]
        result: {
          text: result.text,
          toolCalls: result.toolCalls,
          toolResults: result.toolResults,
          reasoning: result.reasoning,
        },
      });
    });

    return result.toUIMessageStreamResponse({
      sendReasoning: showThinking,
      originalMessages: messages as UIMessage[],
      generateMessageId: () => assistantMessageId,
    });
  } catch (error) {
    logError("chat", "Error in chat API:", error);
    return apiError("Error processing chat", 500);
  }
}
