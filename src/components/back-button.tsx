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
    <Button variant="ghost" size="icon" asChild disabled={isNavigating}>
      <Link href="/" onClick={handleClick}>
        {isNavigating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ArrowLeft className="h-4 w-4" />
        )}
      </Link>
    </Button>
  )
}
