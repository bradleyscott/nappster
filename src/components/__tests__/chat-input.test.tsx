import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

  it('renders input and morning wake quick action from awaiting_morning_wake', () => {
    render(<ChatInput {...defaultProps} />)
    expect(screen.getByPlaceholderText('Ask about sleep...')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Morning Wake/i })).toBeInTheDocument()
  })

  it('calls onSendMessage when typing and submitting', async () => {
    const user = userEvent.setup()
    render(<ChatInput {...defaultProps} />)
    const input = screen.getByPlaceholderText('Ask about sleep...')
    await user.type(input, 'What time is bedtime?')
    await user.keyboard('{Enter}')

    expect(defaultProps.onSendMessage).toHaveBeenCalledWith('What time is bedtime?')
  })

  it('calls onCreateEvent for morning wake quick action', () => {
    render(<ChatInput {...defaultProps} />)
    const button = screen.getByRole('button', { name: /Morning Wake/i })
    fireEvent.click(button)

    expect(defaultProps.onCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'wake' })
    )
  })

  it('shows nap button from daytime_awake', () => {
    render(<ChatInput {...defaultProps} currentState="daytime_awake" />)
    expect(screen.getByRole('button', { name: /Start Nap/i })).toBeInTheDocument()
  })

  it('shows nap end button from daytime_napping', () => {
    render(<ChatInput {...defaultProps} currentState="daytime_napping" />)
    expect(screen.getByRole('button', { name: /End Nap/i })).toBeInTheDocument()
  })
})
