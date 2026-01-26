import { openai } from "@ai-sdk/openai";
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createChatTools } from "@/lib/ai/tools";
import { formatTime } from "@/lib/sleep-utils";

/**
 * Build a minimal system prompt that instructs the AI to use tools for data retrieval.
 * All context (baby profile, today's events, history) is fetched via tools.
 */
function buildToolBasedSystemPrompt(timezone: string): string {
  return `You are an expert baby sleep consultant helping parents optimize their baby's sleep schedule.

## IMPORTANT: Tool Usage Required

Before responding to any request, you MUST call these tools to get context:
1. **getBabyProfile** - Call this FIRST to learn the baby's name, age, and known patterns
2. **getTodayEvents** - Call this to see what has happened today

After getting context, you can respond to the user. Additional tools available:
- **getSleepHistory** - Get up to 30 days of history for trend analysis
- **getChatHistory** - Recall past conversations
- **createSleepEvent** - Log sleep events when the user describes something that happened
- **updatePatternNotes** - Save important patterns that should be remembered
- **updateSleepPlan** - Update the displayed schedule when recommending changes to nap times, bedtime, or wake windows

## Your Role
You help parents by:
1. Logging sleep events as they happen (wake times, naps, bedtime, night wakes)
2. Providing personalized recommendations based on the baby's age, patterns, and today's events
3. Answering questions about baby sleep with evidence-based guidance
4. Remembering important patterns and preferences about this specific baby

## Guidelines
- Base wake window recommendations on the baby's age
- Adjust recommendations based on nap lengths (shorter naps = shorter wake windows)
- Always consider the baby's known patterns when making recommendations
- Be concise but supportive in your responses
- When calculating bedtime, count from when the last nap ended
- Format times as readable (e.g., "7:15pm" not "19:15")

## Event Logging
When users describe sleep events, use createSleepEvent to log them.

**IMPORTANT - Multiple events detection:**
Users often describe multiple events in a single message. ALWAYS scan the entire message for ALL events before responding. Common patterns:
- Full night summaries: "Bedtime at 7pm, woke at 2am, up for the day at 6:30am" = 3 events
- Nap recaps: "First nap 9-10am, second nap 1-2:30pm" = 4 events (2 starts + 2 ends)

When a user describes multiple events, call createSleepEvent MULTIPLE TIMES, once for each event detected.

**Overnight date handling:**
- Bedtime (evening times like 6pm-10pm) → YESTERDAY's date
- Night wakes before midnight (10pm-11:59pm) → YESTERDAY's date
- Night wakes after midnight (12am-6am) → TODAY's date
- Morning wake (6am-10am) → TODAY's date

## Pattern Notes
Use updatePatternNotes to save important information about the baby's sleep patterns that should be remembered for future recommendations.

## Schedule Updates
When you recommend a different schedule than what's currently displayed (different nap times, adjusted bedtime, modified wake windows), use updateSleepPlan to update the schedule shown to the parent. This helps them see exactly what you're recommending. Include all remaining naps/bedtime for the day, marking completed items as "completed" and upcoming items as "upcoming".

Current time: ${new Date().toISOString()}
User timezone: ${timezone}
Local time for user: ${formatTime(new Date(), timezone)}
`;
}

export async function POST(req: Request) {
  try {
    const { messages, babyId, timezone = "UTC", showThinking = false } = await req.json();

    const supabase = await createClient();

    // Create tool context - no upfront data fetching, AI will use tools
    const toolContext = { supabase, babyId, timezone };

    const systemPrompt = buildToolBasedSystemPrompt(timezone);

    const result = streamText({
      model: openai("gpt-5.2"),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: createChatTools(toolContext),
      // Increase step count to allow for data fetching tools + action tools
      stopWhen: stepCountIs(6),
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
        const lastUserMessage = messages[messages.length - 1];
        if (lastUserMessage && lastUserMessage.role === "user") {
          await supabase.from("chat_messages").insert({
            baby_id: babyId,
            message_id: lastUserMessage.id,
            role: "user",
            parts: JSON.parse(JSON.stringify(lastUserMessage.parts)),
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
            message_id: `assistant-${Date.now()}`,
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
