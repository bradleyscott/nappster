'use client'

/**
 * Sleep UI icon system.
 *
 * Replaces the emoji strings that used to travel through the dashboard configs
 * with a single semantic icon vocabulary (lucide-react). Everything renders
 * through these maps so the app has one icon voice, not five OS-dependent ones.
 */

import {
  Moon,
  Sun,
  CloudSun,
  CloudMoon,
  Eye,
  Home,
  School,
  Plane,
  Sparkles,
  Star,
  Waves,
  Hand,
  type LucideIcon,
} from 'lucide-react'
import type { EventType, Context } from '@/types/database'

/** Semantic icon keys used by the dashboard configs. */
export type IconKey =
  | 'moon'
  | 'sun'
  | 'cloud-sun'
  | 'cloud-moon'
  | 'eye'
  | 'star'
  | 'wave'
  | 'hand'
  | 'sparkle'
  | 'home'
  | 'school'
  | 'plane'

export const ICONS: Record<IconKey, LucideIcon> = {
  moon: Moon,
  sun: Sun,
  'cloud-sun': CloudSun,
  'cloud-moon': CloudMoon,
  eye: Eye,
  star: Star,
  wave: Waves,
  hand: Hand,
  sparkle: Sparkles,
  home: Home,
  school: School,
  plane: Plane,
}

/** Icons by event type — the semantic source of truth for all surfaces. */
export const EVENT_ICONS: Record<EventType, LucideIcon> = {
  wake: Sun,
  nap_start: CloudSun,
  nap_end: CloudMoon,
  bedtime: Moon,
  night_wake: Eye,
}

/** Icons by care context. */
export const CONTEXT_ICONS: Record<Exclude<Context, null>, LucideIcon> = {
  home: Home,
  daycare: School,
  travel: Plane,
}

interface SleepIconProps {
  /** A semantic icon key; unknown keys render nothing. */
  name?: string | null
  className?: string
  size?: number
  strokeWidth?: number
}

/** Render an icon by semantic key. Missing/unknown keys render nothing. */
export function SleepIcon({ name, className, size = 20, strokeWidth = 2 }: SleepIconProps) {
  const Cmp = name
    ? (ICONS as Record<string, LucideIcon | undefined>)[name]
    : undefined
  if (!Cmp) return null
  return <Cmp className={className} size={size} strokeWidth={strokeWidth} aria-hidden="true" />
}

/** Render the icon for a sleep event type. */
export function EventTypeIcon({
  type,
  className,
  size = 18,
  strokeWidth = 2,
}: {
  type: EventType
  className?: string
  size?: number
  strokeWidth?: number
}) {
  const Cmp = EVENT_ICONS[type]
  return <Cmp className={className} size={size} strokeWidth={strokeWidth} aria-hidden="true" />
}
