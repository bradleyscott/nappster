'use client'

import { useEffect } from 'react'

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    document.cookie = `timezone=${tz}; path=/; max-age=31536000; SameSite=Lax`
  }, [])

  return <>{children}</>
}
