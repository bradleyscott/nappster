import { cn } from '@/lib/utils'

interface NappsterLogoProps {
  className?: string
  size?: number
}

export function NappsterLogo({ className, size = 120 }: NappsterLogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-label="Nappster logo"
    >
      <defs>
        <linearGradient id="nappster-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#B48BFF" />
          <stop offset="100%" stopColor="#7C4DFF" />
        </linearGradient>
        <linearGradient id="nappster-headphone" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E8D8FF" />
          <stop offset="100%" stopColor="#D8C6FF" />
        </linearGradient>
        <linearGradient id="nappster-pacifier" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6FCF97" />
          <stop offset="100%" stopColor="#4CAF74" />
        </linearGradient>
      </defs>

      <circle cx="100" cy="100" r="96" fill="url(#nappster-bg)" />
      <circle cx="100" cy="100" r="86" fill="#FFF8F0" />

      <path
        d="M 42 100 C 42 50 158 50 158 100"
        fill="none"
        stroke="#B48BFF"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M 42 100 C 42 50 158 50 158 100"
        fill="none"
        stroke="#D8C6FF"
        strokeWidth="5"
        strokeLinecap="round"
      />

      <ellipse
        cx="100"
        cy="105"
        rx="48"
        ry="52"
        fill="#FFF8F0"
        stroke="#2D2B3A"
        strokeWidth="4"
      />

      <path
        d="M 92 62 C 92 50 108 50 108 62 C 108 70 100 72 100 80"
        fill="none"
        stroke="#2D2B3A"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <path
        d="M 72 100 Q 82 108 92 100"
        fill="none"
        stroke="#2D2B3A"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M 108 100 Q 118 108 128 100"
        fill="none"
        stroke="#2D2B3A"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <path
        d="M 92 122 Q 100 130 108 122"
        fill="none"
        stroke="#2D2B3A"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <rect
        x="28"
        y="82"
        width="22"
        height="42"
        rx="10"
        fill="url(#nappster-headphone)"
        stroke="#B48BFF"
        strokeWidth="3"
      />
      <rect
        x="150"
        y="82"
        width="22"
        height="42"
        rx="10"
        fill="url(#nappster-headphone)"
        stroke="#B48BFF"
        strokeWidth="3"
      />

      <circle
        cx="100"
        cy="138"
        r="14"
        fill="url(#nappster-pacifier)"
        stroke="#2D2B3A"
        strokeWidth="3"
      />
      <circle cx="92" cy="132" r="3" fill="#FFF8F0" />
      <circle cx="108" cy="132" r="3" fill="#FFF8F0" />
      <path
        d="M 100 138 L 100 150"
        fill="none"
        stroke="#2D2B3A"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M 88 150 Q 100 158 112 150"
        fill="none"
        stroke="#2D2B3A"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
