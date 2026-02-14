'use client'

import { useMemo } from 'react'
import { Building2 } from 'lucide-react'
import { SleepEvent } from '@/types/database'
import { buildDayRows, computeExpectedDays, type DayRow, type ExpectedDay, type SleepBlock } from '@/lib/sleep-trends'

// Chart layout constants
const LABEL_WIDTH = 72
const ROW_HEIGHT = 28
const ROW_GAP = 4
const AXIS_HEIGHT = 24
const SECTION_GAP = 16
const PADDING_RIGHT = 8

// Colors
const OVERNIGHT_COLOR = 'var(--color-indigo-400)'
const NAP_HOME_COLOR = 'var(--color-sky-400)'
const NAP_DAYCARE_COLOR = 'var(--color-amber-400)'
const NIGHT_WAKE_COLOR = 'var(--color-red-400)'
const EXPECTED_OVERNIGHT_COLOR = 'var(--color-indigo-300)'
const EXPECTED_NAP_COLOR = 'var(--color-sky-300)'

// Time axis labels (8pm to 8pm)
const AXIS_LABELS = [
  { hour: 0, label: '8p' },
  { hour: 4, label: '12a' },
  { hour: 8, label: '4a' },
  { hour: 12, label: '8a' },
  { hour: 16, label: '12p' },
  { hour: 20, label: '4p' },
  { hour: 24, label: '8p' },
]

interface SleepTrendsChartProps {
  events: SleepEvent[]
  timezone: string
}

export function SleepTrendsChart({ events, timezone }: SleepTrendsChartProps) {
  const { dayRows, expectedDays } = useMemo(() => {
    const rows = buildDayRows(events, timezone, 30)
    const expected = computeExpectedDays(rows)
    return { dayRows: rows, expectedDays: expected }
  }, [events, timezone])

  // Filter to rows that have at least some data
  const activeRows = dayRows.filter(r => r.blocks.length > 0 || r.nightWakes.length > 0)

  const expectedEntries: ExpectedDay[] = []
  if (expectedDays.home) expectedEntries.push(expectedDays.home)
  if (expectedDays.daycare) expectedEntries.push(expectedDays.daycare)

  const dataHeight = activeRows.length * (ROW_HEIGHT + ROW_GAP)
  const expectedHeight = expectedEntries.length * (ROW_HEIGHT + ROW_GAP)
  const totalHeight = AXIS_HEIGHT + dataHeight + (expectedEntries.length > 0 ? SECTION_GAP + expectedHeight + 20 : 0) + 8

  return (
    <div className="w-full overflow-x-hidden">
      <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
        <svg
          width="100%"
          viewBox={`0 0 500 ${totalHeight}`}
          className="block"
          role="img"
          aria-label="Sleep trends chart showing daily sleep patterns"
        >
          {/* Time axis */}
          <TimeAxis y={0} />

          {/* Day rows */}
          <g transform={`translate(0, ${AXIS_HEIGHT})`}>
            {activeRows.map((row, i) => (
              <DayRowSVG
                key={row.dateKey}
                row={row}
                y={i * (ROW_HEIGHT + ROW_GAP)}
              />
            ))}
          </g>

          {/* Expected day section */}
          {expectedEntries.length > 0 && (
            <g transform={`translate(0, ${AXIS_HEIGHT + dataHeight + SECTION_GAP})`}>
              {/* Section divider */}
              <line
                x1={LABEL_WIDTH}
                x2={500 - PADDING_RIGHT}
                y1={-SECTION_GAP / 2}
                y2={-SECTION_GAP / 2}
                stroke="var(--color-border)"
                strokeDasharray="4 3"
              />
              <text
                x={LABEL_WIDTH}
                y={-2}
                className="fill-muted-foreground"
                fontSize="9"
                fontWeight="500"
              >
                Expected
              </text>

              {expectedEntries.map((exp, i) => (
                <ExpectedDayRow
                  key={exp.label}
                  expected={exp}
                  y={i * (ROW_HEIGHT + ROW_GAP) + 12}
                />
              ))}
            </g>
          )}
        </svg>
      </div>

      {/* Legend */}
      <Legend />
    </div>
  )
}

