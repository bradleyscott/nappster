# Nappster Quality Improvement Plan

## Context
Nappster is a Next.js 16 PWA for baby sleep tracking with AI recommendations. The app works, but the codebase has accumulated quality and architectural debt: lint/type regressions, 14.47% test coverage, no CI, a 544-line chat component, hand-rolled state synchronization, and no data-access abstraction.

## Goals
1. Make the repository green and keep it green (lint, types, tests, build).
2. Raise test coverage and add component/API tests so future refactors are safe.
3. Refactor the chat/state-sync layer and introduce a service/repository layer.
4. Harden error handling and add observability.
5. Document the architecture so it stays accurate.

## Key Constraints
- Keep mock-data mode working; any new service layer must accept an injectable Supabase client.
- Preserve the tool-based AI architecture and the sleep-state machine.
- Do not break the realtime multi-caregiver sync behavior while refactoring it.

## Phasing
- **Phase 1 (Stabilize)**: t-001
- **Phase 2 (Test)**: t-002, t-003 (can run in parallel after t-001)
- **Phase 3 (Refactor)**: t-004 → t-005 → t-006 (sequential)
- **Phase 4 (Ship Quality Gates)**: t-007
- **Phase 5 (Document)**: t-008

## Riskiest Areas
- State synchronization in `chat-content.tsx` / `use-sleep-event-crud.ts` / `useTimelineBuilder.ts`. Do not refactor this without tests in t-002/t-003 covering the existing behavior.
- AI tool contracts (`createSleepEvent`, `updateSleepPlan`) are implicit in the UI rendering. Add tests before changing message-part shapes.

## Verification Philosophy
Every task ends with running the full gate: `npm run lint && npx tsc --noEmit && npm run test && npm run build`.