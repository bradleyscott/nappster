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
          <stop offset="100%" stopColor="#CDB2FF" />
        </linearGradient>
        <linearGradient id="nappster-pacifier" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6FCF97" />
          <stop offset="100%" stopColor="#4CAF74" />
        </linearGradient>
      </defs>

      {/* Outer ring */}
      <circle cx="100" cy="100" r="98" fill="url(#nappster-bg)" />
      {/* Inner cream circle */}
      <circle cx="100" cy="100" r="88" fill="#FFF8F0" />

      {/* Headphones band */}
      <path
        d="M 38 102 C 38 42 162 42 162 102"
        fill="none"
        stroke="#B48BFF"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M 38 102 C 38 42 162 42 162 102"
        fill="none"
        stroke="#D8C6FF"
        strokeWidth="6"
        strokeLinecap="round"
      />

      {/* Baby head */}
      <ellipse
        cx="100"
        cy="106"
        rx="52"
        ry="56"
        fill="#FFF8F0"
        stroke="#2D2B3A"
        strokeWidth="4"
      />

      {/* Hair curl */}
      <path
        d="M 88 60 C 84 46 104 44 104 58 C 104 68 94 70 96 82"
        fill="none"
        stroke="#2D2B3A"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Closed eyes */}
      <path
        d="M 70 102 Q 80 110 90 102"
        fill="none"
        stroke="#2D2B3A"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M 110 102 Q 120 110 130 102"
        fill="none"
        stroke="#2D2B3A"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Smile */}
      <path
        d="M 92 126 Q 100 134 108 126"
        fill="none"
        stroke="#2D2B3A"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Headphone ear cups */}
      <rect
        x="24"
        y="82"
        width="26"
        height="48"
        rx="12"
        fill="url(#nappster-headphone)"
        stroke="#B48BFF"
        strokeWidth="3.5"
      />
      <rect
        x="150"
        y="82"
        width="26"
        height="48"
        rx="12"
        fill="url(#nappster-headphone)"
        stroke="#B48BFF"
        strokeWidth="3.5"
      />
      {/* Inner ear cup detail */}
      <rect x="30" y="92" width="14" height="28" rx="6" fill="#FFF8F0" opacity="0.6" />
      <rect x="156" y="92" width="14" height="28" rx="6" fill="#FFF8F0" opacity="0.6" />

      {/* Pacifier */}
      {/* Shield / ring */}
      <ellipse
        cx="100"
        cy="142"
        rx="18"
        ry="16"
        fill="#FFF8F0"
        stroke="#2D2B3A"
        strokeWidth="3.5"
      />
      {/* Button */}
      <circle
        cx="100"
        cy="142"
        r="10"
        fill="url(#nappster-pacifier)"
        stroke="#2D2B3A"
        strokeWidth="3"
      />
      {/* Button shine */}
      <circle cx="96" cy="138" r="2.5" fill="#FFF8F0" opacity="0.8" />
      {/* Handle ring */}
      <path
        d="M 100 152 L 100 164"
        fill="none"
        stroke="#2D2B3A"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M 86 164 Q 100 174 114 164"
        fill="none"
        stroke="#2D2B3A"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
