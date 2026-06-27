'use client'

import { useEffect, useState } from 'react'

/**
 * Simple client-side media query hook.
 * Returns `true` when the query matches.
 * Defaults to `false` on the server.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])

  return matches
}
