import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SleepDashboard } from '../sleep/sleep-dashboard'
import type { Baby, SleepEvent } from '@/types/database'

vi.mock('@/lib/hooks/use-now', () => ({
  useNow: () => new Date('2024-01-15T10:30:00Z'),
}))

const originalMatchMedia = window.matchMedia

beforeAll(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
})

afterAll(() => {
  window.matchMedia = originalMatchMedia
})

const baby: Baby = {
  id: 'baby-1',
  name: 'Test Baby',
  birth_date: '2023-06-15',
  pattern_notes: null,
  created_at: '2023-06-15T00:00:00Z',
}

const noop = vi.fn()

function renderDashboard(props: Partial<React.ComponentProps<typeof SleepDashboard>> = {}) {
  return render(
    <SleepDashboard
      baby={baby}
      currentState="daytime_awake"
      sleepPlan={null}
      timelineItems={[]}
      allEvents={[] as SleepEvent[]}
      chatMessages={null}
      isChatStreaming={false}
      onCreateEvent={noop}
      onUpdateEvent={noop}
      onDeleteEvent={noop}
      onSendMessage={noop}
      timezone="UTC"
      trendsNextNapHours={[]}
      trendsBedtimeHour={null}
      {...props}
    />
  )
}

describe('SleepDashboard', () => {
  it('shows the background generation indicator when isPlanGenerating is true', () => {
    renderDashboard({ isPlanGenerating: true })
    expect(screen.getByText(/Updating schedule/i)).toBeInTheDocument()
  })

  it('does not show the background generation indicator by default', () => {
    renderDashboard()
    expect(screen.queryByText(/Updating schedule/i)).not.toBeInTheDocument()
  })
})
