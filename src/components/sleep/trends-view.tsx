'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  buildDayRows,
  computeExpectedDays,
  type DayRow,
  type ExpectedDay,
  type SleepBlock,
  type NightWakeMarker,
} from '@/lib/sleep-trends'
import { useSleepEventCRUD } from '@/lib/hooks/use-sleep-event-crud'
import { EventSheet, type EventSheetData } from './event-sheet'
import { PageHeader } from './page-header'
import type { SleepEvent, EventType, Context } from '@/types/database'

interface TrendsViewProps {
  events: SleepEvent[]
  timezone: string
  babyName: string
  babyId: string
}

export function TrendsView({ events, timezone, babyName, babyId }: TrendsViewProps) {
  const router = useRouter()
  const [contextFilter, setContextFilter] = useState<'home' | 'daycare'>('home')
  const [detailRow, setDetailRow] = useState<DayRow | null>(null)
  const [timeRange, setTimeRange] = useState(14)
  const [editingEvent, setEditingEvent] = useState<SleepEvent | null>(null)
  const [isNavigatingBack, setIsNavigatingBack] = useState(false)

  const handleBackClick = useCallback(() => {
    setIsNavigatingBack(true)
    router.push('/')
  }, [router])

  const { localEvents, saveEvent, deleteEvent } = useSleepEventCRUD({
    babyId,
    onEventChange: () => {},
  })

  const allEvents = useMemo(() => {
    const ids = new Set(localEvents.map(e => e.id))
    return [...localEvents, ...events.filter(e => !ids.has(e.id))]
  }, [events, localEvents])

  const { rows, expected } = useMemo(() => {
    const r = buildDayRows(allEvents, timezone, timeRange)
    const e = computeExpectedDays(r)
    return { rows: r.slice().reverse(), expected: e }
  }, [allEvents, timezone, timeRange])

  const activeExpected = contextFilter === 'daycare' && expected.daycare
    ? expected.daycare : expected.home

  // Compute derived stats from expected day blocks
  const expectedStats = useMemo(() => {
    if (!activeExpected) return null
    return computeExpectedStats(activeExpected)
  }, [activeExpected])

  const handleEditEvent = useCallback((event: SleepEvent) => {
    setEditingEvent(event)
    setDetailRow(null)
  }, [])

  const handleSheetSave = useCallback(async (data: EventSheetData) => {
    const eventTime = new Date(`${data.date}T${data.time}:00`)

    if (editingEvent) {
      await saveEvent({
        id: editingEvent.id,
        event_type: data.eventType,
        event_time: eventTime.toISOString(),
        context: data.context ?? 'home',
        notes: data.notes || null,
      })
    }
    setEditingEvent(null)
  }, [editingEvent, saveEvent])

  const handleSheetDelete = useCallback(async () => {
    if (editingEvent) {
      await deleteEvent(editingEvent)
    }
    setEditingEvent(null)
  }, [editingEvent, deleteEvent])

  return (
    <div className="pb-6">
      <PageHeader
        title="Sleep Trends"
        subtitle={`Last ${timeRange} days · ${babyName}`}
        onBack={handleBackClick}
        isNavigatingBack={isNavigatingBack}
      />

      <div className="mx-auto max-w-md px-4 pt-2 md:max-w-xl lg:max-w-2xl">
        {/* ===== AVERAGE DAY CARD ===== */}
      {activeExpected && expectedStats && (
        <div className="card-rise mb-4 overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-sm)]">
          <div className="gradient-flow h-1" />
          <div className="px-5 pb-5 pt-4">
            {/* Header with pill nav */}
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[16px] font-extrabold text-[var(--text)]">
                📋 Typical Day
              </h3>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setContextFilter('home')}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[11px] font-bold transition-all active:scale-95',
                    contextFilter === 'home'
                      ? 'border-[var(--lavender-light)] bg-[var(--lavender-bg)] text-[var(--lavender)]'
                      : 'border-[#EEE] bg-white text-[var(--text-muted)]'
                  )}
                >
                  🏠 Home
                </button>
                <button
                  onClick={() => setContextFilter('daycare')}
                  className={cn(
                    'rounded-full border px-3 py-1 text-[11px] font-bold transition-all active:scale-95',
                    contextFilter === 'daycare'
                      ? 'border-[var(--lavender-light)] bg-[var(--lavender-bg)] text-[var(--lavender)]'
                      : 'border-[#EEE] bg-white text-[var(--text-muted)]'
                  )}
                >
                  🏫 Daycare
                </button>
              </div>
            </div>

            {/* 24h timeline bar */}
            <div
              onClick={() => {
                if (activeExpected) {
                  setDetailRow({
                    label: activeExpected.label,
                    dateKey: 'expected',
                    isDaycareDay: contextFilter === 'daycare',
                    blocks: activeExpected.blocks,
                    nightWakes: [],
                  })
                }
              }}
              className="relative mb-3 h-14 cursor-pointer overflow-hidden rounded-2xl bg-[repeating-linear-gradient(90deg,#F8F5FF_0px,#F8F5FF_calc(100%/24-1px),rgba(0,0,0,0.015)_calc(100%/24-1px),rgba(0,0,0,0.015)_calc(100%/24))] active:scale-[0.98] transition-transform"
            >
              {activeExpected.blocks.map((block, i) => (
                <div
                  key={i}
                  className={cn(
                    'bar-grow absolute rounded-[6px]',
                    block.type === 'nap'
                      ? block.isDaycare ? 'bg-[var(--peach)]' : 'bg-[var(--mint)]'
                      : 'bg-[var(--lavender)]'
                  )}
                  style={{
                    left: `${(block.startHour / 24) * 100}%`,
                    width: `${((block.endHour - block.startHour) / 24) * 100}%`,
                    top: block.type === 'nap' ? '8px' : '0px',
                    bottom: block.type === 'nap' ? '8px' : '0px',
                    opacity: 0.85,
                    animationDelay: `${0.2 + i * 0.1}s`,
                  }}
                />
              ))}
            </div>

            {/* Stats pills */}
            <div className="flex gap-2">
              <div className="stat-pill-pop flex-1 rounded-xl bg-[var(--bg)] px-3 py-2.5 text-center">
                <div className="text-sm font-extrabold text-[var(--lavender)]">{expectedStats.nightDuration}</div>
                <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.3px]">Night</div>
              </div>
              <div className="stat-pill-pop flex-1 rounded-xl bg-[var(--bg)] px-3 py-2.5 text-center">
                <div className="text-sm font-extrabold text-[var(--mint)]">{expectedStats.napDuration}</div>
                <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.3px]">Naps</div>
              </div>
              <div className="stat-pill-pop flex-1 rounded-xl bg-[var(--bg)] px-3 py-2.5 text-center">
                <div className="text-sm font-extrabold text-[var(--peach)]">{expectedStats.awakeDuration}</div>
                <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.3px]">Awake</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== STATS ROW ===== */}
      {expectedStats && (
        <div className="mb-4 flex gap-2">
          <TrendCard
            emoji="😴"
            value={String(expectedStats.napCount)}
            label="Avg Naps"
            trend="steady"
            trendLabel="● steady"
            color="lavender"
          />
          <TrendCard
            emoji="🌙"
            value={expectedStats.avgBedtime || '--'}
            label="Avg Bedtime"
            trend="down"
            trendLabel="▼ earlier"
            color="mint"
          />
          <TrendCard
            emoji="☀️"
            value={expectedStats.avgWakeTime || '--'}
            label="Avg Wake"
            trend="up"
            trendLabel="▲ later"
            color="peach"
          />
        </div>
      )}

      {/* ===== HISTORY ===== */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[15px] font-extrabold text-[var(--text)]">
          📅 Sleep History
        </h3>
        <div className="flex gap-1.5">
          {([7, 14] as const).map((days) => (
            <button
              key={days}
              onClick={() => setTimeRange(days)}
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-bold transition-all active:scale-95',
                timeRange === days
                  ? 'border-[var(--lavender-light)] bg-[var(--lavender-bg)] text-[var(--lavender)]'
                  : 'border-[#EEE] bg-white text-[var(--text-muted)]'
              )}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[#F0EDF5] py-12 text-center">
            <span className="text-3xl">📊</span>
            <p className="text-sm font-bold text-[var(--text-muted)]">No sleep data yet</p>
            <p className="text-xs font-semibold text-[var(--text-muted)]">Start tracking to see patterns</p>
          </div>
        )}

        {rows.map((row, i) => (
          <DayHistoryRow
            key={row.dateKey ?? i}
            row={row}
            index={i}
            onClick={() => setDetailRow(row)}
          />
        ))}
      </div>

      </div>

      {/* ===== DETAIL SHEET ===== */}
      {detailRow && (
        <DayDetailSheet
          row={detailRow}
          events={allEvents}
          onClose={() => setDetailRow(null)}
          onEditEvent={handleEditEvent}
        />
      )}

      {/* ===== EVENT EDIT SHEET ===== */}
      {editingEvent && (
        <EventSheet
          open={!!editingEvent}
          mode="edit"
          event={editingEvent}
          onSave={handleSheetSave}
          onDelete={handleSheetDelete}
          onClose={() => setEditingEvent(null)}
        />
      )}
    </div>
  )
}

