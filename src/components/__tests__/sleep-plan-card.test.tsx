import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SleepPlanCard } from '../sleep-plan-card'
import type { SleepPlanRow } from '@/types/database'

describe('SleepPlanCard', () => {
  const plan: SleepPlanRow = {
    id: 'plan-1',
    baby_id: 'baby-1',
    current_state: 'daytime_awake',
    next_action: { label: 'Nap 1', timeWindow: '9:00am', isUrgent: false },
    schedule: [
      { type: 'nap', label: 'Nap 1', timeWindow: '9:00am', status: 'completed', notes: '' },
      { type: 'nap', label: 'Nap 2', timeWindow: '1:00pm', status: 'upcoming', notes: '' },
      { type: 'bedtime', label: 'Bedtime', timeWindow: '7:00pm', status: 'upcoming', notes: '' },
    ],
    target_bedtime: '7:00pm',
    summary: 'A good day ahead.',
    events_hash: 'abc',
    plan_date: '2024-01-15',
    is_active: true,
    created_by: null,
    created_at: '2024-01-15T08:00:00Z',
  }

  beforeEach(() => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn(() => Promise.resolve()) },
    })
  })

  it('renders collapsed card with next action', () => {
    render(<SleepPlanCard plan={plan} />)
    expect(screen.getByText('Sleep Plan')).toBeInTheDocument()
    expect(screen.getByText(/Nap 1/)).toBeInTheDocument()
    expect(screen.getByText(/Bedtime 7:00pm/)).toBeInTheDocument()
  })

  it('expands to show schedule when clicked', async () => {
    render(<SleepPlanCard plan={plan} />)
    const button = screen.getByRole('button', { name: /Expand sleep plan/i })
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByText('A good day ahead.')).toBeInTheDocument()
      expect(screen.getByText('Nap 2')).toBeInTheDocument()
    })
  })

  it('copies plan to clipboard when share is clicked', async () => {
    render(<SleepPlanCard plan={plan} defaultOpen />)
    const shareButton = screen.getByRole('button', { name: /Copy sleep plan to clipboard/i })
    fireEvent.click(shareButton)

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled()
      expect(screen.getByText(/Copied to clipboard/i)).toBeInTheDocument()
    })
  })
})
