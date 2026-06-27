import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSleepPlanSync } from '../use-sleep-plan-sync'
import type { SleepPlanRow } from '@/types/database'

const makePlan = (overrides: Partial<SleepPlanRow> & { id: string }): SleepPlanRow => ({
  baby_id: 'baby-1',
  current_state: 'daytime_awake',
  next_action: { label: 'Nap 1', timeWindow: '9:00am', isUrgent: false },
  schedule: [{ type: 'nap', label: 'Nap 1', timeWindow: '9:00am', status: 'upcoming', notes: '' }],
  target_bedtime: '7:00pm',
  summary: 'Plan',
  events_hash: 'abc',
  plan_date: '2024-01-15',
  is_active: true,
  created_by: null,
  created_at: '2024-01-15T08:00:00Z',
  ...overrides,
})

describe('useSleepPlanSync', () => {
  it('starts with initial plans', () => {
    const plan = makePlan({ id: 'plan-1' })
    const { result } = renderHook(() => useSleepPlanSync({ initialPlans: [plan] }))

    expect(result.current.localSleepPlans).toHaveLength(1)
    expect(result.current.localSleepPlans[0].id).toBe('plan-1')
  })

  it('sets active sleep plan when adding a tool-created plan', () => {
    const { result } = renderHook(() => useSleepPlanSync())
    const plan = makePlan({ id: 'plan-1', is_active: true })

    act(() => {
      result.current.addToolCreatedPlan(plan)
    })

    expect(result.current.localSleepPlans).toHaveLength(1)
    expect(result.current.sleepPlan).not.toBeNull()
    expect(result.current.sleepPlan?.summary).toBe('Plan')
  })

  it('does not add the same tool-created plan twice', () => {
    const { result } = renderHook(() => useSleepPlanSync())
    const plan = makePlan({ id: 'plan-1' })

    act(() => {
      result.current.addToolCreatedPlan(plan)
      result.current.addToolCreatedPlan(plan)
    })

    expect(result.current.localSleepPlans).toHaveLength(1)
  })

  it('handles realtime delete', () => {
    const plan = makePlan({ id: 'plan-1' })
    const { result } = renderHook(() => useSleepPlanSync({ initialPlans: [plan] }))

    act(() => {
      result.current.handleRealtimePlan(plan, 'DELETE')
    })

    expect(result.current.localSleepPlans).toHaveLength(0)
    expect(result.current.sleepPlan).toBeNull()
  })

  it('updates existing plan on realtime update', () => {
    const plan = makePlan({ id: 'plan-1', summary: 'Old' })
    const { result } = renderHook(() => useSleepPlanSync({ initialPlans: [plan] }))

    const updated = makePlan({ id: 'plan-1', summary: 'New' })
    act(() => {
      result.current.handleRealtimePlan(updated, 'UPDATE')
    })

    expect(result.current.localSleepPlans[0].summary).toBe('New')
  })
})
