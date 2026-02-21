'use client'

import { useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'

const isMockMode = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'

function getSnapshot(): '1' | '2' {
  if (typeof window === 'undefined') return '1'
  return localStorage.getItem('mockUserId') === '2' ? '2' : '1'
}

function getServerSnapshot(): '1' | '2' {
  return '1'
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

export function MockUserToggle() {
  const activeUser = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  const router = useRouter()

  if (!isMockMode) return null

  const handleToggle = () => {
    const newUser = activeUser === '1' ? '2' : '1'
    if (newUser === '2') {
      localStorage.setItem('mockUserId', '2')
    } else {
      localStorage.removeItem('mockUserId')
    }
    window.dispatchEvent(new StorageEvent('storage'))
    router.refresh()
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={handleToggle}
        className="bg-amber-500 text-white text-xs font-mono px-3 py-1.5 rounded-full shadow-lg hover:bg-amber-600 transition-colors"
      >
        {activeUser === '1' ? 'dev@example.com' : 'dev2@example.com'}
      </button>
    </div>
  )
}
