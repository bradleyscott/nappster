'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="text-center space-y-4 max-w-md">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground text-sm">
          An unexpected error occurred. Your data is safe.
        </p>
        <Button onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  )
}