// ---- Sub-components ----

function TrendCard({
  emoji, value, label, trend, trendLabel, color,
}: {
  emoji: string; value: string; label: string; trend: string; trendLabel: string; color: string
}) {
  const colorMap: Record<string, string> = {
    lavender: 'text-[var(--lavender)]',
    mint: 'text-[var(--mint)]',
    peach: 'text-[var(--peach)]',
  }
  const bgMap: Record<string, string> = {
    up: 'bg-[var(--mint-bg)] text-[var(--mint)]',
    down: 'bg-[var(--rose-bg)] text-[var(--rose)]',
    steady: 'bg-[var(--lavender-bg)] text-[var(--lavender)]',
  }
  return (
    <div className="trend-card-up flex-1 rounded-2xl bg-white px-3 py-3.5 text-center shadow-[var(--shadow-sm)]">
      <div className="mb-0.5 text-lg">{emoji}</div>
      <div className={cn('text-lg font-black leading-tight', colorMap[color])}>{value}</div>
      <div className="mt-0.5 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.3px]">{label}</div>
      <div className={cn('mt-0.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold', bgMap[trend] || 'bg-gray-100')}>
        {trendLabel}
      </div>
    </div>
  )
}

function DayHistoryRow({ row, index, onClick }: { row: DayRow; index: number; onClick: () => void }) {
  const label = row.label
  const hasDaycare = row.isDaycareDay
  const overnight = row.blocks.filter(b => b.type === 'bedtime' || b.type === 'wake')
  const naps = row.blocks.filter(b => b.type === 'nap')

  return (
    <button
      onClick={onClick}
      className="timeline-row-animated flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 shadow-[var(--shadow-sm)] active:scale-[0.98] transition-transform"
      style={{ animationDelay: `${0.1 + index * 0.07}s` }}
    >
      {/* Day label */}
      <div className="w-[68px] shrink-0 text-left">
        <div className="flex items-center gap-1">
          <span className="text-sm font-extrabold text-[var(--text)] leading-tight">{label}</span>
          {hasDaycare && <span className="text-[10px]">🏫</span>}
        </div>
      </div>

      {/* Mini bar */}
      <div className="relative h-[30px] flex-1 overflow-hidden rounded-[10px] bg-[#F8F5FF]">
        {overnight.map((block, i) => (
          <div
            key={i}
            className="bar-grow absolute top-1 bottom-1 rounded-[7px] bg-[var(--lavender)] opacity-80"
            style={{
              left: `${(block.startHour / 24) * 100}%`,
              width: `${Math.max(((block.endHour - block.startHour) / 24) * 100, 0.5)}%`,
              animationDelay: `${0.25 + i * 0.1}s`,
            }}
          />
        ))}
        {naps.map((block, i) => (
          <div
            key={i}
            className={cn(
              'bar-grow absolute top-2 bottom-2 rounded-[6px] opacity-80',
              block.isDaycare ? 'bg-[var(--peach)]' : 'bg-[var(--mint)]'
            )}
            style={{
              left: `${(block.startHour / 24) * 100}%`,
              width: `${Math.max(((block.endHour - block.startHour) / 24) * 100, 0.5)}%`,
              animationDelay: `${0.35 + i * 0.1}s`,
            }}
          />
        ))}
        {row.nightWakes.map((wake, i) => (
          <div
            key={i}
            className="bar-grow absolute top-2 bottom-2 w-[2px] rounded-full bg-[var(--rose)] opacity-30"
            style={{
              left: `${(wake.hour / 24) * 100}%`,
              animationDelay: `${0.55 + i * 0.1}s`,
            }}
          />
        ))}
      </div>

      <span className="shrink-0 text-sm text-[var(--text-muted)]">›</span>
    </button>
  )
}

