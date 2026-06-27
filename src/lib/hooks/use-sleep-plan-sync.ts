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

export function useSleepPlanSync({ initialPlans = [] }: UseSleepPlanSyncOptions = {}): UseSleepPlanSyncReturn {
  // Active plan displayed in quick actions
  const [sleepPlan, setSleepPlanState] = useState<SleepPlan | null>(null)
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