function TimeAxis({ y }: { y: number }) {
  const chartWidth = 500 - LABEL_WIDTH - PADDING_RIGHT

  return (
    <g transform={`translate(0, ${y})`}>
      {AXIS_LABELS.map(({ hour, label }) => {
        const x = LABEL_WIDTH + (hour / 24) * chartWidth
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
      {/* Baseline */}
      <line
        x1={LABEL_WIDTH}
        x2={500 - PADDING_RIGHT}
        y1={AXIS_HEIGHT - 1}
        y2={AXIS_HEIGHT - 1}
        stroke="var(--color-border)"
        strokeWidth={0.5}
      />
    </g>
  )
}

function DayRowSVG({ row, y }: { row: DayRow; y: number }) {
  const chartWidth = 500 - LABEL_WIDTH - PADDING_RIGHT

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

      {/* Daycare icon indicator */}
      {row.isDaycareDay && (
        <g transform={`translate(1, ${ROW_HEIGHT / 2 - 5})`}>
          <Building2Icon />
        </g>
      )}

      {/* Row background track */}
      <rect
        x={LABEL_WIDTH}
        y={2}
        width={chartWidth}
        height={ROW_HEIGHT - 4}
        rx={3}
        className="fill-muted/30"
      />

      {/* Midnight gridline */}
      <line
        x1={LABEL_WIDTH + (4 / 24) * chartWidth}
        x2={LABEL_WIDTH + (4 / 24) * chartWidth}
        y1={2}
        y2={ROW_HEIGHT - 2}
        stroke="var(--color-border)"
        strokeWidth={0.5}
        strokeDasharray="2 2"
        opacity={0.5}
      />

      {/* Noon gridline */}
      <line
        x1={LABEL_WIDTH + (16 / 24) * chartWidth}
        x2={LABEL_WIDTH + (16 / 24) * chartWidth}
        y1={2}
        y2={ROW_HEIGHT - 2}
        stroke="var(--color-border)"
        strokeWidth={0.5}
        strokeDasharray="2 2"
        opacity={0.5}
      />

      {/* Sleep blocks */}
      {row.blocks.map((block, i) => (
        <SleepBlockRect key={i} block={block} chartWidth={chartWidth} rowHeight={ROW_HEIGHT} />
      ))}

      {/* Night wake markers */}
      {row.nightWakes.map((nw, i) => {
        const x = LABEL_WIDTH + (nw.hour / 24) * chartWidth
        return (
          <g key={`nw-${i}`} transform={`translate(${x}, ${ROW_HEIGHT / 2})`}>
            <line
              x1={0}
              x2={0}
              y1={-(ROW_HEIGHT / 2 - 3)}
              y2={ROW_HEIGHT / 2 - 3}
              stroke={NIGHT_WAKE_COLOR}
              strokeWidth={1.5}
              opacity={0.8}
            />
            <circle
              r={2.5}
              fill={NIGHT_WAKE_COLOR}
              opacity={0.9}
            />
          </g>
        )
      })}
    </g>
  )
}

function SleepBlockRect({
  block,
  chartWidth,
  rowHeight,
  opacity = 0.85,
}: {
  block: SleepBlock
  chartWidth: number
  rowHeight: number
  opacity?: number
}) {
  const x = LABEL_WIDTH + (block.startHour / 24) * chartWidth
  const width = ((block.endHour - block.startHour) / 24) * chartWidth

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
      height={rowHeight - 6}
      rx={2}
      fill={fill}
      opacity={opacity}
    />
  )
}

function ExpectedDayRow({ expected, y }: { expected: ExpectedDay; y: number }) {
  const chartWidth = 500 - LABEL_WIDTH - PADDING_RIGHT

  return (
    <g transform={`translate(0, ${y})`}>
      {/* Label */}
      <text
        x={2}
        y={ROW_HEIGHT / 2 + 4}
        className="fill-muted-foreground"
        fontSize="9"
        fontStyle="italic"
      >
        {expected.label}
      </text>

      {/* Row background */}
      <rect
        x={LABEL_WIDTH}
        y={2}
        width={chartWidth}
        height={ROW_HEIGHT - 4}
        rx={3}
        className="fill-muted/20"
      />

      {/* Expected sleep blocks */}
      {expected.blocks.map((block, i) => {
        const x = LABEL_WIDTH + (block.startHour / 24) * chartWidth
        const width = ((block.endHour - block.startHour) / 24) * chartWidth
        const fill = block.type === 'overnight' ? EXPECTED_OVERNIGHT_COLOR : EXPECTED_NAP_COLOR

        return (
          <rect
            key={i}
            x={x}
            y={3}
            width={Math.max(width, 1)}
            height={ROW_HEIGHT - 6}
            rx={2}
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
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-3 text-xs text-muted-foreground">
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
