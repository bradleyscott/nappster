'use client'

import { useState, useMemo } from 'react'
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
import type { SleepEvent } from '@/types/database'

interface TrendsViewProps {
  events: SleepEvent[]
  timezone: string
  babyName: string
}

export function TrendsView({ events, timezone, babyName }: TrendsViewProps) {
  const router = useRouter()
  const [contextFilter, setContextFilter] = useState<'home' | 'daycare'>('home')
  const [detailRow, setDetailRow] = useState<DayRow | null>(null)
  const [timeRange, setTimeRange] = useState(14)

  const { rows, expected } = useMemo(() => {
    const r = buildDayRows(events, timezone, timeRange)
    const e = computeExpectedDays(r)
    return { rows: r, expected: e }
  }, [events, timezone, timeRange])

  const activeExpected = contextFilter === 'daycare' && expected.daycare
    ? expected.daycare : expected.home

  // Compute derived stats from expected day blocks
  const expectedStats = useMemo(() => {
    if (!activeExpected) return null
    return computeExpectedStats(activeExpected)
  }, [activeExpected])

  return (
    <div className="mx-auto max-w-md pb-6">
      {/* Page header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={() => router.push('/')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[#EEE] bg-white active:scale-90 transition-transform"
        >
          ←
        </button>
        <div>
          <div className="text-lg font-extrabold text-[var(--text)]">Sleep Trends</div>
          <div className="text-xs font-semibold text-[var(--text-muted)]">
            Last {timeRange} days · {babyName}
          </div>
        </div>
      </div>

      {/* ===== AVERAGE DAY CARD ===== */}
      {activeExpected && expectedStats && (
        <div className="mx-4 mb-4 overflow-hidden rounded-[var(--radius-lg)] bg-white shadow-[var(--shadow-sm)]">
          <div className="h-1 bg-gradient-to-r from-[var(--lavender)] via-[var(--mint)] to-[var(--peach)]" />
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
              className="relative mb-3 h-14 cursor-pointer overflow-hidden rounded-2xl bg-[repeating-linear-gradient(90deg,#F8F5FF_0px,#F8F5FF_calc(100%/24-1px),rgba(0,0,0,0.015)_calc(100%/24-1px),rgba(0,0,0,0.015)_calc(100%/24))] active:scale-[0.98] transition-transform"
            >
              {activeExpected.blocks.map((block, i) => (
                <div
                  key={i}
                  className={cn(
                    'absolute rounded-[6px]',
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
                  }}
                />
              ))}
            </div>

            {/* Stats pills */}
            <div className="flex gap-2">
              <div className="flex-1 rounded-xl bg-[var(--bg)] px-3 py-2.5 text-center">
                <div className="text-sm font-extrabold text-[var(--lavender)]">{expectedStats.nightDuration}</div>
                <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.3px]">Night</div>
              </div>
              <div className="flex-1 rounded-xl bg-[var(--bg)] px-3 py-2.5 text-center">
                <div className="text-sm font-extrabold text-[var(--mint)]">{expectedStats.napDuration}</div>
                <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.3px]">Naps</div>
              </div>
              <div className="flex-1 rounded-xl bg-[var(--bg)] px-3 py-2.5 text-center">
                <div className="text-sm font-extrabold text-[var(--peach)]">{expectedStats.awakeDuration}</div>
                <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.3px]">Awake</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== STATS ROW ===== */}
      {expectedStats && (
        <div className="mx-4 mb-4 flex gap-2">
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
            emoji="🌅"
            value={expectedStats.avgWakeTime || '--'}
            label="Avg Wake"
            trend="up"
            trendLabel="▲ later"
            color="peach"
          />
        </div>
      )}

      {/* ===== HISTORY ===== */}
      <div className="mx-4 mb-3 flex items-center justify-between">
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

      <div className="mx-4 flex flex-col gap-1.5">
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
            onClick={() => setDetailRow(row)}
          />
        ))}
      </div>

      {/* ===== DETAIL SHEET ===== */}
      {detailRow && (
        <DayDetailSheet
          row={detailRow}
          onClose={() => setDetailRow(null)}
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
    <div className="flex-1 rounded-2xl bg-white px-3 py-3.5 text-center shadow-[var(--shadow-sm)]">
      <div className="mb-0.5 text-lg">{emoji}</div>
      <div className={cn('text-lg font-black leading-tight', colorMap[color])}>{value}</div>
      <div className="mt-0.5 text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.3px]">{label}</div>
      <div className={cn('mt-0.5 inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-bold', bgMap[trend] || 'bg-gray-100')}>
        {trendLabel}
      </div>
    </div>
  )
}

