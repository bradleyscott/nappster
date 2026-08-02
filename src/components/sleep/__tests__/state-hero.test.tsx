import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StateHero } from '../state-hero'

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

const defaultProps = {
  accentColor: 'peach' as const,
  icon: 'sun',
  title: 'Awake & Playing',
  pills: [] as { label: string }[],
  countdown: { progress: 0.4, timeRemaining: '1h 12m', timeLabel: 'until next nap' },
  expectedLabel: { icon: 'cloud-sun', text: 'Next nap', time: '9:30am' },
}

describe('StateHero', () => {
  it('renders the expected label as static text when no explanation is provided', () => {
    render(<StateHero {...defaultProps} />)
    expect(screen.getByText('Next nap')).toBeInTheDocument()
    expect(screen.getByText('9:30am')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Next nap/i })).not.toBeInTheDocument()
  })

  it('renders the expected label as a tappable button when an explanation is provided', () => {
    render(<StateHero {...defaultProps} explanation="Pushed later to protect the wake window." source="plan" />)
    const button = screen.getByRole('button', { name: /Next nap 9:30am/i })
    expect(button).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('expands the explanation panel when the label is tapped', () => {
    render(<StateHero {...defaultProps} explanation="Pushed later to protect the wake window." source="plan" />)
    const button = screen.getByRole('button', { name: /Next nap 9:30am/i })
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Pushed later to protect the wake window.')).toBeInTheDocument()
    expect(screen.getByText(/Based on today's AI sleep plan/i)).toBeInTheDocument()
  })

  it('collapses the explanation panel when the label is tapped again', () => {
    render(<StateHero {...defaultProps} explanation="Pushed later to protect the wake window." source="plan" />)
    const button = screen.getByRole('button', { name: /Next nap 9:30am/i })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })
})
