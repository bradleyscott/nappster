# UI Redesign — Implementation Plan

## Overview
Radically simplify Nappster's UI around button-first data entry. Chat becomes secondary (slide-up drawer). The dashboard shows different hero cards + action buttons depending on the baby's sleep state. A vertical timeline below shows today's events (newest first) with tap-to-edit. The trends page gets a visual overhaul. The profile page is cleaned up — sleep training method removed, family invite in a separate visually-distinct card.

## Files to Create

### `src/components/sleep/countdown-ring.tsx`
SVG circular progress ring. Props:
- `progress: number` (0–1, percentage of ring filled)
- `gradient: { from: string; to: string }`
- `timeRemaining: string` (e.g. "5h 12m")
- `timeLabel: string` (e.g. "until wake")
- `size?: number` (default 150)

### `src/components/sleep/subtitle-pills.tsx`
Row of pill badges. Props:
- `pills: Array<{ icon: string; label: string; dot?: boolean; color: 'lavender' | 'peach' | 'mint' | 'rose' }>`

### `src/components/sleep/action-buttons.tsx`
Two button variants:
- `PrimaryActionButton` — tall gradient with arrow →, time badge, press scale feedback
- `SecondaryActionButton` — bordered ghost style with arrow

### `src/components/sleep/state-hero.tsx`
The hero card combining: state icon → title → subtitle pills → countdown ring → expected label. Uses CountdownRing and SubtitlePills internally.

### `src/components/sleep/timeline-section.tsx`
Vertical descending-order timeline with:
- Header ("Timeline" label + "+ Log past event" button)
- Tappable timeline items (chevron hint on hover)
- Calls onAddEvent / onEditEvent callbacks
- Color-coded dots per event type

### `src/components/sleep/event-sheet.tsx`
Bottom sheet with two modes (controlled by prop):
- **add** — empty form for logging a past event
- **edit** — pre-filled form for editing an existing event
Includes: event type selector (pill buttons), date picker, time picker, context, notes field, Save + Delete.

### `src/components/sleep/chat-drawer.tsx`
- FAB button (58px, purple gradient, shadow) fixed at bottom-right
- Overlay + slide-up drawer with handle, header, chat messages + input
- Wraps existing chat functionality

### `src/components/sleep/sleep-dashboard.tsx`
Main dashboard component. Composes:
- BabyHeader (existing)
- StateHero (state-dependent)
- ActionButtons (state-dependent)
- TimelineSection
- EventSheet (hidden until triggered)
- ChatDrawer (always present)

State-based rendering:
- `overnight_sleep`: hero=lavender, buttons=[Log Wake Up, Night Wake]
- `daytime_awake` (naps): hero=peach, buttons=[Start Nap]
- `daytime_napping`: hero=mint, buttons=[Wake Up - End Nap]
- `daytime_awake` (bedtime next): hero=sunset/elevated, buttons=[Start Bedtime!]
- `awaiting_morning_wake`: hero=lavender, buttons=[Morning Wake]

### `src/components/sleep/trends-view.tsx` (replaces SleepTrendsChart)
Redesigned trends page:
- AverageDayCard: 24h timeline bar, pill nav for Home/Daycare, stat summary
- StatsRow: avg naps, avg bedtime, avg wake with trend indicators
- DayHistory: compact day rows with mini timeline bars, daycare badge inline, night wake ticks
- DayDetailSheet: vertical timeline of events (tappable), summary stats, Share + Add Event

## Files to Modify

### `src/components/chat-content.tsx` — MAJOR REFACTOR
- Remove/tone down the Conversation + TimelineRenderer + ChatInput bottom layout
- Add SleepDashboard as the primary view
- Keep all chat data passing (initialMessages, liveMessages, sendMessage, status)
- Pass events, sleepPlan, currentState, baby down to SleepDashboard

### `src/app/sleep-trends/page.tsx` — UPDATE
- Import new TrendsView component instead of SleepTrendsChart
- Update page styling and header

### `src/components/settings-form.tsx` — MAJOR REFACTOR
- Remove sleep training method entirely (field, constant array, state, DB write)
- Redesign form as two visually separate cards:
  1. **Profile Card** (white) — baby avatar circle (👶), name, birth date, pattern notes, save button
  2. **Family Card** (lavender-themed, separate bg/border/shadow) — current family members list, invite flow
- Add Danger Zone card at bottom (rose border) for data deletion
- Keep all existing hooks/logic (updateBaby, generate code, copy code)

### `src/app/globals.css` — ADDITIONS
Add component-level utility styles for:
- `.chat-fab`, `.bottom-sheet`, `.sheet-overlay`
- `.subtitle-pill` per colour variant
- `.timeline-item`, `.timeline-dot`, `.timeline-line`
- `.action-btn:active` press animation
- `@keyframes pulse-dot`
- `.profile-field`, `.family-card`, `.code-display` styles

### `supabase-schema.sql` — UPDATE
- Remove `sleep_training_method` column from babies table
- The TypeScript type `sleep_training_method` in `src/types/database.ts` will still work (it's optional/nullable) — but to be clean, remove it from the Baby type as well

## Data Flow (unchanged)

Existing hooks continue to power the new UI:
- `useTodaySleepState` → provides SleepState
- `useSleepPlanSync` → provides sleepPlan
- `useTimelineBuilder` → provides TimelineItem[]
- `useSleepEventCRUD` → provides createEvent, saveEvent, deleteEvent
- `useChatTransport` + `useChat` → provides messages, sendMessage, status

## Verification

After each task, verify:
1. `npm run build` succeeds
2. Dashboard shows correct hero/buttons for each sleep state
3. Tapping action button logs correct event
4. Timeline shows events in descending order (newest first)
5. Timeline items are tappable → edit sheet opens
6. "+ Log past event" works
7. FAB opens/closes the chat drawer
8. Chat drawer shows messages and allows sending
9. Trends page renders average day card, stats, history, detail sheet
10. Profile page: no sleep training method, two visually distinct cards
11. Family invite flow works end-to-end

## STOP Conditions

- TypeScript build errors after refactoring ChatContent — rollback and reassess
- Chat drawer loses streaming response — must preserve existing chat flow
- Sleep state detection broken — state machine must remain untouched
- Invite code generation/redemption broken — the API endpoint must remain untouched
