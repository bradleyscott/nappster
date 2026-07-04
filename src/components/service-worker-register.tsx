'use client'

import { useEffect } from 'react'
import { logInfo, logError } from '@/lib/error-reporting'

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      process.env.NODE_ENV === 'production'
    ) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          logInfo('service-worker', 'Service Worker registered with scope:', registration.scope)
        })
        .catch((error) => {
          logError('service-worker', 'Service Worker registration failed:', error)
        })
    }
  }, [])

  return null
}
