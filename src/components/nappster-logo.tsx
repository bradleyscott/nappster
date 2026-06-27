import Image from 'next/image'
import { cn } from '@/lib/utils'

interface NappsterLogoProps {
  className?: string
  size?: number
}

export function NappsterLogo({ className, size = 120 }: NappsterLogoProps) {
  return (
    <Image
      src="/nappster.svg"
      alt="Nappster logo"
      width={size}
      height={size}
      unoptimized
      priority
      className={cn('shrink-0', className)}
    />
  )
}
