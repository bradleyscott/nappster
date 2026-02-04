'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { RealtimeChannel, RealtimePostgresChangesPayload, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/client'
import { SleepEvent, ChatMessage, SleepPlanRow } from '@/types/database'

type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

// Zod schemas for runtime validation of realtime payloads
const sleepEventSchema = z.object({
  id: z.string(),
  baby_id: z.string(),
  event_type: z.string(),
  event_time: z.string(),
  end_time: z.string().nullable(),
  context: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
})

const chatMessageSchema = z.object({
  id: z.string(),
  baby_id: z.string(),
  message_id: z.string(),
  role: z.string(),
  parts: z.unknown(),
  created_at: z.string(),
})

const sleepPlanSchema = z.object({
  id: z.string(),
  baby_id: z.string(),
  current_state: z.string(),
  next_action: z.unknown(),
  schedule: z.unknown(),
  target_bedtime: z.string(),
  summary: z.string(),
  events_hash: z.string(),
  plan_date: z.string(),
  is_active: z.boolean(),
  created_by: z.string().nullable(),
  created_at: z.string(),
})

interface RealtimeSyncOptions {
  babyId: string
  enabled?: boolean
  onSleepEventChange?: (event: SleepEvent, changeType: ChangeEvent) => void
  onChatMessageChange?: (message: ChatMessage, changeType: ChangeEvent) => void
  onSleepPlanChange?: (plan: SleepPlanRow, changeType: ChangeEvent) => void
  onConnectionChange?: (status: ConnectionStatus) => void
  // Called when tab becomes visible again or connection is restored after disconnect
  // Use this to refresh data that may have been missed while backgrounded
  onRefreshData?: () => void
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

type BroadcastTable = 'sleep_events' | 'chat_messages' | 'sleep_plans'

interface ConnectionState {
  connectionStatus: ConnectionStatus
  lastError: Error | null
}

interface RealtimeSyncResult extends ConnectionState {
  // Broadcast a delete event to other clients (workaround for RLS blocking postgres_changes DELETE)
  broadcastDelete: (table: BroadcastTable, record: SleepEvent | ChatMessage | SleepPlanRow) => Promise<void>
}

export function useRealtimeSync(options: RealtimeSyncOptions): RealtimeSyncResult {
  const {
    babyId,
    enabled = true,
    onSleepEventChange,
    onChatMessageChange,
    onSleepPlanChange,
    onConnectionChange,
    onRefreshData,
  } = options

  const [state, setState] = useState<ConnectionState>({
    connectionStatus: 'disconnected',
    lastError: null,
  })

  const channelRef = useRef<RealtimeChannel | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 10

  // Store callbacks in refs to avoid re-subscribing when they change
  const onSleepEventChangeRef = useRef(onSleepEventChange)
  const onChatMessageChangeRef = useRef(onChatMessageChange)
  const onSleepPlanChangeRef = useRef(onSleepPlanChange)
  const onConnectionChangeRef = useRef(onConnectionChange)
  const onRefreshDataRef = useRef(onRefreshData)

  // Track if we were previously disconnected (for refresh on reconnect)
  const wasDisconnectedRef = useRef(false)

  // Keep refs up to date
  useEffect(() => {
    onSleepEventChangeRef.current = onSleepEventChange
    onChatMessageChangeRef.current = onChatMessageChange
    onSleepPlanChangeRef.current = onSleepPlanChange
    onConnectionChangeRef.current = onConnectionChange
    onRefreshDataRef.current = onRefreshData
  })

  const updateConnectionStatus = useCallback(
    (status: ConnectionStatus, error?: Error) => {
      setState((prev) => {
        // Track if we're transitioning from disconnected/error to connected
        const wasDisconnected = prev.connectionStatus === 'disconnected' || prev.connectionStatus === 'error'
        if (wasDisconnected && status === 'connected') {
          // Mark that we were disconnected so we can refresh data
          wasDisconnectedRef.current = true
        }
        return { connectionStatus: status, lastError: error ?? null }
      })
      onConnectionChangeRef.current?.(status)

      // Trigger refresh when reconnecting after a disconnect
      if (status === 'connected' && wasDisconnectedRef.current) {
        console.log('[Realtime] Reconnected after disconnect - triggering refresh')
        wasDisconnectedRef.current = false
        onRefreshDataRef.current?.()
      }
    },
    []
  )

  const handleChange = useCallback(
    (
      payload: RealtimePostgresChangesPayload<{ [key: string]: unknown }>,
      table: string
    ) => {
      const changeType = payload.eventType as ChangeEvent
      const record = changeType === 'DELETE' ? payload.old : payload.new

      switch (table) {
        case 'sleep_events': {
          const parsed = sleepEventSchema.safeParse(record)
          if (parsed.success) {
            onSleepEventChangeRef.current?.(parsed.data as SleepEvent, changeType)
          }
          break
        }
        case 'chat_messages': {
          const parsed = chatMessageSchema.safeParse(record)
          if (parsed.success) {
            onChatMessageChangeRef.current?.(parsed.data as ChatMessage, changeType)
          }
          break
        }
        case 'sleep_plans': {
          const parsed = sleepPlanSchema.safeParse(record)
          if (parsed.success) {
            onSleepPlanChangeRef.current?.(parsed.data as SleepPlanRow, changeType)
          }
          break
        }
      }
    },
    []
  )

  useEffect(() => {
    // Skip in mock mode or if disabled
    if (!enabled || process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      return
    }

    const supabase = createClient()
    const channelName = `baby-sync-${babyId}`

    // Cleanup previous channel
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
    }

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sleep_events',
          filter: `baby_id=eq.${babyId}`,
        },
        (payload) => handleChange(payload, 'sleep_events')
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `baby_id=eq.${babyId}`,
        },
        (payload) => handleChange(payload, 'chat_messages')
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sleep_plans',
          filter: `baby_id=eq.${babyId}`,
        },
        (payload) => handleChange(payload, 'sleep_plans')
      )
      // Listen for broadcast delete events (workaround for RLS blocking postgres_changes DELETE)
      .on('broadcast', { event: 'delete' }, (payload) => {
        const { table, record } = payload.payload as { table: string; record: Record<string, unknown> }
        switch (table) {
          case 'sleep_events': {
            const parsed = sleepEventSchema.safeParse(record)
            if (parsed.success) {
              onSleepEventChangeRef.current?.(parsed.data as SleepEvent, 'DELETE')
            }
            break
          }
          case 'chat_messages': {
            const parsed = chatMessageSchema.safeParse(record)
            if (parsed.success) {
              onChatMessageChangeRef.current?.(parsed.data as ChatMessage, 'DELETE')
            }
            break
          }
          case 'sleep_plans': {
            const parsed = sleepPlanSchema.safeParse(record)
            if (parsed.success) {
              onSleepPlanChangeRef.current?.(parsed.data as SleepPlanRow, 'DELETE')
            }
            break
          }
        }
      })
      .subscribe((status, error) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          updateConnectionStatus('connected')
          reconnectAttempts.current = 0
        } else if (status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR) {
          updateConnectionStatus('error', error ?? undefined)
          scheduleReconnect()
        } else if (status === REALTIME_SUBSCRIBE_STATES.CLOSED) {
          updateConnectionStatus('disconnected')
        } else if (status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT) {
          updateConnectionStatus('error', new Error('Connection timed out'))
          scheduleReconnect()
        }
      })

    channelRef.current = channel

    function scheduleReconnect() {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }

      if (reconnectAttempts.current >= maxReconnectAttempts) {
        return
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, ... max 30s
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000)
      reconnectAttempts.current++

      reconnectTimeoutRef.current = setTimeout(() => {
        if (channelRef.current) {
          channelRef.current.subscribe()
        }
      }, delay)
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [babyId, enabled, handleChange, updateConnectionStatus])

  // Handle visibility change - refresh data when tab becomes visible
  // This catches cases where WebSocket events were missed while backgrounded
  useEffect(() => {
    if (!enabled || process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      return
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible - refresh data to catch any missed updates
        console.log('[Realtime] Tab became visible - triggering refresh')
        onRefreshDataRef.current?.()
      }
    }

    // Also handle window focus for additional coverage (e.g., switching between apps)
    const handleFocus = () => {
      console.log('[Realtime] Window focused - triggering refresh')
      onRefreshDataRef.current?.()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [enabled])

  // Broadcast a delete event to other clients
  // This is needed because RLS prevents postgres_changes from broadcasting DELETE events
  const broadcastDelete = useCallback(
    async (table: BroadcastTable, record: SleepEvent | ChatMessage | SleepPlanRow) => {
      if (!channelRef.current) return
      await channelRef.current.send({
        type: 'broadcast',
        event: 'delete',
        payload: { table, record },
      })
    },
    []
  )

  return { ...state, broadcastDelete }
}
