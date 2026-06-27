'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { BarChart3, Baby as BabyIcon, Loader2 } from 'lucide-react'
import { Baby } from '@/types/database'
import { formatAge } from '@/lib/sleep-utils'

interface AppHeaderProps {
  baby: Baby
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * Minimal centered header that blends into the new playful dashboard.
 * Navigation actions float top-right; no heavy bar or border.
 */
export function AppHeader({ baby }: AppHeaderProps) {
  const router = useRouter()
  const [isNavigatingToSettings, setIsNavigatingToSettings] = useState(false)
  const [isNavigatingToTrends, setIsNavigatingToTrends] = useState(false)

  const handleSettingsClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsNavigatingToSettings(true)
    router.push('/settings')
  }

  const handleTrendsClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsNavigatingToTrends(true)
    router.push('/sleep-trends')
  }

  return (
    <header className="relative px-4 pt-3 pb-1">
      {/* Floating action buttons — vertically centered against the pill */}
      <div className="absolute right-8 top-1/2 flex -translate-y-1/2 gap-2">
        <Link
          href="/sleep-trends"
          onClick={handleTrendsClick}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--text-secondary)] shadow-[var(--shadow-sm)] active:scale-90 transition-transform"
          aria-label="Sleep trends"
        >
          {isNavigatingToTrends ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--lavender)]" />
          ) : (
            <BarChart3 className="h-4 w-4" />
          )}
        </Link>
        <Link
          href="/settings"
          onClick={handleSettingsClick}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--text-secondary)] shadow-[var(--shadow-sm)] active:scale-90 transition-transform"
          aria-label="Profile and family"
        >
          {isNavigatingToSettings ? (
            <Loader2 className="h-4 w-4 animate-spin text-[var(--lavender)]" />
          ) : (
            <BabyIcon className="h-4 w-4" />
          )}
        </Link>
      </div>

      {/* Rounded card header */}
      <div className="flex w-full min-h-[60px] flex-col items-center justify-center rounded-[22px] bg-white px-14 py-2.5 text-center shadow-[var(--shadow-sm)]">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.5px] text-[var(--text-muted)]">
          {getGreeting()}
        </span>
        <span className="text-lg font-black leading-tight text-[var(--text)]">{baby.name}</span>
        <span className="mt-0.5 inline-flex items-center rounded-full bg-[var(--lavender-bg)] px-2 py-0.5 text-[10px] font-extrabold text-[var(--lavender)]">
          {formatAge(baby.birth_date)}
        </span>
      </div>
    </header>
  )
}
