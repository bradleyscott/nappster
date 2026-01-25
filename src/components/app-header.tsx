'use client'

import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { Baby as BabyIcon } from 'lucide-react'
import { Baby } from '@/types/database'
import { formatAge } from '@/lib/sleep-utils'
import { Button } from '@/components/ui/button'

interface AppHeaderProps {
  baby: Baby
  onSignOut: () => void
}

/**
 * Unified app header component displaying baby info, settings link, and sign out.
 * Used by the main chat interface.
 */
export function AppHeader({ baby, onSignOut }: AppHeaderProps) {
  return (
    <header className="border-b">
      <div className="container max-w-lg mx-auto px-4 py-3 flex justify-between items-center">
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
          <Button variant="ghost" size="icon" asChild>
            <Link href="/settings">
              <BabyIcon className="h-4 w-4" />
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  )
}