function DayDetailSheet({ row, events, onClose, onEditEvent }: { row: DayRow; events: SleepEvent[]; onClose: () => void; onEditEvent: (event: SleepEvent) => void }) {
  const overnight = row.blocks.filter(b => b.type === 'bedtime' || b.type === 'wake')
  const naps = row.blocks.filter(b => b.type === 'nap')
  const hasDaycare = row.isDaycareDay

  const fmtMin = (m: number) => {
    const h = Math.floor(m / 60)
    const min = m % 60
    return h > 0 ? `${h}h ${min}m` : `${min}m`
  }

  const fmtHour = (h: number) => {
    const hour = Math.floor(h)
    const min = Math.round((h - hour) * 60)
    const ampm = h >= 12 ? 'pm' : 'am'
    const h12 = hour % 12 || 12
    return `${h12}:${String(min).padStart(2, '0')}${ampm}`
  }

  // Build a chronological day narrative: morning wake → naps (by start time) → bedtime.
  // The overnight sleep is stored as two midnight-split blocks (bedtime→24 and 0→wake);
  // here we collapse them into anchor entries showing the wake time and bedtime time,
  // rather than listing two "Night sleep" ranges that meet at 12:00am.
  const wakeBlock = row.blocks.find(b => b.type === 'wake')
  const bedtimeBlock = row.blocks.find(b => b.type === 'bedtime')
  const napBlocks = row.blocks
    .filter(b => b.type === 'nap')
    .sort((a, b) => a.startHour - b.startHour)

  type TimelineItem = {
    emoji: string
    label: string
    timeLabel: string
    durationLabel: string | null
    eventId?: string
    dotClass: string
  }
  const timelineItems: TimelineItem[] = []
  if (wakeBlock) {
    timelineItems.push({
      emoji: '☀️',
      label: 'Wake',
      timeLabel: fmtHour(wakeBlock.endHour),
      durationLabel: null,
      eventId: wakeBlock.eventId,
      dotClass: 'bg-[var(--lavender)]',
    })
  }
  for (const nap of napBlocks) {
    timelineItems.push({
      emoji: '😴',
      label: 'Nap',
      timeLabel: `${fmtHour(nap.startHour)} – ${fmtHour(nap.endHour)}`,
      durationLabel: fmtMin(Math.round((nap.endHour - nap.startHour) * 60)),
      eventId: nap.eventId,
      dotClass: 'bg-[var(--mint)]',
    })
  }
  if (bedtimeBlock) {
    timelineItems.push({
      emoji: '🌙',
      label: 'Bedtime',
      timeLabel: fmtHour(bedtimeBlock.startHour),
      durationLabel: null,
      eventId: bedtimeBlock.eventId,
      dotClass: 'bg-[var(--lavender)]',
    })
  }

  const nightMin = Math.round(overnight.reduce((sum, b) => sum + (b.endHour - b.startHour) * 60, 0))
  const napMin = Math.round(naps.reduce((sum, b) => sum + (b.endHour - b.startHour) * 60, 0))
  const totalMin = nightMin + napMin
  const awakeMin = Math.max(0, 24 * 60 - totalMin)

  return (
    <>
      <div className="fixed inset-0 z-20 bg-black/20" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-30 max-h-[75vh] overflow-y-auto rounded-t-[var(--radius-xl)] bg-white px-5 pb-8 pt-3 shadow-[0_-8px_40px_rgba(45,43,58,0.15)]">
        <div className="mx-auto mb-4 h-1 w-10 shrink-0 rounded-full bg-[#DDD]" />

        {/* Header */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-lg font-extrabold text-[var(--text)]">{row.label}</span>
          {hasDaycare && (
            <span className="ml-auto rounded-full bg-[var(--peach-bg)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--peach)]">
              🏫 Daycare
            </span>
          )}
        </div>

        {/* Timeline of blocks */}
        <div className="mb-4 flex flex-col gap-0">
          {timelineItems.map((item, i) => (
            <div key={i} className="flex items-stretch gap-3 px-1">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <div className={cn('z-10 mt-1.5 h-3 w-3 rounded-full', item.dotClass)} />
                {i < timelineItems.length - 1 && (
                  <div className="w-0.5 flex-1 rounded-full bg-[#E8E5F0]" />
                )}
              </div>
              <button
                onClick={() => {
                  const event = item.eventId ? events.find(e => e.id === item.eventId) : null
                  if (event) onEditEvent(event)
                }}
                disabled={!item.eventId}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl pb-3 text-left active:scale-[0.98] transition-transform disabled:active:scale-100"
              >
                <span className="text-sm">{item.emoji}</span>
                <div className="flex-1">
                  <span className="text-sm font-bold text-[var(--text)]">{item.label}</span>
                  <span className="ml-2 text-xs font-bold text-[var(--text-muted)]">{item.timeLabel}</span>
                </div>
                {item.durationLabel && (
                  <span className="text-xs font-bold text-[var(--text-secondary)]">{item.durationLabel}</span>
                )}
                {item.eventId && <span className="text-xs text-[var(--text-muted)]">›</span>}
              </button>
            </div>
          ))}

          {/* Night wakes */}
          {row.nightWakes.map((wake, i) => (
            <div key={`nw-${i}`} className="flex items-stretch gap-3 px-1">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <div className="z-10 mt-1.5 h-3 w-3 rounded-full bg-[var(--rose)] opacity-50" />
                {i < row.nightWakes.length - 1 && (
                  <div className="w-0.5 flex-1 rounded-full bg-[#E8E5F0]" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2 pb-3">
                <span className="text-sm">👀</span>
                <span className="text-sm font-bold text-[var(--text-muted)]">Night wake</span>
                <span className="ml-auto text-xs font-bold text-[var(--text-muted)]">
                  {fmtHour(wake.hour)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div className="mb-4 flex gap-2 rounded-xl bg-[var(--bg)] p-3">
          <div className="flex-1 text-center">
            <div className="text-sm font-extrabold text-[var(--lavender)]">{fmtMin(nightMin)}</div>
            <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Night</div>
          </div>
          <div className="flex-1 text-center">
            <div className="text-sm font-extrabold text-[var(--mint)]">{fmtMin(napMin)}</div>
            <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Naps</div>
          </div>
          <div className="flex-1 text-center">
            <div className="text-sm font-extrabold text-[var(--text)]">{fmtMin(awakeMin)}</div>
            <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Awake</div>
          </div>
        </div>

      </div>
    </>
  )
}

// ---- Helpers ----

function computeExpectedStats(expected: ExpectedDay) {
  const bedtime = expected.blocks.find(b => b.type === 'bedtime')
  const wake = expected.blocks.find(b => b.type === 'wake')
  const naps = expected.blocks.filter(b => b.type === 'nap')

  const nightMin = Math.round(
    (bedtime ? bedtime.endHour - bedtime.startHour : 0) +
    (wake ? wake.endHour - wake.startHour : 0)
  ) * 60
  const napMin = Math.round(naps.reduce((sum, n) => sum + (n.endHour - n.startHour), 0) * 60)

  const fmtH = (h: number) => {
    const hours = Math.floor(h)
    const min = Math.round((h - hours) * 60)
    return `${hours}h ${min}m`
  }
  const fmtHour = (h: number) => {
    const hour = Math.floor(h)
    const min = Math.round((h - hour) * 60)
    const ampm = h >= 12 ? 'pm' : 'am'
    const h12 = hour % 12 || 12
    return `${h12}:${String(min).padStart(2, '0')}${ampm}`
  }

  return {
    nightDuration: fmtH(nightMin / 60),
    napDuration: fmtH(napMin / 60),
    awakeDuration: fmtH(24 - (nightMin + napMin) / 60),
    napCount: naps.length,
    avgBedtime: bedtime ? fmtHour(bedtime.startHour) : '--',
    avgWakeTime: wake ? fmtHour(wake.endHour) : '--',
  }
}

