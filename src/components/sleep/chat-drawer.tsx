'use client'

import { useState, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ChatDrawerProps {
  /** Chat messages from useChat */
  children: React.ReactNode
  /** Send a new message */
  onSendMessage: (text: string) => void
  /** Whether the chat is loading/streaming */
  isStreaming?: boolean
  /** Optional badge to show unread count / new messages */
  badge?: number
  className?: string
}

export function ChatDrawer({
  children,
  onSendMessage,
  isStreaming,
  badge,
  className,
}: ChatDrawerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || isStreaming) return
    onSendMessage(text)
    setInput('')
    // Reset textarea height after sending
    const el = inputRef.current
    if (el) el.style.height = 'auto'
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  return (
    <div className={cn('', className)}>
      {/* FAB — hidden when drawer is open */}
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed bottom-6 right-5 z-15 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] shadow-[0_4px_20px_rgba(124,77,255,0.35)] transition-all duration-200 active:scale-90',
          isOpen && 'pointer-events-none scale-0 opacity-0'
        )}
        aria-label="Open chat"
      >
        <span className="text-2xl font-bold">💬</span>
        {badge && badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--rose)] px-1 text-[10px] font-extrabold text-white shadow-md">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </button>

      {/* Overlay */}
      <div
        className={cn(
          'fixed inset-0 z-8 bg-black/15 transition-opacity duration-300',
          isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={() => setIsOpen(false)}
      />

      {/* Drawer */}
      <div
        className={cn(
          'fixed bottom-0 left-0 right-0 z-14 flex max-h-[85dvh] flex-col rounded-t-[var(--radius-xl)] bg-white shadow-[0_-8px_40px_rgba(45,43,58,0.15)] transition-transform duration-400 ease-[cubic-bezier(0.32,0.72,0,1)]',
          isOpen ? 'translate-y-0' : 'translate-y-full'
        )}
      >
        {/* Immersive header */}
        <div className="relative bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] px-5 pt-3 text-white">
          {/* Handle */}
          <div className="mx-auto mb-5 h-1 w-10 shrink-0 rounded-full bg-white/40" />

          <div className="flex items-start justify-between pb-4">
            {/* AI identity */}
            <div className="flex items-center gap-3.5">
              <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-white/20 text-2xl shadow-[0_6px_20px_rgba(0,0,0,0.15)] backdrop-blur-sm">
                🌙
              </div>
              <div>
                <div className="text-[1.15rem] font-black leading-tight">
                  Nappster
                </div>
                <div className="flex items-center gap-1.5 text-xs font-bold text-white/80">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--mint)] opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--mint)]" />
                  </span>
                  Sleep coach · Online
                </div>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={() => setIsOpen(false)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-2xl font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] transition-transform active:scale-90 hover:bg-white/25"
              aria-label="Close chat"
            >
              ×
            </button>
          </div>
        </div>

        {/* Wave transition */}
        <div
          className="h-7 w-full shrink-0 bg-white"
          style={{ borderRadius: '50% 50% 0 0 / 100% 100% 0 0', marginTop: '-14px' }}
        />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {children}
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="flex items-end gap-2 border-t border-[#F0EDF5] bg-white px-4 py-3"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Ask about sleep..."
            rows={1}
            className="min-h-[48px] flex-1 resize-none overflow-hidden rounded-[20px] border-2 border-[var(--lavender-light)] bg-[var(--lavender-bg)] px-4 py-3 text-sm font-semibold text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)] transition-colors duration-100"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-all duration-100 active:scale-90',
              input.trim() && !isStreaming
                ? 'bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] text-white shadow-[0_4px_14px_rgba(124,77,255,0.25)]'
                : 'bg-[#F0EDF5] text-[var(--text-muted)]'
            )}
          >
            {isStreaming ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--lavender)] border-t-transparent" />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2L11 13" />
                <path d="M22 2L15 22L11 13L2 9L22 2Z" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
