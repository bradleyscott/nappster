'use client'

import { useMemo, useState } from 'react'
import { Building2, X, Moon, Sun, AlertCircle, BedDouble } from 'lucide-react'
import { SleepEvent } from '@/types/database'
import { buildDayRows, computeExpectedDays, type DayRow, type ExpectedDay, type SleepBlock, type NightWakeMarker } from '@/lib/sleep-trends'

// Chart layout constants
const LABEL_WIDTH = 108
const ROW_HEIGHT = 44
const ROW_GAP = 3
const AXIS_HEIGHT = 32
const PADDING_RIGHT = 8
const SVG_WIDTH = 500

// Colors
const OVERNIGHT_COLOR = 'var(--color-indigo-400)'
const NAP_HOME_COLOR = 'var(--color-sky-400)'
const NAP_DAYCARE_COLOR = 'var(--color-amber-400)'
const NIGHT_WAKE_COLOR = 'var(--color-red-400)'
const EXPECTED_OVERNIGHT_COLOR = 'var(--color-indigo-300)'
const EXPECTED_NAP_COLOR = 'var(--color-sky-300)'

const CHART_WIDTH = SVG_WIDTH - LABEL_WIDTH - PADDING_RIGHT

// Time axis labels (5pm to 5pm)
const AXIS_LABELS = [
  { hour: 0, label: '5p' },
  { hour: 3, label: '8p' },
  { hour: 6, label: '11p' },
  { hour: 9, label: '2a' },
  { hour: 12, label: '5a' },
  { hour: 15, label: '8a' },
  { hour: 18, label: '11a' },
  { hour: 21, label: '2p' },
  { hour: 24, label: '5p' },
]

// Gridline positions on the 5pm-5pm axis
const MIDNIGHT_HOUR = 7  // midnight = 5pm + 7h
const NOON_HOUR = 19     // noon = 5pm + 19h

interface SleepTrendsChartProps {
  events: SleepEvent[]
  timezone: string
}