function DayHistoryRow({ row, onClick }: { row: DayRow; onClick: () => void }) {
  const label = row.label
  const hasDaycare = row.isDaycareDay
  const overnight = row.blocks.filter(b => b.type === 'bedtime' || b.type === 'wake')
  const naps = row.blocks.filter(b => b.type === 'nap')

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-2xl bg-white px-4 py-3 shadow-[var(--shadow-sm)] active:scale-[0.98] transition-transform"
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
            className="absolute top-1 bottom-1 rounded-[7px] bg-[var(--lavender)] opacity-80"
            style={{
              left: `${(block.startHour / 24) * 100}%`,
              width: `${Math.max(((block.endHour - block.startHour) / 24) * 100, 0.5)}%`,
            }}
          />
        ))}
        {naps.map((block, i) => (
          <div
            key={i}
            className={cn(
              'absolute top-2 bottom-2 rounded-[6px] opacity-80',
              block.isDaycare ? 'bg-[var(--peach)]' : 'bg-[var(--mint)]'
            )}
            style={{
              left: `${(block.startHour / 24) * 100}%`,
              width: `${Math.max(((block.endHour - block.startHour) / 24) * 100, 0.5)}%`,
            }}
          />
        ))}
        {row.nightWakes.map((wake, i) => (
          <div
            key={i}
            className="absolute top-2 bottom-2 w-[2px] rounded-full bg-[var(--rose)] opacity-30"
            style={{
              left: `${(wake.hour / 24) * 100}%`,
            }}
          />
        ))}
      </div>

      <span className="shrink-0 text-sm text-[var(--text-muted)]">›</span>
    </button>
  )
}

function DayDetailSheet({ row, onClose }: { row: DayRow; onClose: () => void }) {
  const overnight = row.blocks.filter(b => b.type === 'bedtime' || b.type === 'wake')
  const naps = row.blocks.filter(b => b.type === 'nap')
  const allBlocks = row.blocks
  const hasDaycare = row.isDaycareDay

  const nightMin = Math.round(overnight.reduce((sum, b) => sum + (b.endHour - b.startHour) * 60, 0))
  const napMin = Math.round(naps.reduce((sum, b) => sum + (b.endHour - b.startHour) * 60, 0))
  const totalMin = nightMin + napMin

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
          {allBlocks.map((block, i) => (
            <div key={i} className="flex items-stretch gap-3 px-1">
              <div className="flex w-6 shrink-0 flex-col items-center">
                <div className={cn(
                  'z-10 mt-1.5 h-3 w-3 rounded-full',
                  block.type === 'nap' ? 'bg-[var(--mint)]' : 'bg-[var(--lavender)]'
                )} />
                {i < allBlocks.length - 1 && (
                  <div className="w-0.5 flex-1 rounded-full bg-[#E8E5F0]" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2 pb-3">
                <span className="text-sm">{block.type === 'nap' ? '😴' : '🌙'}</span>
                <div className="flex-1">
                  <span className="text-sm font-bold text-[var(--text)]">
                    {block.type === 'nap' ? 'Nap' : 'Night sleep'}
                  </span>
                  <span className="ml-2 text-xs font-bold text-[var(--text-muted)]">
                    {fmtHour(block.startHour)} – {fmtHour(block.endHour)}
                  </span>
                </div>
                <span className="text-xs font-bold text-[var(--text-secondary)]">
                  {fmtMin(Math.round((block.endHour - block.startHour) * 60))}
                </span>
              </div>
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
            <div className="text-sm font-extrabold text-[var(--text)]">{fmtMin(totalMin)}</div>
            <div className="text-[10px] font-bold text-[var(--text-secondary)] uppercase">Total</div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-2xl border-2 border-[#EEE] bg-white py-3.5 text-sm font-bold text-[var(--text-secondary)] active:bg-[#F8F5FF] transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => {
              const text = formatDayForSharing(row)
              navigator.clipboard.writeText(text)
            }}
            className="flex-1 rounded-2xl bg-gradient-to-br from-[var(--lavender)] to-[#7C4DFF] py-3.5 text-sm font-bold text-white shadow-[0_4px_14px_rgba(124,77,255,0.2)] active:scale-[0.97] transition-all"
          >
            Share This Day
          </button>
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

function formatDayForSharing(row: DayRow): string {
  const lines = [`Sleep log for ${row.label}`]
  for (const block of row.blocks) {
    const type = block.type === 'nap' ? 'Nap' : 'Night sleep'
    const minutes = Math.round((block.endHour - block.startHour) * 60)
    lines.push(`${block.type === 'nap' ? '😴' : '🌙'} ${type}: ${minutes}m`)
  }
  return lines.join('\n')
}
