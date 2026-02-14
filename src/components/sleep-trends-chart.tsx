'use client'

import { useMemo } from 'react'
import { Building2 } from 'lucide-react'
import { SleepEvent } from '@/types/database'
import { buildDayRows, computeExpectedDays, type DayRow, type ExpectedDay, type SleepBlock } from '@/lib/sleep-trends'

// Chart layout constants
const LABEL_WIDTH = 72
const ROW_HEIGHT = 38
const ROW_GAP = 2
const AXIS_HEIGHT = 24
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

  const activeRows = dayRows.filter(r => r.blocks.length > 0 || r.nightWakes.length > 0)

  const expectedEntries: ExpectedDay[] = []
  if (expectedDays.home) expectedEntries.push(expectedDays.home)
  if (expectedDays.daycare) expectedEntries.push(expectedDays.daycare)

  const mainHeight = AXIS_HEIGHT + activeRows.length * (ROW_HEIGHT + ROW_GAP)
  const footerHeight = expectedEntries.length * (ROW_HEIGHT + ROW_GAP) + 4

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 53px)' }}>
      {/* Scrollable main chart */}
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
              />
            ))}
          </g>
        </svg>
      </div>

      {/* Sticky footer: expected days + legend */}
      {expectedEntries.length > 0 && (
        <div className="border-t bg-background">
          <div className="px-1 pt-2">
            <p className="text-[10px] text-muted-foreground font-medium mb-1 pl-1">Expected</p>
            <svg
              width="100%"
              viewBox={`0 0 ${SVG_WIDTH} ${footerHeight}`}
              className="block"
            >
              {expectedEntries.map((exp, i) => (
                <ExpectedDayRow
                  key={exp.label}
                  expected={exp}
                  y={i * (ROW_HEIGHT + ROW_GAP)}
                />
              ))}
            </svg>
          </div>
          <Legend />
        </div>
      )}

      {expectedEntries.length === 0 && <Legend />}
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
            fontSize="9"
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

function DayRowSVG({ row, y }: { row: DayRow; y: number }) {
  const midnightX = LABEL_WIDTH + (MIDNIGHT_HOUR / 24) * CHART_WIDTH
  const noonX = LABEL_WIDTH + (NOON_HOUR / 24) * CHART_WIDTH

  return (
    <g transform={`translate(0, ${y})`}>
      {/* Date label */}
      <text
        x={row.isDaycareDay ? 14 : 2}
        y={ROW_HEIGHT / 2 + 4}
        className="fill-foreground"
        fontSize="10"
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
            <circle r={2.5} fill={NIGHT_WAKE_COLOR} opacity={0.9} />
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

function ExpectedDayRow({ expected, y }: { expected: ExpectedDay; y: number }) {
  return (
    <g transform={`translate(0, ${y})`}>
      <text
        x={2}
        y={ROW_HEIGHT / 2 + 4}
        className="fill-muted-foreground"
        fontSize="9"
        fontStyle="italic"
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

function Building2Icon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--color-amber-500)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm bg-indigo-400 opacity-85" />
        Overnight
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm bg-sky-400 opacity-85" />
        Nap (home)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm bg-amber-400 opacity-85" />
        Nap (daycare)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full bg-red-400" />
        Night wake
      </span>
      <span className="flex items-center gap-1.5">
        <Building2 className="w-3 h-3 text-amber-500" />
        Daycare day
      </span>
    </div>
  )
}
