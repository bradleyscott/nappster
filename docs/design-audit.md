# Nappster · Hallmark Design Audit

Target: existing dashboard surfaces — `src/components/sleep/*` + `src/app/globals.css`.
Verb: `hallmark audit` (score against the named anti-patterns; no edits).
Date: 2026-08-02. Branch: `hallmark-prototypes`.

**Structural fingerprint check:** the dashboard's IA is sound — state-driven hero, buttons-first
logging, timeline, tabs. It does **not** use the AI landing-page template (no centered
hero/3-cards/CTA/footer rhythm). The slop is in the *treatment*, not the structure.

**What the audit found that's already right:** greys are tinted toward the anchor hue
(`--text-secondary: #8B88A0`), the countdown uses tabular numerals, tap targets are large,
and every animation is gated behind `prefers-reduced-motion` — the motion layer respects
accessibility even where it over-animates.

---

## Critical — ships as slop

**[critical] Purple-gradient hero + gradient buttons** — `action-buttons.tsx:8-20`,
`state-hero.tsx:24-45`, `chat-drawer.tsx:90,191`
The primary surface is a purple gradient (`linear-gradient(135deg, var(--lavender), #7C4DFF)`)
with white centred text, plus a shine overlay and purple-tinted glow shadows. This is the
single most-recognised AI aesthetic; it is also used for the FAB, the send button, and the
hero background (`elevatedBg` fades pastel → white).
→ Fix: one anchor hue, solid fills, tint the neutrals. The gradient layer should be deleted,
not redesigned.

**[critical] Aurora-blob mesh + breathing glow + gradient ring — three gradient layers in one view** —
`globals.css:317-330` (`.hero-mesh`, 3 radial gradients, `blur(50px)`, animated 8s),
`globals.css:340-350` (`.ring-glow` radial halo, 2.8s pulse), `countdown-ring.tsx:44-52`
(gradient stroke arc). The hero carries the mesh, a glowing halo behind the ring, *and* a
gradient ring simultaneously.
→ Fix: keep at most one gradient layer per view — or none; a solid accent arc on a tinted
surface reads stronger and calmer.

**[critical] Dual token systems + hardcoded hex mid-render** — `globals.css:53-66` defines a
hex pastel palette (`--lavender: #B48BFF` …) while `globals.css:81-114` defines an OKLCH
green-hue shadcn palette (`--primary: oklch(0.45 0.12 145)`). The app chrome is green, the
app surfaces are purple — two palettes disagreeing on the same page. On top of that,
components hardcode values that bypass both: `#7C4DFF` (`action-buttons.tsx:8`), `#F0EDF5`
(`countdown-ring.tsx:76`, `state-hero.tsx:137,153`, `chat-drawer.tsx:173,192`), `#E8E5F0`
(`timeline-section.tsx:119`), `#F8F5FF` + `rgba(0,0,0,0.015)` (`trends-view.tsx:149`), `#DDD`
(trends detail grip).
→ Fix: one token system; every colour goes through a named token. Decide the anchor hue
once (the OKLCH layer or the pastel layer, not both).

---

## Major — looks AI-generated

**[major] Emoji as the icon system, mixed with a real icon library** — `event-sheet.tsx:9-24`
(☀️ 😴 🌤️ 🌙 👀 🏠 🏫 ✈️), `trends-view.tsx:195-207,434-449` (😴 🌙 ☀️ 🏫), `timeline-section.tsx:107`
(📋 empty state), hero "expected" labels — while `lucide-react` is installed and used in
`dialog.tsx`, `sleep-plan-card.tsx`, `sleep-event-fields.tsx`. Emoji render differently on
every OS, have no stroke voice, and mix a line-icon language with a blob-emoji language.
→ Fix: one icon system — lucide-react is already a dependency; replace emoji with lucide
icons across the sleep components (and keep them out of tests/mocks only).

**[major] Accent-as-flood — five accents on stage at once** — `globals.css:54-66` +
`subtitle-pills.tsx:9-16`, `state-hero.tsx:24-45`, `trends-view.tsx` colour maps. Lavender,
peach, mint, rose, and sunset all appear as fills, text colours, and borders on the same
screen; the gradient buttons use accent as a full-width background fill.
→ Fix: one accent (max two). Everything else becomes a neutral tint of the anchor hue.

