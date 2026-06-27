import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TimelineRenderer } from '../timeline-renderer'
import type { Baby, SleepEvent, SleepPlanRow } from '@/types/database'
import type { ChatMessageData } from '@/lib/hooks/use-chat-history'

const baby: Baby = {
  id: 'baby-1',
  name: 'Luna',
  birth_date: '2023-06-15',
  sleep_training_method: null,
  pattern_notes: null,
  created_at: '2023-06-15T00:00:00Z',
}

const makeEvent = (overrides: Partial<SleepEvent> & { event_type: string; event_time: string }): SleepEvent => ({
  id: `evt-${overrides.event_type}-${overrides.event_time}`,
  baby_id: 'baby-1',
  end_time: null,
  context: null,
  notes: null,
  created_at: overrides.event_time,
  ...overrides,
})

const makeMessage = (overrides: Partial<ChatMessageData> & { id: string; role: 'user' | 'assistant'; text: string }): ChatMessageData => ({
  parts: [{ type: 'text', text: overrides.text }],
  createdAt: '2024-01-15T08:00:00Z',
  ...overrides,
})

const makePlan = (overrides: Partial<SleepPlanRow> = {}): SleepPlanRow => ({
  id: 'plan-1',
  baby_id: 'baby-1',
  current_state: 'daytime_awake',
  next_action: { label: 'Nap 1', timeWindow: '9:00am', isUrgent: false },
  schedule: [{ type: 'nap', label: 'Nap 1', timeWindow: '9:00am', status: 'upcoming', notes: '' }],
  target_bedtime: '7:00pm',
  summary: 'Plan summary',
  events_hash: 'abc',
  plan_date: '2024-01-15',
  is_active: true,
  created_by: null,
  created_at: '2024-01-15T08:00:00Z',
  ...overrides,
})

describe('TimelineRenderer', () => {
  it('renders empty state when no messages or events', () => {
    render(
      <TimelineRenderer
        timelineItems={[]}
        allMessages={[]}
        allSleepEvents={[]}
        allSleepPlans={[]}
        baby={baby}
        status="ready"
        isLoadingHistory={false}
        hasMoreHistory={false}
        onLoadMoreHistory={vi.fn()}
        onSendMessage={vi.fn()}
        onEventClick={vi.fn()}
      />
    )

    expect(screen.getByText('Hi there!')).toBeInTheDocument()
    expect(screen.getByText(/Log Luna's sleep or ask me anything/i)).toBeInTheDocument()
  })

  it('renders a user message', () => {
    const messages = [makeMessage({ id: 'msg-1', role: 'user', text: 'She woke up at 7am' })]
    render(
      <TimelineRenderer
        timelineItems={messages.map(m => ({ kind: 'message' as const, message: m }))}
        allMessages={messages}
        allSleepEvents={[]}
        allSleepPlans={[]}
        baby={baby}
        status="ready"
        isLoadingHistory={false}
        hasMoreHistory={false}
        onLoadMoreHistory={vi.fn()}
        onSendMessage={vi.fn()}
        onEventClick={vi.fn()}
      />
    )

    expect(screen.getByText('She woke up at 7am')).toBeInTheDocument()
  })

  it('renders a sleep event and calls onEventClick when clicked', () => {
    const events = [makeEvent({ event_type: 'wake', event_time: '2024-01-15T07:00:00Z' })]
    const onEventClick = vi.fn()

    render(
      <TimelineRenderer
        timelineItems={events.map(e => ({ kind: 'sleep_event' as const, event: e }))}
        allMessages={[]}
        allSleepEvents={events}
        allSleepPlans={[]}
        baby={baby}
        status="ready"
        isLoadingHistory={false}
        hasMoreHistory={false}
        onLoadMoreHistory={vi.fn()}
        onSendMessage={vi.fn()}
        onEventClick={onEventClick}
      />
    )

    const button = screen.getByRole('button', { name: /Woke up/i })
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(onEventClick).toHaveBeenCalledWith(events[0])
  })

  it('renders a sleep plan', () => {
    const plans = [makePlan()]
    render(
      <TimelineRenderer
        timelineItems={plans.map(p => ({ kind: 'sleep_plan' as const, plan: p }))}
        allMessages={[]}
        allSleepEvents={[]}
        allSleepPlans={plans}
        baby={baby}
        status="ready"
        isLoadingHistory={false}
        hasMoreHistory={false}
        onLoadMoreHistory={vi.fn()}
        onSendMessage={vi.fn()}
        onEventClick={vi.fn()}
      />
    )

    expect(screen.getByText('Sleep Plan')).toBeInTheDocument()
  })

  it('shows load more history button when hasMoreHistory is true', () => {
    const onLoadMoreHistory = vi.fn()
    render(
      <TimelineRenderer
        timelineItems={[]}
        allMessages={[]}
        allSleepEvents={[]}
        allSleepPlans={[]}
        baby={baby}
        status="ready"
        isLoadingHistory={false}
        hasMoreHistory={true}
        onLoadMoreHistory={onLoadMoreHistory}
        onSendMessage={vi.fn()}
        onEventClick={vi.fn()}
      />
    )

    const button = screen.getByRole('button', { name: /Load earlier messages/i })
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    expect(onLoadMoreHistory).toHaveBeenCalled()
  })
})
