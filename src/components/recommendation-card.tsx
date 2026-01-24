'use client'

import { useEffect } from 'react'
import { experimental_useObject as useObject } from '@ai-sdk/react'
import { z } from 'zod'
import { Baby, SleepEvent } from '@/types/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const recommendationSchema = z.object({
  type: z.enum(['next_nap', 'bedtime', 'waiting']),
  timeWindow: z.string(),
  explanation: z.string(),
})

interface RecommendationCardProps {
  babyId: string
  events: SleepEvent[]
  baby: Baby
  refreshKey?: number
}

export function RecommendationCard({ babyId, events, baby, refreshKey }: RecommendationCardProps) {
  const { object, submit, isLoading, error } = useObject({
    api: '/api/recommend',
    schema: recommendationSchema,
  })

  // Request recommendation when events change (and we have at least one event)
  useEffect(() => {
    if (events.length > 0) {
      submit({ babyId, events, baby })
    }
  }, [events.length, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps -- Intentional: only re-run on event count or refreshKey changes

  // No events yet
  if (events.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span>💡</span>
            <span>Recommendation</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Log your baby&apos;s wake time to get started
          </p>
        </CardContent>
      </Card>
    )
  }

  // Loading state
  if (isLoading || !object) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span>💡</span>
            <span>Recommendation</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <span>💡</span>
            <span>Recommendation</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Unable to get recommendation. Try refreshing.
          </p>
        </CardContent>
      </Card>
    )
  }

  // Show recommendation
  const typeLabels: Record<string, string> = {
    next_nap: 'Next Nap',
    bedtime: 'Bedtime',
    waiting: 'Status',
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <span>💡</span>
          <span>Recommendation</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {object && object.type ? (
          <div>
            <p className="text-xl font-semibold">
              {typeLabels[object.type] || object.type}: {object.timeWindow}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {object.explanation}
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Processing...
          </p>
        )}
      </CardContent>
    </Card>
  )
}
