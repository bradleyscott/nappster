'use client'

import { useState, useCallback, useRef } from 'react'
import { SleepPlanRow } from '@/types/database'
import type { SleepPlan } from '@/lib/ai/schemas/sleep-plan'

interface UseSleepPlanSyncOptions {
  initialPlans?: SleepPlanRow[]
}

interface UseSleepPlanSyncReturn {
  sleepPlan: SleepPlan | null
  localSleepPlans: SleepPlanRow[]
  addToolCreatedPlan: (plan: SleepPlanRow) => void
  handleRealtimePlan: (plan: SleepPlanRow, changeType: 'INSERT' | 'UPDATE' | 'DELETE') => void
  setSleepPlan: (plan: SleepPlan | null) => void
}

/**
 * Extract the active plan (is_active === true) from a list of plan rows and
 * convert it from the database snake_case shape to the SleepPlan camelCase shape.
 */
function activePlanFromRows(rows: SleepPlanRow[]): SleepPlan | null {
  const active = rows.find((p) => p.is_active)
  if (!active) return null
  return {
    currentState: active.current_state as SleepPlan['currentState'],
    nextAction: active.next_action as SleepPlan['nextAction'],
    schedule: active.schedule as SleepPlan['schedule'],
    targetBedtime: active.target_bedtime,
    summary: active.summary,
  }
}

export function useSleepPlanSync({ initialPlans = [] }: UseSleepPlanSyncOptions = {}): UseSleepPlanSyncReturn {
  // Active plan displayed in quick actions.
  // Initialize from the server-provided initial plans so the dashboard shows
  // the AI-generated schedule immediately on page load, without waiting for a
  // background refresh or realtime event.
  const [sleepPlan, setSleepPlanState] = useState<SleepPlan | null>(() =>
    activePlanFromRows(initialPlans)
  )
  // Local sleep plans for timeline display (tool-created + realtime)
  const [localSleepPlans, setLocalSleepPlans] = useState<SleepPlanRow[]>(initialPlans)
  // Track which tool-created sleep plans we've already processed (by plan ID)
  const processedSleepPlanIds = useRef(new Set<string>())

  const setSleepPlan = useCallback((plan: SleepPlan | null) => {
    setSleepPlanState(plan)
  }, [])

  const addToolCreatedPlan = useCallback((plan: SleepPlanRow) => {
    if (processedSleepPlanIds.current.has(plan.id)) return
    processedSleepPlanIds.current.add(plan.id)

    setLocalSleepPlans(prev => {
      if (prev.some(p => p.id === plan.id)) return prev
      return [...prev, plan]
    })

    if (plan.is_active) {
      setSleepPlanState({
        currentState: plan.current_state as SleepPlan['currentState'],
        nextAction: plan.next_action as SleepPlan['nextAction'],
        schedule: plan.schedule as SleepPlan['schedule'],
        targetBedtime: plan.target_bedtime,
        summary: plan.summary,
      })
    }
  }, [])

  const handleRealtimePlan = useCallback((plan: SleepPlanRow, changeType: 'INSERT' | 'UPDATE' | 'DELETE') => {
    // Skip plans we created ourselves via tool
    if (processedSleepPlanIds.current.has(plan.id)) return

    if (changeType === 'DELETE') {
      setSleepPlanState(null)
      setLocalSleepPlans(prev => prev.filter(p => p.id !== plan.id))
      return
    }

    if (plan.is_active) {
      setSleepPlanState({
        currentState: plan.current_state as SleepPlan['currentState'],
        nextAction: plan.next_action as SleepPlan['nextAction'],
        schedule: plan.schedule as SleepPlan['schedule'],
        targetBedtime: plan.target_bedtime,
        summary: plan.summary,
      })
    }

    setLocalSleepPlans(prev => {
      if (changeType === 'INSERT') {
        if (prev.some(p => p.id === plan.id)) return prev
        return [...prev, plan]
      }
      return prev.map(p => p.id === plan.id ? plan : p)
    })
  }, [])

  return {
    sleepPlan,
    localSleepPlans,
    addToolCreatedPlan,
    handleRealtimePlan,
    setSleepPlan,
  }
}