**[major] Bouncy overshoot easings on UI** — `globals.css:391` (ring progress transition),
`:403` (`btnIn`), `:424` (`rowIn`), `chat-drawer.tsx:115` — `cubic-bezier(0.34, 1.56, 0.64, 1)`
on buttons, rows, and the ring.
→ Fix: exponential ease-out for UI state; reserve overshoot for real drag physics.

**[major] Everything animates; the page never settles** — `action-shimmer` 7s sweep
(`globals.css:372-377`), staggered `rowIn` per timeline row (`:415-432`), `pulse-dot`,
`activeDotGlow` (`:412-413`), `heroMeshMove`, `ringBreath`, plus `bar-grow` / `stat-pill-pop`
in trends. Every element has an entrance or a loop.
→ Fix: one orchestrated entrance on load; everything else just sits there.

**[major] Single-family typography, weight-only hierarchy** — `layout.tsx:7-8` Geist + Geist
Mono; the dashboard signals hierarchy with `font-black`/`font-extrabold` at every level
(`action-buttons.tsx:38,42`, `timeline-section.tsx:96`, `state-hero` `text-xl font-black`).
A one-font page with weight as the only scale reads as a template.
→ Fix: pair Geist with a display face (a rounded-sans or serif for the playful register);
use size + a true weight contrast (≥300 units), not font-black everywhere.

**[major] Coloured glow shadows / halos** — `rgba(124,77,255,0.25)` under gradient buttons
(`action-buttons.tsx:9-21`), the chat avatar (`chat-drawer.tsx:127`), and the active timeline
dot's 0→8px box-shadow halo (`globals.css:412-413`).
→ Fix: neutral-tinted shadows; elevation via lightness, never a coloured halo.

**[major] Icon-tile feature cards / three equal stat cards** — `trends-view.tsx:194-207` —
three identical TrendCards, each an emoji on top, value, label. The universal template unit.
→ Fix: vary the shape — one wide card, an inline stat row, or typographic numerals without
the emoji tile.

**[major] Hover-only affordances** — `timeline-section.tsx:135-137` — edit chevrons are
`opacity-0` until `group-hover`; touch users get no affordance (the row is tappable, but
nothing says so).
→ Fix: always-visible subtle chevron, or an explicit "tap to edit" hint, or colour the row
to signal interactivity.

**[major] Pure-white surfaces on a warm palette** — `state-hero.tsx:27-45` (`bg-white` +
gradients ending at `white 100%`), `chat-drawer.tsx:115` (`bg-white` sheet), white pills on
`#FFF8F0` ground. Flat synthetic white in a cream register.
→ Fix: tinted paper surfaces (cream) with a hairline border for separation.

---

## Minor — small taste issues

**[minor] Centred-everything in the hero** — `state-hero.tsx:120,137` — ring centred, the
"expected" pill centred full-width. The centred ring is defensible for a countdown; the
centred full-width pill below it adds up to a centred stack.
→ Fix: bias the pill left, or let the hero lead left with the ring as the one centred object.

**[minor] Arbitrary z-index without a scale** — `chat-drawer.tsx:90,115` (`z-15`, `z-14`),
trends detail sheet (`z-20`, `z-30`).
→ Fix: a named 6-level scale.

**[minor] Glyph-as-icon** — `state-hero.tsx:144` (`▼` rotation arrow), trend sheet grip
(`bg-[#DDD]`). The chevron should be an SVG icon or lucide `ChevronDown` (already used in
`sleep-plan-card.tsx`), and the grip should use a token.

---

## Summary

**4 critical · 9 major · 3 minor**

**Verdict — ships as slop.** The purple-gradient stack, the emoji icon system, and the
bouncy-everything motion are the exact tells the anti-pattern list names. The structure and
IA are good — the fix is a treatment pass, not a rebuild: one anchor hue with solid fills,
one icon system (lucide), one orchestrated entrance, token discipline, and a typographic
pairing.
