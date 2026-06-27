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
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className={cn('', className)}>
      {/* FAB */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'fixed bottom-6 right-5 z-15 flex h-14 w-14 items-center justify-center rounded-full shadow-[0_4px_20px_rgba(124,77,255,0.35)] transition-all duration-200 active:scale-90',
          isOpen
            ? 'bg-white shadow-[0_2px_12px_rgba(45,43,58,0.12)]'
            : 'bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF]'
        )}
        aria-label={isOpen ? 'Close chat' : 'Open chat'}
      >
        <span
          className={cn(
            'text-2xl font-700 transition-transform duration-200',
            isOpen && 'rotate-45 text-[var(--text)]'
          )}
        >
          {isOpen ? '+' : '💬'}
        </span>
        {!isOpen && badge && badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--rose)] px-1 text-[10px] font-800 text-white shadow-md">
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
        {/* Handle */}
        <div className="mx-auto mt-3 mb-1 h-1 w-10 shrink-0 rounded-full bg-[#DDD]" />

        {/* Header */}
        <div className="flex items-center gap-2 px-5 pb-3">
          <span className="text-lg">💬</span>
          <span className="text-base font-800 text-[var(--text)]">Chat with Nappster</span>
          <span className="relative flex h-2 w-2 ml-1">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--mint)] opacity-40" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--mint)]" />
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {/*
            The parent passes the Conversation component as children.
            This is the existing chat message rendering.
          */}
          {children}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-[#F0EDF5] px-4 py-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about sleep..."
            rows={1}
            className="flex-1 resize-none rounded-xl border-2 border-[#EEE] px-4 py-2.5 text-sm font-600 text-[var(--text)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--lavender)] transition-colors duration-100"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all duration-100',
              input.trim() && !isStreaming
                ? 'bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] text-white shadow-[0_2px_8px_rgba(124,77,255,0.25)] active:scale-90'
                : 'bg-[#F0EDF5] text-[var(--text-muted)]'
            )}
          >
            {isStreaming ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--lavender)] border-t-transparent" />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
