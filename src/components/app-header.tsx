'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { format } from 'date-fns'
import { Baby as BabyIcon, BarChart3, Loader2 } from 'lucide-react'
import { Baby } from '@/types/database'
import { formatAge } from '@/lib/sleep-utils'
import { Button } from '@/components/ui/button'

interface AppHeaderProps {
  baby: Baby
  onSignOut: () => void | Promise<void>
}

/**
 * Unified app header component displaying baby info, settings link, and sign out.
 * Used by the main chat interface.
 */
export function AppHeader({ baby, onSignOut }: AppHeaderProps) {
  const router = useRouter()
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isNavigatingToSettings, setIsNavigatingToSettings] = useState(false)
  const [isNavigatingToTrends, setIsNavigatingToTrends] = useState(false)

  const handleSignOut = async () => {
    setIsSigningOut(true)
    await onSignOut()
  }

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
    <header className="border-b">
      <div className="container max-w-lg md:max-w-2xl lg:max-w-4xl mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Image
            src="/nappster.png"
            alt="Nappster"
            width={40}
            height={40}
            className="rounded-full"
          />
          <div>
            <p className="text-sm text-muted-foreground">{format(new Date(), 'EEEE, MMM d')}</p>
            <h1 className="text-lg font-semibold">{baby.name} · {formatAge(baby.birth_date)}</h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" asChild disabled={isSigningOut || isNavigatingToTrends}>
            <Link href="/sleep-trends" onClick={handleTrendsClick}>
              {isNavigatingToTrends ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4" />
              )}
            </Link>
          </Button>
          <Button variant="ghost" size="icon" asChild disabled={isSigningOut || isNavigatingToSettings}>
            <Link href="/settings" onClick={handleSettingsClick}>
              {isNavigatingToSettings ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <BabyIcon className="h-4 w-4" />
              )}
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={isSigningOut}>
            {isSigningOut ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Signing out...
              </>
            ) : (
              'Sign out'
            )}
          </Button>
        </div>
      </div>
    </header>
  )
}
