'use client'

import { motion } from 'motion/react'
import Image from 'next/image'
import { Baby, SleepEvent, SleepPlanRow } from '@/types/database'
import { formatTime, calculateDurationMinutes } from '@/lib/sleep-utils'
import { formatDateHeader, getDateKey, getTimelineItemTimestamp, type TimelineItem } from '@/lib/hooks/use-timeline-builder'
import type { ChatMessageData } from '@/lib/hooks/use-chat-history'
import { Button } from '@/components/ui/button'
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import { Loader } from '@/components/ai-elements/loader'
import { Suggestions, Suggestion } from '@/components/ai-elements/suggestion'
import {
  ChainOfThought,
  ChainOfThoughtHeader,
  ChainOfThoughtContent,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought'
import { SleepPlanCard } from '@/components/sleep-plan-card'
import { Search, Database, History, MessageSquare, FileEdit, Calendar, Moon } from 'lucide-react'
import type { SleepPlan } from '@/app/api/sleep-plan/route'

// Type definitions for tool message parts
type ToolCreateSleepEventPart = {
  type: 'tool-createSleepEvent'
  state?: 'input-streaming' | 'input-available' | 'output-available'
  input?: { event_type?: string }
  output?: { success: boolean; message?: string; error?: string; event?: SleepEvent }
}
type ToolUpdateSleepPlanPart = {
  type: 'tool-updateSleepPlan'
  state?: 'input-streaming' | 'input-available' | 'output-available'
  output?: { success: boolean; message?: string; plan?: SleepPlan }
}

// Type for parts array from message (broader type before narrowing)
type RawMessagePart = { type: string; text?: string; [key: string]: unknown }

// Type guards for message parts
function isToolCreateSleepEventPart(part: RawMessagePart): part is ToolCreateSleepEventPart {
  return part.type === 'tool-createSleepEvent'
}

function isToolUpdateSleepPlanPart(part: RawMessagePart): part is ToolUpdateSleepPlanPart {
  return part.type === 'tool-updateSleepPlan'
}

// Re-export TimelineItem for convenience
export type { TimelineItem }

// Event display configuration
export const eventConfig: Record<string, { icon: string; label: string; color: string }> = {
  wake: { icon: '☀️', label: 'Woke up', color: 'bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800' },
  nap_start: { icon: '😴', label: 'Nap started', color: 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' },
  nap_end: { icon: '🌤️', label: 'Nap ended', color: 'bg-sky-50 dark:bg-sky-950 border-sky-200 dark:border-sky-800' },
  bedtime: { icon: '🌙', label: 'Bedtime', color: 'bg-indigo-50 dark:bg-indigo-950 border-indigo-200 dark:border-indigo-800' },
  night_wake: { icon: '👀', label: 'Night wake', color: 'bg-purple-50 dark:bg-purple-950 border-purple-200 dark:border-purple-800' },
}

// Tool descriptions for chain-of-thought display
const toolInfo: Record<string, { label: string; icon: typeof Search }> = {
  'getBabyProfile': { label: 'Getting baby profile', icon: Database },
  'getTodayEvents': { label: 'Checking today\'s events', icon: Search },
  'getSleepHistory': { label: 'Analyzing sleep history', icon: History },
  'getChatHistory': { label: 'Recalling past conversations', icon: MessageSquare },
  'createSleepEvent': { label: 'Recording sleep event', icon: Moon },
  'updatePatternNotes': { label: 'Saving pattern notes', icon: FileEdit },
  'updateSleepPlan': { label: 'Updating schedule', icon: Calendar },
}

interface TimelineRendererProps {
  timelineItems: TimelineItem[]
  allMessages: ChatMessageData[]
  allSleepEvents: SleepEvent[]
  allSleepPlans: SleepPlanRow[]
  baby: Baby
  status: 'ready' | 'submitted' | 'streaming' | 'error'
  isLoadingHistory: boolean
  hasMoreHistory: boolean
  onLoadMoreHistory: () => void
  onSendMessage: (text: string) => void
  onEventClick: (event: SleepEvent) => void
}

// Extract text content from message parts
function getMessageText(message: { parts: unknown }): string {
  const parts = message.parts as Array<{ type: string; text?: string }> | undefined
  if (parts && parts.length > 0) {
    return parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text || '')
      .join('')
  }
  return ''
}

// Render all message parts including tool invocations
function renderMessageParts(message: { parts: unknown }, isStreaming: boolean) {
  const parts = message.parts as Array<{ type: string; text?: string; [key: string]: unknown }> | undefined

  const toolParts = parts?.filter(p => p.type.startsWith('tool-')) || []
  const hasToolCalls = toolParts.length > 0
  const textParts = parts?.filter(p => p.type === 'text' && p.text) || []
  const hasTextContent = textParts.length > 0

  if (isStreaming && !hasToolCalls && !hasTextContent) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground/70 text-xs">
        <Loader size={12} />
        <span>Thinking...</span>
      </div>
    )
  }

  if (!parts || parts.length === 0) return null

  const lastTextPartIndex = parts.map((p, i) => p.type === 'text' ? i : -1).filter(i => i >= 0).pop()

  const renderChainOfThought = () => {
    if (!hasToolCalls) return null
    const forceOpen = isStreaming && !hasTextContent

    return (
      <ChainOfThought
        key="chain-of-thought"
        className="mb-3"
        defaultOpen={false}
        {...(forceOpen ? { open: true } : {})}
      >
        <ChainOfThoughtHeader isStreaming={isStreaming} />
        <ChainOfThoughtContent>
          {toolParts.length > 0 ? (
            toolParts.map((toolPart, idx) => {
              const toolName = toolPart.type.replace('tool-', '')
              const info = toolInfo[toolName]
              const state = toolPart.state as string
              const isComplete = state === 'output-available'
              const Icon = info?.icon || Search

              return (
                <ChainOfThoughtStep
                  key={idx}
                  icon={Icon}
                  label={info?.label || toolName}
                  status={isComplete ? 'complete' : 'active'}
                />
              )
            })
          ) : (
            <ChainOfThoughtStep
              icon={Search}
              label="Starting..."
              status="active"
            />
          )}
        </ChainOfThoughtContent>
      </ChainOfThought>
    )
  }

  const renderedParts = parts.map((part, index) => {
    if (part.type === 'reasoning') {
      return null
    }

    if (part.type === 'text') {
      const isLastTextPart = index === lastTextPartIndex
      return (
        <div key={index}>
          <MessageResponse>{part.text || ''}</MessageResponse>
          {isStreaming && isLastTextPart && <span className="animate-pulse ml-0.5">▊</span>}
        </div>
      )
    }

    if (isToolCreateSleepEventPart(part)) {
      const { input, state, output } = part

      if (state === 'input-streaming' || state === 'input-available') {
        return (
          <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader size={14} />
            <span>Logging {input?.event_type?.replace('_', ' ') || 'event'}...</span>
          </div>
        )
      }

      if (state === 'output-available' && output) {
        if (output.success) {
          return (
            <div key={index} className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 py-2 px-3 bg-green-50 dark:bg-green-950 rounded-lg my-2">
              <span>✓</span>
              {output.message || 'Event logged'}
            </div>
          )
        } else {
          return (
            <div key={index} className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 py-2 px-3 bg-red-50 dark:bg-red-950 rounded-lg my-2">
              <span>✗</span>
              Failed to log event: {output.error}
            </div>
          )
        }
      }
    }

    if (isToolUpdateSleepPlanPart(part)) {
      const { state, output } = part

      if (state === 'input-streaming' || state === 'input-available') {
        return (
          <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <Loader size={14} />
            <span>Updating schedule...</span>
          </div>
        )
      }

      if (state === 'output-available' && output?.success) {
        return (
          <div key={index} className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 py-2 px-3 bg-blue-50 dark:bg-blue-950 rounded-lg my-2">
            <span>📅</span>
            {output.message || 'Schedule updated'}
          </div>
        )
      }
    }

    return null
  })

  return (
    <>
      {renderChainOfThought()}
      {renderedParts}
    </>
  )
}

