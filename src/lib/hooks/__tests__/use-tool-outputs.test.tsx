import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useToolOutputs } from '../use-tool-outputs'
import type { SleepEvent, SleepPlanRow } from '@/types/database'
import type { UIMessage } from '@ai-sdk/react'

const makeTextMessage = (text: string): UIMessage => ({
  id: 'msg-1',
  role: 'user',
  content: text,
  parts: [{ type: 'text', text }],
  createdAt: new Date(),
})

const makeToolMessage = (parts: UIMessage['parts']): UIMessage => ({
  id: 'msg-2',
  role: 'assistant',
  content: '',
  parts,
  createdAt: new Date(),
})

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
        liveMessages: [makeTextMessage('Hello')],
        onSleepEventCreated,
        onSleepPlanUpdated,
      })
    )

    expect(onSleepEventCreated).not.toHaveBeenCalled()
    expect(onSleepPlanUpdated).not.toHaveBeenCalled()
  })

  it('extracts a created sleep event', () => {
    const event = { id: 'evt-1', event_type: 'wake' } as unknown as SleepEvent
    const message = makeToolMessage([
      {
        type: 'tool-createSleepEvent',
        state: 'output-available',
        output: { success: true, event },
      },
    ])

    renderHook(() =>
      useToolOutputs({
        liveMessages: [message],
        onSleepEventCreated,
        onSleepPlanUpdated,
      })
    )

    expect(onSleepEventCreated).toHaveBeenCalledWith(event)
  })

  it('extracts an updated sleep plan', () => {
    const plan = { id: 'plan-1', summary: 'New plan' } as unknown as SleepPlanRow
    const message = makeToolMessage([
      {
        type: 'tool-updateSleepPlan',
        state: 'output-available',
        output: { success: true, plan },
      },
    ])

    renderHook(() =>
      useToolOutputs({
        liveMessages: [message],
        onSleepEventCreated,
        onSleepPlanUpdated,
      })
    )

    expect(onSleepPlanUpdated).toHaveBeenCalledWith(plan)
  })

  it('ignores tool parts without output', () => {
    const message = makeToolMessage([
      {
        type: 'tool-createSleepEvent',
        state: 'input-available',
        input: {},
      },
    ])

    renderHook(() =>
      useToolOutputs({
        liveMessages: [message],
        onSleepEventCreated,
        onSleepPlanUpdated,
      })
    )

    expect(onSleepEventCreated).not.toHaveBeenCalled()
  })

  it('ignores unrelated tool types', () => {
    const message = makeToolMessage([
      {
        type: 'tool-updatePatternNotes',
        state: 'output-available',
        output: { success: true },
      },
    ])

    renderHook(() =>
      useToolOutputs({
        liveMessages: [message],
        onSleepEventCreated,
        onSleepPlanUpdated,
      })
    )

    expect(onSleepEventCreated).not.toHaveBeenCalled()
    expect(onSleepPlanUpdated).not.toHaveBeenCalled()
  })
})
