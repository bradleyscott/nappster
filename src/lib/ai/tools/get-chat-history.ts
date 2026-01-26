import { tool } from "ai";
import { z } from "zod";
import { ToolContext } from "./types";

function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p: { type: string }) => p.type === "text")
    .map((p: { text?: string }) => p.text || "")
    .join(" ")
    .trim();
}

/**
 * Creates a tool that retrieves older chat messages.
 * Use this when you need to recall past conversations or the user
 * references something discussed earlier.
 */
export function createGetChatHistoryTool(context: ToolContext) {
  const { supabase, babyId } = context;

  return tool({
    description: `Retrieve older chat messages beyond the recent history already provided. Use this when you need to recall past conversations or the user references something discussed earlier.

Examples of when to use:
- "What did we talk about last week?"
- "You mentioned something about sleep training before..."
- "What advice did you give me about naps?"`,
    inputSchema: z.object({
      days: z
        .number()
        .min(1)
        .default(7)
        .describe("Number of days of chat history to retrieve (default 7)"),
      limit: z
        .number()
        .min(1)
        .max(100)
        .default(50)
        .describe(
          "Maximum number of messages to retrieve. (Max 100. Default 50)",
        ),
    }),
    execute: async ({ days, limit }) => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data: messages, error } = await supabase
        .from("chat_messages")
        .select("message_id, role, parts, created_at")
        .eq("baby_id", babyId)
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true })
        .limit(limit);

      if (error) {
        return { success: false, error: error.message };
      }

      // Extract text content from messages
      const formattedMessages = (messages || [])
        .map((msg) => ({
          role: msg.role,
          text: extractTextFromParts(msg.parts),
          date: new Date(msg.created_at).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }),
        }))
        .filter((msg) => msg.text.trim().length > 0);

      return {
        success: true,
        days_retrieved: days,
        message_count: formattedMessages.length,
        messages: formattedMessages,
      };
    },
  });
}