export function TimelineRenderer({
  timelineItems,
  allMessages,
  allSleepEvents,
  allSleepPlans,
  baby,
  status,
  isLoadingHistory,
  hasMoreHistory,
  onLoadMoreHistory,
  onSendMessage,
  onEventClick,
}: TimelineRendererProps) {
  return (
    <>
      {isLoadingHistory && (
        <div className="text-center py-2">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader size={14} />
            <span>Loading history...</span>
          </div>
        </div>
      )}

      {hasMoreHistory && !isLoadingHistory && (
        <div className="text-center py-2">
          <Button variant="ghost" size="sm" onClick={onLoadMoreHistory}>
            Load earlier messages
          </Button>
        </div>
      )}

      {allMessages.length === 0 && allSleepEvents.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center justify-center py-12 text-center"
        >
          <Image
            src="/nappster.png"
            alt="Nappster"
            width={64}
            height={64}
            className="rounded-full mb-4 shadow-md"
          />
          <h2 className="text-lg font-semibold mb-1">Hi there!</h2>
          <p className="text-muted-foreground mb-6">
            Log {baby.name}&apos;s sleep or ask me anything
          </p>
          <div className="flex flex-col gap-2 w-full max-w-sm">
            <Suggestions className="flex-wrap justify-center">
              <Suggestion
                suggestion="She woke up at 7am this morning"
                onClick={onSendMessage}
                className="whitespace-normal h-auto py-2"
              />
              <Suggestion
                suggestion="Just put her down for a nap"
                onClick={onSendMessage}
                className="whitespace-normal h-auto py-2"
              />
              <Suggestion
                suggestion="What should bedtime be tonight?"
                onClick={onSendMessage}
                className="whitespace-normal h-auto py-2"
              />
            </Suggestions>
          </div>
        </motion.div>
      )}

      {timelineItems.map((item, index) => {
        const currentTimestamp = getTimelineItemTimestamp(item)
        const prevItem = index > 0 ? timelineItems[index - 1] : null
        const prevTimestamp = prevItem ? getTimelineItemTimestamp(prevItem) : null

        const currentDateKey = currentTimestamp ? getDateKey(currentTimestamp) : null
        const prevDateKey = prevTimestamp ? getDateKey(prevTimestamp) : null
        const showDateHeader = currentDateKey && currentDateKey !== prevDateKey

        if (item.kind === 'sleep_event') {
          const { event } = item
          const config = eventConfig[event.event_type] || {
            icon: '•',
            label: event.event_type,
            color: 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700'
          }

          return (
            <motion.div
              key={`event-${event.id}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2 }}
            >
              {showDateHeader && (
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">
                    {formatDateHeader(currentTimestamp!)}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => onEventClick(event)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs border shadow-sm ${config.color} hover:shadow-md active:scale-95 transition-all duration-200 cursor-pointer`}
                >
                  <span className="text-base">{config.icon}</span>
                  <span className="font-medium">{config.label}</span>
                  <span className="text-muted-foreground">
                    {formatTime(event.event_time)}
                    {event.event_type === 'night_wake' && event.end_time && (
                      <> - {formatTime(event.end_time)}</>
                    )}
                  </span>
                  {event.event_type === 'night_wake' && event.end_time && (
                    <span className="text-muted-foreground">
                      ({Math.round(calculateDurationMinutes(event.event_time, event.end_time))}m)
                    </span>
                  )}
                  {event.context && (
                    <span className="text-muted-foreground">· {event.context}</span>
                  )}
                </button>
              </div>
            </motion.div>
          )
        }

        if (item.kind === 'sleep_plan') {
          const { plan } = item
          return (
            <div key={`plan-${plan.id}`}>
              {showDateHeader && (
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">
                    {formatDateHeader(currentTimestamp!)}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}
              <SleepPlanCard plan={plan} defaultOpen={plan.is_active} />
            </div>
          )
        }

        const { message } = item
        const isLastItem = index === timelineItems.length - 1
        const isStreaming = isLastItem && status === 'streaming' && message.role === 'assistant'
        const text = getMessageText(message)
        const messageTime = message.createdAt ? formatTime(message.createdAt) : null

        return (
          <motion.div
            key={message.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {showDateHeader && (
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">
                  {formatDateHeader(currentTimestamp!)}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            <Message from={message.role}>
              <MessageContent
                className={message.role === 'user' ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100 shadow-sm'}
              >
                {message.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{text}</p>
                ) : (
                  <div className="space-y-2">
                    {renderMessageParts(message, isStreaming)}
                  </div>
                )}
              </MessageContent>
              {messageTime && (
                <span className="text-[10px] text-muted-foreground px-1 group-[.is-user]:self-end">
                  {messageTime}
                </span>
              )}
            </Message>
          </motion.div>
        )
      })}
    </>
  )
}
