# UI Redesign — Context

## Intent

Redesign Nappster's UI around user behaviour observations:
- Users predominantly enter data via **buttons, not chat**
- Make button-based sleep event logging the **primary interface**
- Chat becomes a **secondary UI** accessed via FAB button → slide-up drawer

## Design Direction

**Playful & colourful** — pastel palette (lavender, peach, mint, rose, sunset), large rounded shapes, gradient buttons, emoji icons, soft shadows. Fun and approachable feel matching the logo.

## Final Decisions

### Dashboard (v5)
| Element | Choice |
|---------|--------|
| Chat placement | **Slide-up drawer** with purple gradient FAB at bottom-right |
| Countdown | **Large circular ring** with SVG progress arc, colour-coded by state |
| State status | **Subtitle pills** — event pill first (e.g. "Bedtime 7:32pm"), then state pill (e.g. "Sleeping for 2h 18m") |
| Action buttons | **Tall gradient buttons** with arrow → indicator, time badge, press:scale feedback. Secondary: ghost style with border |
| Timeline | **Vertical connected-dots timeline**, newest on top, labelled "Timeline", scrolls down into past |
| Add event | **"+ Log past event" pill button** next to Timeline header, opens bottom sheet |
| Edit events | **Tap any timeline item** → opens edit bottom sheet with event type, date, time, context, notes, delete |
| State 4 (bedtime) | Elevated hero card with subtle sunset gradient background |

### Trends Page (v2)
| Element | Choice |
|---------|--------|
| Typical Day | **Visual 24h timeline bar** with colour-coded blocks, no text labels |
| Context switcher | **Pill nav** (`🏠 Home` / `🏫 Daycare`) inside the card header |
| Night wakes | **Subtle 2px vertical ticks**, 35% opacity, thin rose colour |
| Stats row | 3 cards: Avg Naps, Avg Bedtime, Avg Wake — each with trend indicator |
| Day history | **Compact rows** with mini timeline bars, daycare badge inline next to day name |
| Detail sheet | **Vertical timeline** with tappable event rows, edits individual events |

### Profile & Family Page
| Element | Choice |
|---------|--------|
| Sleep training method | **Removed entirely** — no field in profile |
| Profile card | White card with baby avatar circle (👶), name, birth date, pattern notes |
| Family section | **Visually separate** lavender-themed card with distinct border/background |
| Family members | Listed with avatar initials, name, email, connection status |
| Invite flow | Gradient button "Generate Invite Code" → code display in dashed lavender box with copy + new code |
| Danger zone | Rose-border card at bottom for data deletion |

### Removed / Deferred
- Sleep training method — removed from both UI and DB schema
- Schedule mini-card on awake state — redundant
- Bottom chips — removed entirely

## Implementation Plan

### Phase 1: Main Dashboard
1. Refactor ChatContent to new layout: dashboard as primary view, chat as secondary drawer
2. Create state-driven dashboard components (hero, countdown ring, pills, buttons)
3. Build vertical timeline with add/edit interactions
4. Wire up data from existing hooks
5. Build chat drawer with FAB

### Phase 2: Trends Page
6. Redesign sleep trends page with average day card, stats, history rows, detail sheet

### Phase 3: Profile & Family Page
7. Redesign SettingsForm with profile card + separate family card
8. Remove sleep training method from UI and DB

### Phase 4: Polish
9. Dark mode adaptation
10. Animations (state transitions, drawer open/close)
