# Type Assertions Audit

Audit of `as` type assertions in non-test source code, conducted 2026-06-27.

## Summary

~50 `as` casts found across `src/lib/`, `src/components/`, and `src/app/`. Most fall into safe patterns. The risky ones are documented below.

## Risk Levels

| Level | Meaning | Count |
|-------|---------|-------|
| 🔴 Red | No runtime validation, untrusted data | 6 |
| 🟡 Yellow | Pattern-based assumption, low risk | 12 |
| 🟢 Green | Deliberate structural cast, safe | ~30 |

## 🔴 Red (Should Fix)

### 1. `timeline-renderer.tsx:91,103` — `parts as Array<{type: string; text?: string}>`
- Casts `message.parts` from `Json` to a parsed structure with no validation.
- Risk: If database stores malformed parts, component silently renders nothing.
- Fix: Add a type guard or zod schema.

### 2. `sleep-plan-card.tsx:83-84` — `plan.schedule as unknown as ScheduleItem[]`
- Double cast (`unknown` then `ScheduleItem[]`), bypasses all type checking.
- Risk: Completely unchecked — runtime data could be anything.
- Fix: Validate with zod or provide fallback.

### 3. `api/chat/route.ts:247,266,294` — Multiple `as` casts on tool output
- Casts `output as Record<string, unknown>`, `o.summary as Record<string, unknown>`.
- Risk: Untrusted data from OpenAI tool calls with no validation.
- Fix: Validate tool outputs with zod schemas.

## 🟡 Yellow (Low Risk / Should Validate)

### 4. Dialog components — `context as Context`, `event_type as EventType`
- `unified-event-dialog.tsx:64,84`
- `sleep-event-dialog.tsx:70,76,180`
- `sleep-session-dialog.tsx:75,211`
- Risk: If data comes from external source, string may not match union type.
- Mitigation: UI selects restrict values, but direct API calls could bypass.

### 5. Service layer — `data as Type | null`
- Every service file has this pattern for Supabase responses.
- Risk: Low — Supabase returns what the schema says, and the cast matches.
- Fix: Not practical without upstream type improvements.

### 6. Mock mode — `createMockClient() as unknown as ReturnType<createBrowserClient>`
- `supabase/client.ts:8`, `supabase/server.ts:9`
- Risk: Low — mock client intentionally duck-types the real client interface.
- Fix: Would require shared interface/abstract class.

### 7. AI tools — `events as SleepEvent[]`
- `get-today-events.ts:46,56`
- Risk: Low — data comes from the same Supabase table, just mutated upstream.

## Action Plan

1. Extract a `validateParts()` helper for `timeline-renderer.tsx` — ✅
2. Add zod schema for `sleep-plan-card.tsx` schedule/nextAction — ✅
3. Add type guard helpers for dialog Context/EventType casts — ✅
4. Add zod schemas for AI tool outputs in `api/chat/route.ts` — deferred (requires more extensive refactor)
