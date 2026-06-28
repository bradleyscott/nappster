import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatInput } from '../chat-input'
import type { SleepEvent } from '@/types/database'

describe('ChatInput', () => {
  const defaultProps = {
    babyId: 'baby-1',
    babyName: 'Luna',
    allEvents: [] as SleepEvent[],
    onSendMessage: vi.fn(),
    onCreateEvent: vi.fn(),
    status: 'ready' as const,
    sleepPlan: null,
    currentState: 'awaiting_morning_wake' as const,
    disabled: false,
  }

  it('renders input and bedtime quick action from awaiting_morning_wake', async () => {
    // The empty-events startup state prompts the user to log the baby's current
    // overnight sleep ("Log Bedtime"), not a "Good Morning" morning-wake action.
    render(<ChatInput {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask about sleep...')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Log Bedtime/i })).toBeInTheDocument()
  })

  it('calls onSendMessage when typing and submitting', async () => {
    const user = userEvent.setup()
    render(<ChatInput {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Ask about sleep...')).toBeInTheDocument()
    })
    const input = screen.getByPlaceholderText('Ask about sleep...')
    await user.type(input, 'What time is bedtime?')
    await user.keyboard('{Enter}')

    await waitFor(() => {
      expect(defaultProps.onSendMessage).toHaveBeenCalledWith('What time is bedtime?')
    })
  })

  it('calls onCreateEvent for the bedtime quick action', async () => {
    render(<ChatInput {...defaultProps} />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Log Bedtime/i })).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Log Bedtime/i }))

    await waitFor(() => {
      expect(defaultProps.onCreateEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event_type: 'bedtime' })
      )
    })
  })

  it('shows nap button from daytime_awake', async () => {
    render(<ChatInput {...defaultProps} currentState="daytime_awake" />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Start Nap/i })).toBeInTheDocument()
    })
  })

  it('shows nap end button from daytime_napping', async () => {
    render(<ChatInput {...defaultProps} currentState="daytime_napping" />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /End Nap/i })).toBeInTheDocument()
    })
  })
})
