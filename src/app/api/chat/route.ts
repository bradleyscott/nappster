import { openai } from '@ai-sdk/openai'
import { streamText, convertToModelMessages, tool, stepCountIs } from 'ai'
import { z } from 'zod'
import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildSystemPrompt } from '@/lib/sleep-utils'
import { getTodayBoundsForTimezone, formatTimeInTimezone } from '@/lib/timezone'

function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return ''
  return parts
    .filter((p: { type: string }) => p.type === 'text')
    .map((p: { text?: string }) => p.text || '')
    .join(' ')
    .trim()
}

export async function POST(req: Request) {
  try {
    const { messages, babyId, timezone = 'UTC' } = await req.json()

    // Get baby and today's events from Supabase
    const supabase = await createClient()

    const { data: baby } = await supabase
      .from('babies')
      .select('*')
      .eq('id', babyId)
      .single()

    if (!baby) {
      return new Response('Baby not found', { status: 404 })
    }

    // Get today's events using user's timezone
    const { start: todayStart, end: todayEnd } = getTodayBoundsForTimezone(timezone)

    const { data: events } = await supabase
      .from('sleep_events')
      .select('*')
      .eq('baby_id', babyId)
      .gte('event_time', todayStart)
      .lt('event_time', todayEnd)
      .order('event_time', { ascending: true })

    // Get recent history (last 7 days)
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const { data: recentHistory } = await supabase
      .from('sleep_events')
      .select('*')
      .eq('baby_id', babyId)
      .gte('event_time', weekAgo.toISOString())
      .lt('event_time', todayStart)
      .order('event_time', { ascending: false })
      .limit(50)

    // Get recent chat history for AI context
    const currentMessageIds = messages
      .map((m: { id?: string }) => m.id)
      .filter(Boolean) as string[]

    const { data: chatHistoryRaw } = await supabase
      .from('chat_messages')
      .select('message_id, role, parts, created_at')
      .eq('baby_id', babyId)
      .order('created_at', { ascending: false })
      .limit(20)

    // Filter out current session messages and extract text content
    const chatHistory = (chatHistoryRaw || [])
      .filter(msg => !currentMessageIds.includes(msg.message_id))
      .reverse() // chronological order
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        text: extractTextFromParts(msg.parts),
        created_at: msg.created_at,
      }))
      .filter(msg => msg.text.trim().length > 0)

    const systemPrompt = buildSystemPrompt(baby, events || [], recentHistory || [], chatHistory)

    const result = streamText({
      model: openai("gpt-5.2"),
      system: systemPrompt + `\n\nCurrent time: ${new Date().toISOString()}\nUser timezone: ${timezone}\nLocal time for user: ${formatTimeInTimezone(new Date(), timezone)}`,
      messages: await convertToModelMessages(messages),
      tools: {
        createSleepEvent: tool({
          description: `Log a sleep event when the user describes something that happened.
Use this when the user mentions:
- Waking up (event_type: 'wake')
- Starting a nap or going down for a nap (event_type: 'nap_start')
- Ending a nap or waking from a nap (event_type: 'nap_end')
- Going to bed for the night (event_type: 'bedtime')
- Waking during the night (event_type: 'night_wake')

Parse times like "at 2pm", "at 14:30", "just now", "30 minutes ago".
Infer context from mentions of "at daycare", "at home", "while traveling".
Do NOT use this tool for questions or hypothetical scenarios.`,
          inputSchema: z.object({
            event_type: z.enum(['wake', 'nap_start', 'nap_end', 'bedtime', 'night_wake'])
              .describe('The type of sleep event'),
            event_time: z.string()
              .describe('ISO 8601 timestamp for when the event occurred'),
            context: z.enum(['home', 'daycare', 'travel']).nullable()
              .describe('Where the event occurred, if mentioned'),
            notes: z.string().nullable()
              .describe('Any additional details mentioned by the user'),
          }),
          execute: async ({ event_type, event_time, context, notes }) => {
            const { data, error } = await supabase
              .from('sleep_events')
              .insert({
                baby_id: babyId,
                event_type,
                event_time,
                context,
                notes,
              })
              .select()
              .single()

            if (error) {
              return { success: false, error: error.message }
            }

            return {
              success: true,
              event: data,
              message: `Logged ${event_type.replace('_', ' ')} at ${formatTimeInTimezone(event_time, timezone)}${context ? ` (${context})` : ''}`
            }
          },
        }),
        updatePatternNotes: tool({
          description: `Update the baby's pattern notes when the user shares important information about their baby's sleep patterns, preferences, or behaviors that should be remembered for future recommendations.

Use this tool when the user mentions:
- Consistent sleep preferences (light sleeper, needs dark room, needs white noise, etc.)
- Sleep associations (needs pacifier, specific lovey, rocking, etc.)
- Typical wake times or schedule preferences
- Nap preferences (length, number of naps, where they nap best)
- Feeding/sleep relationships (needs feed before nap, etc.)
- Environmental needs (temperature, swaddle preferences, etc.)
- Behavioral patterns (fights last nap, hard to settle at bedtime, etc.)
- Changes in routine or new developments

Do NOT use this for:
- One-time events (use createSleepEvent instead)
- Questions or hypothetical scenarios
- Information already in the current pattern notes`,
          inputSchema: z.object({
            pattern_info: z.string()
              .describe('A concise description of the pattern or preference to remember, written in third person (e.g., "Usually wakes around 7am", "Needs white noise to sleep")'),
          }),
          execute: async ({ pattern_info }) => {
            // Get current pattern notes
            const currentNotes = baby.pattern_notes || ''

            // Append new info (the AI should provide non-duplicate info)
            const updatedNotes = currentNotes
              ? `${currentNotes}. ${pattern_info}`
              : pattern_info

            const { error } = await supabase
              .from('babies')
              .update({ pattern_notes: updatedNotes })
              .eq('id', babyId)

            if (error) {
              return { success: false, error: error.message }
            }

            // Update local baby object for this request
            baby.pattern_notes = updatedNotes

            return {
              success: true,
              message: `Noted: "${pattern_info}"`,
              current_notes: updatedNotes
            }
          },
        }),
      },
      stopWhen: stepCountIs(2),
    });

    // Save messages to database after stream completes
    // Using after() ensures this runs to completion even in serverless environments
    after(async () => {
      try {
        // Save the user message
        const lastUserMessage = messages[messages.length - 1]
        if (lastUserMessage && lastUserMessage.role === 'user') {
          await supabase.from('chat_messages').insert({
            baby_id: babyId,
            message_id: lastUserMessage.id,
            role: 'user',
            parts: JSON.parse(JSON.stringify(lastUserMessage.parts)),
          })
        }

        // Wait for streaming to complete, then save assistant message
        const text = await result.text
        const toolCalls = await result.toolCalls
        const toolResults = await result.toolResults

        // Build assistant message parts
        const assistantParts: Array<{ type: string; text?: string; state?: string; input?: unknown; output?: unknown }> = []

        if (text) {
          assistantParts.push({ type: 'text', text })
        }

        for (const toolCall of toolCalls) {
          const toolResult = toolResults.find(
            (r) => r.toolCallId === toolCall.toolCallId
          )
          // Access the input via type assertion since the SDK types vary
          const input = 'input' in toolCall ? toolCall.input : undefined
          const output = toolResult && 'output' in toolResult ? toolResult.output : undefined
          assistantParts.push({
            type: `tool-${toolCall.toolName}`,
            state: 'output-available',
            input,
            output,
          })
        }

        if (assistantParts.length > 0) {
          await supabase.from('chat_messages').insert({
            baby_id: babyId,
            message_id: `assistant-${Date.now()}`,
            role: 'assistant',
            parts: JSON.parse(JSON.stringify(assistantParts)),
          })
        }
      } catch (saveError) {
        console.error('Error saving chat messages:', saveError)
        // Don't throw - saving is best-effort, don't break the stream
      }
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error('Error in chat API:', error)
    return new Response('Error processing chat', { status: 500 })
  }
}
