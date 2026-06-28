'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function BackButton() {
  const [isNavigating, setIsNavigating] = useState(false)
  const router = useRouter()

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsNavigating(true)
    router.push('/')
  }

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      asChild
      disabled={isNavigating}
      className="rounded-full bg-white text-[var(--text-secondary)] shadow-[var(--shadow-sm)] hover:bg-white/80 hover:text-[var(--text)]"
    >
      <Link href="/" onClick={handleClick}>
        {isNavigating ? (
          <Loader2 className="size-6 animate-spin" />
        ) : (
          <ArrowLeft className="size-6" strokeWidth={2.5} />
        )}
      </Link>
    </Button>
  )
}
