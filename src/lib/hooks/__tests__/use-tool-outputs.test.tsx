import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useToolOutputs } from '../use-tool-outputs'
import type { SleepEvent, SleepPlanRow } from '@/types/database'
// Helper to construct valid-looking message parts that pass the runtime guards
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePart(type: string, state: string, output?: unknown): any {
  return { type, state, output, input: {} }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeMessage(role: 'user' | 'assistant', parts: any): any {
  return { id: 'msg-1', role, content: '', parts, createdAt: new Date() }
}

describe('useToolOutputs', () => {
  const onSleepEventCreated = vi.fn()
  const onSleepPlanUpdated = vi.fn()

  beforeEach(() => {
    onSleepEventCreated.mockClear()
    onSleepPlanUpdated.mockClear()
  })

  it('does nothing when there are no assistant messages', () => {
    renderHook(() =>
      useToolOutputs({
        liveMessages: [makeMessage('user', [])],
        onSleepEventCreated,
        onSleepPlanUpdated,
      })
    )

    expect(onSleepEventCreated).not.toHaveBeenCalled()
    expect(onSleepPlanUpdated).not.toHaveBeenCalled()
  })

  it('extracts a created sleep event', () => {
    const event = { id: 'evt-1', event_type: 'wake' } as SleepEvent
    const parts = [
      makePart('tool-createSleepEvent', 'output-available', {
        success: true,
        event,
      }),
    ]

    renderHook(() =>
      useToolOutputs({
        liveMessages: [makeMessage('assistant', parts)],
        onSleepEventCreated,
        onSleepPlanUpdated,
      })
    )

    expect(onSleepEventCreated).toHaveBeenCalledWith(event)
  })

  it('extracts an updated sleep plan', () => {
    const plan = { id: 'plan-1', summary: 'New plan' } as SleepPlanRow
    const parts = [
      makePart('tool-updateSleepPlan', 'output-available', {
        success: true,
        plan,
      }),
    ]

    renderHook(() =>
      useToolOutputs({
        liveMessages: [makeMessage('assistant', parts)],
        onSleepEventCreated,
        onSleepPlanUpdated,
      })
    )

    expect(onSleepPlanUpdated).toHaveBeenCalledWith(plan)
  })

  it('ignores tool parts without output', () => {
    const parts = [makePart('tool-createSleepEvent', 'input-available')]

    renderHook(() =>
      useToolOutputs({
        liveMessages: [makeMessage('assistant', parts)],
        onSleepEventCreated,
        onSleepPlanUpdated,
      })
    )

    expect(onSleepEventCreated).not.toHaveBeenCalled()
  })

  it('ignores unrelated tool types', () => {
    const parts = [
      makePart('tool-updatePatternNotes', 'output-available', {
        success: true,
      }),
    ]

    renderHook(() =>
      useToolOutputs({
        liveMessages: [makeMessage('assistant', parts)],
        onSleepEventCreated,
        onSleepPlanUpdated,
      })
    )

    expect(onSleepEventCreated).not.toHaveBeenCalled()
    expect(onSleepPlanUpdated).not.toHaveBeenCalled()
  })
})