export function SleepTrendsChart({ events, timezone }: SleepTrendsChartProps) {
  const { dayRows, expectedDays } = useMemo(() => {
    const rows = buildDayRows(events, timezone, 14)
    const expected = computeExpectedDays(rows)
    return { dayRows: rows, expectedDays: expected }
  }, [events, timezone])

  const [detailData, setDetailData] = useState<DetailData | null>(null)

  const activeRows = dayRows
    .filter(r => r.blocks.length > 0 || r.nightWakes.length > 0)
    .slice()
    .reverse()

  const expectedEntries: ExpectedDay[] = []
  if (expectedDays.home) expectedEntries.push(expectedDays.home)
  if (expectedDays.daycare) expectedEntries.push(expectedDays.daycare)

  const mainHeight = AXIS_HEIGHT + activeRows.length * (ROW_HEIGHT + ROW_GAP)
  const headerHeight = expectedEntries.length * (ROW_HEIGHT + ROW_GAP) + 4

  function handleSelectDayRow(row: DayRow) {
    // Find tonight's bedtime from the next chronological day's overnight block
    const rowIndex = dayRows.findIndex(r => r.dateKey === row.dateKey)
    const nextRow = rowIndex >= 0 && rowIndex < dayRows.length - 1 ? dayRows[rowIndex + 1] : null
    const overnightBlock = nextRow?.blocks.find(b => b.type === 'overnight')
    setDetailData({
      label: row.label,
      blocks: row.blocks,
      nightWakes: row.nightWakes,
      bedtimeHour: overnightBlock?.startHour ?? null,
    })
  }

  function handleSelectExpected(expected: ExpectedDay) {
    const overnightBlock = expected.blocks.find(b => b.type === 'overnight')
    setDetailData({
      label: expected.label,
      blocks: expected.blocks,
      nightWakes: [],
      bedtimeHour: overnightBlock?.startHour ?? null,
    })
  }

  return (
    <div className="flex flex-col max-w-lg mx-auto" style={{ height: 'calc(100dvh - 53px)' }}>
      {/* Sticky header: expected days + legend */}
      {expectedEntries.length > 0 && (
        <div className="border-b bg-background">
          <div className="px-1 pt-2">
            <p className="text-sm text-muted-foreground font-medium mb-1 pl-1">Expected</p>
            <svg
              width="100%"
              viewBox={`0 0 ${SVG_WIDTH} ${headerHeight}`}
              className="block"
            >
              {expectedEntries.map((exp, i) => (
                <ExpectedDayRow
                  key={exp.label}
                  expected={exp}
                  y={i * (ROW_HEIGHT + ROW_GAP)}
                  onSelect={() => handleSelectExpected(exp)}
                />
              ))}
            </svg>
          </div>
          <Legend />
        </div>
      )}

      {expectedEntries.length === 0 && <Legend />}

      {/* Scrollable history: most recent first */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <svg
          width="100%"
          viewBox={`0 0 ${SVG_WIDTH} ${mainHeight}`}
          className="block"
          role="img"
          aria-label="Sleep trends chart showing daily sleep patterns"
        >
          <TimeAxis />

          <g transform={`translate(0, ${AXIS_HEIGHT})`}>
            {activeRows.map((row, i) => (
              <DayRowSVG
                key={row.dateKey}
                row={row}
                y={i * (ROW_HEIGHT + ROW_GAP)}
                onSelect={() => handleSelectDayRow(row)}
              />
            ))}
          </g>
        </svg>
      </div>

      {detailData && (
        <DayDetailSheet data={detailData} onClose={() => setDetailData(null)} />
      )}
    </div>
  )
}

function TimeAxis() {
  return (
    <g>
      {AXIS_LABELS.map(({ hour, label }) => {
        const x = LABEL_WIDTH + (hour / 24) * CHART_WIDTH
        return (
          <text
            key={hour}
            x={x}
            y={AXIS_HEIGHT - 6}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize="13"
          >
            {label}
          </text>
        )
      })}
      <line
        x1={LABEL_WIDTH}
        x2={SVG_WIDTH - PADDING_RIGHT}
        y1={AXIS_HEIGHT - 1}
        y2={AXIS_HEIGHT - 1}
        stroke="var(--color-border)"
        strokeWidth={0.5}
      />
    </g>
  )
}

function DayRowSVG({ row, y, onSelect }: { row: DayRow; y: number; onSelect: () => void }) {
  const midnightX = LABEL_WIDTH + (MIDNIGHT_HOUR / 24) * CHART_WIDTH
  const noonX = LABEL_WIDTH + (NOON_HOUR / 24) * CHART_WIDTH

  return (
    <g
      transform={`translate(0, ${y})`}
      onClick={onSelect}
      className="cursor-pointer"
      role="button"
      tabIndex={0}
    >
      {/* Date label */}
      <text
        x={row.isDaycareDay ? 14 : 2}
        y={ROW_HEIGHT / 2 + 4}
        className="fill-foreground"
        fontSize="14"
      >
        {row.label}
      </text>

      {row.isDaycareDay && (
        <g transform={`translate(1, ${ROW_HEIGHT / 2 - 5})`}>
          <Building2Icon />
        </g>
      )}

      {/* Row background track */}
      <rect
        x={LABEL_WIDTH}
        y={1}
        width={CHART_WIDTH}
        height={ROW_HEIGHT - 2}
        rx={4}
        className="fill-muted/30"
      />

      {/* Midnight gridline */}
      <line
        x1={midnightX} x2={midnightX}
        y1={1} y2={ROW_HEIGHT - 1}
        stroke="var(--color-border)"
        strokeWidth={0.5}
        strokeDasharray="2 2"
        opacity={0.5}
      />

      {/* Noon gridline */}
      <line
        x1={noonX} x2={noonX}
        y1={1} y2={ROW_HEIGHT - 1}
        stroke="var(--color-border)"
        strokeWidth={0.5}
        strokeDasharray="2 2"
        opacity={0.5}
      />

      {/* Sleep blocks */}
      {row.blocks.map((block, i) => (
        <SleepBlockRect key={i} block={block} />
      ))}

      {/* Night wake markers */}
      {row.nightWakes.map((nw, i) => {
        const x = LABEL_WIDTH + (nw.hour / 24) * CHART_WIDTH
        return (
          <g key={`nw-${i}`} transform={`translate(${x}, ${ROW_HEIGHT / 2})`}>
            <line
              x1={0} x2={0}
              y1={-(ROW_HEIGHT / 2 - 3)}
              y2={ROW_HEIGHT / 2 - 3}
              stroke={NIGHT_WAKE_COLOR}
              strokeWidth={1.5}
              opacity={0.8}
            />
            <circle r={3} fill={NIGHT_WAKE_COLOR} opacity={0.9} />
          </g>
        )
      })}
    </g>
  )
}

function SleepBlockRect({ block, opacity = 0.85 }: { block: SleepBlock; opacity?: number }) {
  const x = LABEL_WIDTH + (block.startHour / 24) * CHART_WIDTH
  const width = ((block.endHour - block.startHour) / 24) * CHART_WIDTH

  let fill: string
  if (block.type === 'overnight') {
    fill = OVERNIGHT_COLOR
  } else if (block.isDaycare) {
    fill = NAP_DAYCARE_COLOR
  } else {
    fill = NAP_HOME_COLOR
  }

  return (
    <rect
      x={x}
      y={3}
      width={Math.max(width, 1)}
      height={ROW_HEIGHT - 6}
      rx={3}
      fill={fill}
      opacity={opacity}
    />
  )
}

function ExpectedDayRow({ expected, y, onSelect }: { expected: ExpectedDay; y: number; onSelect: () => void }) {
  return (
    <g
      transform={`translate(0, ${y})`}
      onClick={onSelect}
      className="cursor-pointer"
      role="button"
      tabIndex={0}
    >
      <text
        x={2}
        y={ROW_HEIGHT / 2 + 4}
        className="fill-muted-foreground"
        fontSize="13"
      >
        {expected.label}
      </text>

      <rect
        x={LABEL_WIDTH}
        y={1}
        width={CHART_WIDTH}
        height={ROW_HEIGHT - 2}
        rx={4}
        className="fill-muted/20"
      />

      {expected.blocks.map((block, i) => {
        const x = LABEL_WIDTH + (block.startHour / 24) * CHART_WIDTH
        const width = ((block.endHour - block.startHour) / 24) * CHART_WIDTH
        const fill = block.type === 'overnight' ? EXPECTED_OVERNIGHT_COLOR : EXPECTED_NAP_COLOR

        return (
          <rect
            key={i}
            x={x}
            y={3}
            width={Math.max(width, 1)}
            height={ROW_HEIGHT - 6}
            rx={3}
            fill={fill}
            opacity={0.5}
            strokeDasharray="3 2"
            stroke={fill}
            strokeWidth={1}
          />
        )
      })}
    </g>
  )
}

const AXIS_ORIGIN_HOUR = 17 // 5pm - must match sleep-trends.ts

/** Convert an axis hour (offset from 5pm) to a formatted time string like "7:30 PM" */
function axisHourToTime(axisHour: number): string {
  const totalMinutes = Math.round((axisHour + AXIS_ORIGIN_HOUR) * 60) % (24 * 60)
  const h = Math.floor(totalMinutes / 60) % 24
  const m = totalMinutes % 60
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`
}

/** Format duration in hours/minutes */
function formatDuration(startHour: number, endHour: number): string {
  const totalMin = Math.round((endHour - startHour) * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Data shape for the detail sheet – works for both actual days and expected days. */
interface DetailData {
  label: string
  blocks: SleepBlock[]
  nightWakes: NightWakeMarker[]
  bedtimeHour: number | null
}

function DayDetailSheet({ data, onClose }: { data: DetailData; onClose: () => void }) {
  const overnightBlocks = data.blocks.filter(b => b.type === 'overnight').sort((a, b) => a.startHour - b.startHour)
  const napBlocks = data.blocks.filter(b => b.type === 'nap').sort((a, b) => a.startHour - b.startHour)
  const nightWakes = [...data.nightWakes].sort((a, b) => a.hour - b.hour)

  // Merge multiple overnight blocks into one range (e.g. bedtime→brief wake→back to sleep→morning wake)
  const mergedOvernight = overnightBlocks.length > 0
    ? { startHour: overnightBlocks[0].startHour, endHour: overnightBlocks[overnightBlocks.length - 1].endHour }
    : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Sheet */}
      <div
        className="relative w-full max-w-lg bg-background rounded-t-2xl shadow-lg"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b">
          <h3 className="text-base font-semibold">{data.label}</h3>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-full hover:bg-muted active:bg-muted/80 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Overnight sleep (merged into single entry) */}
          {mergedOvernight && (
            <div className="flex items-start gap-3">
              <Moon className="w-4.5 h-4.5 text-indigo-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Nighttime Sleep</p>
                <p className="text-sm text-muted-foreground">
                  {axisHourToTime(mergedOvernight.startHour)} – {axisHourToTime(mergedOvernight.endHour)}
                  <span className="ml-2 text-xs">({formatDuration(mergedOvernight.startHour, mergedOvernight.endHour)})</span>
                </p>
              </div>
            </div>
          )}

          {/* Night wakes */}
          {nightWakes.length > 0 && (
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4.5 h-4.5 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  Night Wake{nightWakes.length > 1 ? 's' : ''}
                </p>
                <p className="text-sm text-muted-foreground">
                  {nightWakes.map(nw => axisHourToTime(nw.hour)).join(', ')}
                </p>
              </div>
            </div>
          )}

          {/* Naps */}
          {napBlocks.map((block, i) => (
            <div key={`nap-${i}`} className="flex items-start gap-3">
              <Sun className="w-4.5 h-4.5 text-sky-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  Nap {napBlocks.length > 1 ? i + 1 : ''}
                  {block.isDaycare && <span className="text-amber-500 ml-1">(daycare)</span>}
                </p>
                <p className="text-sm text-muted-foreground">
                  {axisHourToTime(block.startHour)} – {axisHourToTime(block.endHour)}
                  <span className="ml-2 text-xs">({formatDuration(block.startHour, block.endHour)})</span>
                </p>
              </div>
            </div>
          ))}

          {/* Bedtime (tonight) */}
          {data.bedtimeHour !== null && (
            <div className="flex items-start gap-3">
              <BedDouble className="w-4.5 h-4.5 text-indigo-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Bedtime</p>
                <p className="text-sm text-muted-foreground">
                  {axisHourToTime(data.bedtimeHour)}
                </p>
              </div>
            </div>
          )}

          {!mergedOvernight && napBlocks.length === 0 && nightWakes.length === 0 && data.bedtimeHour === null && (
            <p className="text-sm text-muted-foreground">No sleep data for this day.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function Building2Icon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
      <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
      <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
      <path d="M10 6h4" />
      <path d="M10 10h4" />
      <path d="M10 14h4" />
      <path d="M10 18h4" />
    </svg>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-2 pb-6 text-sm text-muted-foreground" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3.5 h-3.5 rounded-sm bg-indigo-400 opacity-85" />
        Overnight
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3.5 h-3.5 rounded-sm bg-sky-400 opacity-85" />
        Nap (home)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3.5 h-3.5 rounded-sm bg-amber-400 opacity-85" />
        Nap (daycare)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400" />
        Night wake
      </span>
      <span className="flex items-center gap-1.5">
        <Building2 className="w-3.5 h-3.5 text-amber-500" />
        Daycare day
      </span>
    </div>
  )
}
