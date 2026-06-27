'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/error-reporting'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportError(error, { source: 'app-error-boundary' })
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] p-6">
      <div className="w-full max-w-xs rounded-[24px] bg-white p-8 text-center shadow-[var(--shadow-md)]">
        <div className="text-5xl">😵‍💫</div>
        <h2 className="mt-4 text-2xl font-black text-[var(--text)]">Something went wrong</h2>
        <p className="mt-2 text-sm font-bold leading-snug text-[var(--text-secondary)]">
          An unexpected error occurred. Your data is safe.
        </p>
        <button
          onClick={reset}
          className="mt-6 w-full rounded-2xl bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] py-3.5 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(124,77,255,0.25)] transition-transform active:scale-[0.97]"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
