'use client'

import { useEffect, useRef, useCallback, useState } from 'react'
import { RealtimeChannel, RealtimePostgresChangesPayload, REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { SleepEvent, ChatMessage, SleepPlanRow } from '@/types/database'

type ChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

interface RealtimeSyncOptions {
  babyId: string
  enabled?: boolean
  onSleepEventChange?: (event: SleepEvent, changeType: ChangeEvent) => void
  onChatMessageChange?: (message: ChatMessage, changeType: ChangeEvent) => void
  onSleepPlanChange?: (plan: SleepPlanRow, changeType: ChangeEvent) => void
  onConnectionChange?: (status: ConnectionStatus) => void
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

  // Keep refs up to date
  useEffect(() => {
    onSleepEventChangeRef.current = onSleepEventChange
    onChatMessageChangeRef.current = onChatMessageChange
    onSleepPlanChangeRef.current = onSleepPlanChange
    onConnectionChangeRef.current = onConnectionChange
  })

  const updateConnectionStatus = useCallback(
    (status: ConnectionStatus, error?: Error) => {
      setState({ connectionStatus: status, lastError: error ?? null })
      onConnectionChangeRef.current?.(status)
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
        case 'sleep_events':
          onSleepEventChangeRef.current?.(record as unknown as SleepEvent, changeType)
          break
        case 'chat_messages':
          onChatMessageChangeRef.current?.(record as unknown as ChatMessage, changeType)
          break
        case 'sleep_plans':
          onSleepPlanChangeRef.current?.(record as unknown as SleepPlanRow, changeType)
          break
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
          case 'sleep_events':
            onSleepEventChangeRef.current?.(record as unknown as SleepEvent, 'DELETE')
            break
          case 'chat_messages':
            onChatMessageChangeRef.current?.(record as unknown as ChatMessage, 'DELETE')
            break
          case 'sleep_plans':
            onSleepPlanChangeRef.current?.(record as unknown as SleepPlanRow, 'DELETE')
            break
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
