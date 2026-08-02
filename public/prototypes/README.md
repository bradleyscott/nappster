# Nappster · Hallmark Prototypes

Three dashboard redesign concepts, built with the **Hallmark** anti-slop design skill
([github.com/Nutlope/hallmark](https://github.com/Nutlope/hallmark)) applied to Nappster
itself — a dogfood run: the skill's rules were used to redesign this app's own UI.

Open `index.html` in a browser to flip between the three concepts, or serve them from the
app (`npm run dev` → `/prototypes/`).

| | A · The Sun & Moon | B · The Quiet Card | C · The Sleep Daybook |
|---|---|---|---|
| **Genre** | playful | modern-minimal | editorial |
| **Macrostructure** | Stat-Led | Bento Grid | Long Document |
| **Theme** | Hum | Coral | Newsprint |
| **Paper** | light pear-cream `oklch(97% 0.012 95)` | light warm-grey `oklch(96.5% 0.005 50)` | mid warm-cream `oklch(92% 0.045 50)` |
| **Display style** | rounded sans (Plus Jakarta Sans) | grotesk sans (Geist) | serif (Playfair Display) |
| **Accent system** | multi (pear / cyan / coral) | single coral, highlighter-only | single ink-brown |
| **Nav archetype** | N7 brutal-slab top bar | N5 floating pill bottom nav | N6 newspaper masthead |
| **Enrichment** | Tier B hand-built SVG (moon) + star-burst | none — typography only | Tier B hand-built SVG (crescent) |
| **Motion** | press-physics buttons, counter tick-up, star-burst | hover-lift only, no bounce | one quiet entrance, no bounces |

All three concepts show the **same moment** (Tuesday 2:28 pm — Luna napping, asleep since
1:04 pm) so the fingerprints are comparable, and all three carry the same information
architecture from `.plans/ui-redesign/context.md`: state hero → action buttons → timeline →
tonight → bottom tabs, with chat as a separate surface.

## Why three, and why these three

The Hallmark skill's core claim is structural variety: two outputs for two briefs should not
be colour-swaps of one template. The three concepts are categorically distant on every
diversification axis the skill tracks:

- **Macrostructure** differs on every pair: Stat-Led (A) vs Bento Grid (B) vs Long Document (C).
- **Theme axes** differ on ≥ 2 of 3 per pair: display style (rounded / grotesk / serif),
  paper band (light / light / mid), accent system (multi / single / single-but-different-hue).
- **Nav archetypes** differ: N7 / N5 / N6. **Enrichment** differs: hand-built SVG / none / hand-built SVG.

The trio also maps to real parent personalities: **A** for "the app feels alive" (warm,
exuberant), **B** for "the app stays out of the way" (calm, precise), **C** for "the log is a
keepsake" (quiet, literary). The playful register (A) is the canonical match for the brief's
"babies & toddlers" domain; B and C show the skill's range beyond pastel defaults.

## Pre-flight findings (the project Hallmark scanned)

- **Font stack:** Geist + Geist Mono (`next/font`, `src/app/layout.tsx`) — preserved for any
  eventual implementation.
- **Palette:** OKLCH custom properties in `src/app/globals.css` (`:root`); the current hero
  accents use hex purples/peaches with gradients.
- **Motion:** `motion` v12 in `package.json` — motion-on project.
- **Framework:** Next.js 16 · Tailwind v4 · Radix UI/shadcn.

**Overrides introduced by the themes** (the skill preserves project defaults unless a theme
spec says otherwise): A swaps the sans pairing to Plus Jakarta Sans + JetBrains Mono (Hum's
canonical stack), C introduces a serif pairing for the editorial register. If the user wants
Geist preserved across all three, B is the concept that already keeps it.

## Hallmark disciplines applied

- **Locked tokens** — every colour/font in each `styles.css` references `tokens.css` vars;
  no inline hex/OKLCH in layout CSS.
- **No gradient text, no purple→cyan gradients, no glassmorphism** (gates 2, 9–11).
- **Roman display type** — no italic headers anywhere (gate 38a).
- **No emoji-as-icons** — all iconography is hand-built inline SVG (sun, cloud, moon,
  sparkle), stroke `currentColor` (playful genre ban).
- **No re-drawn fake chrome** — no drawn phone frames, browser bars, or device bezels
  (gate 47). The prototypes render at app width with the theme's own paper as the ground.
- **Honest copy** — no invented metrics; the sample day is labelled as such, and the
  "expected" times are marked "from your sleep plan" (gate 46).
- **Buttons-first IA** preserved — the design direction from the ui-redesign plan.
- **Mobile floor verified at 320 / 375 / 414 / 768** — `overflow-x: clip` on `html`/`body`,
  no two-line clickable text, `minmax(0, 1fr)` grid tracks, section heads collapse to one
  column (gates 34, 49–53).
- **`prefers-reduced-motion`** honoured in all three (counters render at final value,
  star-burst and entrances disabled, hovers collapse to colour-only).
- **2+1 type ceiling** — each concept uses exactly two or three families (gate 45).
- **Ink at opacity, not new hexes** — Hum body copy uses `--color-ink-2`/muted tokens
  rather than alpha-piled greys.

## Slop-test self-audit

The skill's 58-gate slop test was run as a post-emit check on each concept. Key gates and
their status:

| Gate | Status |
|---|---|
| 1–2 gradient text / purple-cyan gradients | pass — none present |
| 4 card-in-card | pass |
| 6 centred-everything heroes | pass — A is figure-led, B is left-aligned tiles, C is left-biased opening |
| 7 pure black/white paper or ink | pass — all papers/inks carry chroma |
| 12 bouncy easings everywhere | pass — bounce reserved for Hum's primary CTA only |
| 19 placeholder names / invented testimonials | pass — no testimonials; sample day labelled |
| 34 `overflow-x` handling | pass — `clip`, never `hidden` |
| 38a italic headers | pass — all display roman |
| 43 AI-footer fingerprint | pass — bottom tabs are app chrome, not a 4-column link grid |
| 45 >3 font families | pass — 2–3 per concept |
| 46 invented metrics | pass — data is labelled sample |
| 47 re-drawn chrome | pass — no fake frames |
| 49–53 responsive non-negotiables | pass — verified at 320/375/414/768 |
| 54 emoji-as-decoration | pass — no emoji in the UI |

**Pre-emit critique scores** (philosophy / hierarchy / execution / specificity / restraint /
variety) are stamped at the top of each `tokens.css`/`styles.css`:

- A · Hum: `P5 H4 E5 S4 R4 V4`
- B · Coral: `P5 H5 E5 S4 R4 V4`
- C · Newsprint: `P5 H4 E5 S4 R4 V4`

## Mapping back to the Next.js app

If one concept is chosen, the path to production:

1. **A (Hum)** is the closest to the current ui-redesign direction (playful, rounded,
   buttons-first) — it would replace the hex/gradient accent map in `state-hero.tsx` with
   the Hum OKLCH tokens, swap fonts to Plus Jakarta Sans, and rebuild `action-buttons.tsx`
   on the push-button system (colour-edge shadow + press feedback).
2. **B (Coral)** means pulling the palette back to one accent: `globals.css` gets the Coral
   tokens, the bento tiles become the dashboard's section grid, and the floating pill nav
   replaces the current tab layout. Minimal motion cost — closest to the existing codebase's
   restraint.
3. **C (Newsprint)** is a bigger typographic commitment (serif stack + editorial rhythm);
   it shines on the Trends page too (the daybook register fits a daily-history view).

Each prototype's `tokens.css` is designed to be lifted almost verbatim into the app's CSS
variables; `styles.css` maps 1:1 to the dashboard sections (hero → `StateHero`, actions →
`ActionButtons`, timeline → `TimelineSection`, tabs → page nav).

## Files

```
public/prototypes/
  index.html            ← concept gallery (start here)
  README.md             ← this document
  hum/      index.html · tokens.css · styles.css
  coral/    index.html · tokens.css · styles.css
  newsprint/ index.html · tokens.css · styles.css
```

Run history is recorded in `.hallmark/log.json` at the repo root per the skill's
project-memory rule, so any future Hallmark runs on Nappster diversify against these picks.
