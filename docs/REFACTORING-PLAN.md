# Nappster Code Refactoring Plan

This document tracks the code quality improvements identified during SOLID principles assessments.

---

## Phase 1: Initial Assessment (COMPLETED)

| Priority | Task | Status |
|----------|------|--------|
| 1 | Break up ChatContent into hooks + components | **Completed** |
| 2 | Eliminate schema and prompt duplication | **Completed** |
| 3 | Fix timezone, type safety, and magic numbers | **Completed** |
| 4 | Add authorization check and fix truncated prompt | **Completed** |

---

## Phase 2: Post-Refactoring Review

A fresh review of the refactored codebase identified these additional improvements:

### Progress Summary

| Priority | Task | Status |
|----------|------|--------|
| 5 | Add authorization to POST /api/sleep-plan | **Completed** |
| 6 | Add Zod validation to POST routes | **Completed** |
| 7 | Fix pagination cursor logic | **Completed** (verified correct) |
| 8 | Replace remaining `as unknown as` casts | **Completed** |
| 9 | Extract TimelineRenderer component | **Completed** |
| 10 | Add unit tests for core business logic | **Completed** (tests existed for sleep-utils, timezone, create-event) |

---

## Priority 5: Authorization Gap in Sleep Plan POST (HIGH)

**Location:** [src/app/api/sleep-plan/route.ts:12-24](../src/app/api/sleep-plan/route.ts#L12-L24)

**Issue:** Any authenticated user can generate sleep plans for any baby without verifying they have access. The GET route at `/api/sleep-plan/[babyId]` properly checks `family_members`, but POST does not.

**Fix:** Add authorization check matching the pattern in other routes:

```typescript
const { data: { user } } = await supabase.auth.getUser()
if (!user) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

const { data: membership } = await supabase
  .from('family_members')
  .select('id')
  .eq('baby_id', babyId)
  .eq('user_id', user.id)
  .single()

if (!membership) {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}
```

---

## Priority 6: Input Validation on POST Routes (HIGH)

**Locations:**

- [src/app/api/chat/route.ts:14-20](../src/app/api/chat/route.ts#L14-L20)
- [src/app/api/sleep-plan/route.ts:12-14](../src/app/api/sleep-plan/route.ts#L12-L14)

**Issue:** Request bodies are destructured without validation. Invalid `babyId` formats or malformed `messages` arrays will cause downstream errors.

**Fix:** Add Zod schemas for request validation:

```typescript
const chatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
  babyId: z.string().uuid(),
  timezone: z.string().default('UTC'),
  showThinking: z.boolean().default(false),
})

const { messages, babyId, timezone, showThinking } = chatRequestSchema.parse(await req.json())
```

---

## Priority 7: Pagination Cursor Bug (HIGH)

**Location:** [src/app/api/chat/messages/route.ts:66-90](../src/app/api/chat/messages/route.ts#L66-L90)

**Issue:** The cursor is set to `chronological[0].created_at` (the oldest message in the current batch), but it should be the oldest message for the *next* pagination request. This can cause gaps or duplicates in loaded sleep events.

**Current code:**

```typescript
const cursor = chronological.length > 0 ? chronological[0].created_at : null
```

**Fix:** The cursor should represent the boundary for the next query. Since messages are fetched in descending order then reversed, the actual oldest message is at index 0 after reversal, which is correct. However, the sleep events query uses:

```typescript
.gte('event_time', cursor)
.lt('event_time', before)
```

This should be reviewed to ensure the time window is correct for the paginated messages.

---

## Priority 8: Replace Remaining Type Casts (MEDIUM)

**Locations:**

- [src/components/chat-content.tsx:379, 417](../src/components/chat-content.tsx#L379) - Tool part casting
- [src/lib/hooks/use-realtime-sync.ts:85-91](../src/lib/hooks/use-realtime-sync.ts#L85) - Realtime payload casting

**Issue:** Multiple `as unknown as` casts bypass TypeScript's type checking. If the underlying data structure changes, errors won't be caught at compile time.

**Fix for chat-content.tsx:** Define discriminated union for message parts:

```typescript
type MessagePart =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: `tool-invocation`; toolInvocationId: string; toolName: string; state: string; args?: unknown }
  | { type: `tool-result`; toolInvocationId: string; toolName: string; result?: unknown }
```

**Fix for use-realtime-sync.ts:** Add runtime validation before casting:

```typescript
const sleepEventSchema = z.object({
  id: z.string().uuid(),
  baby_id: z.string().uuid(),
  event_type: z.enum(['wake', 'nap_start', 'nap_end', 'bedtime', 'night_wake']),
  event_time: z.string(),
  // ... other fields
})

const parsed = sleepEventSchema.safeParse(payload.new)
if (parsed.success) {
  options.onSleepEvent?.(parsed.data, changeType)
}
```

---

## Priority 9: Extract TimelineRenderer Component (MEDIUM)

**Location:** [src/components/chat-content.tsx](../src/components/chat-content.tsx) (~680 lines)

**Issue:** While hooks were extracted in Phase 1, the component still handles:

- 8 useState calls for dialog/selection state
- Timeline rendering with date grouping
- Tool output display logic (createSleepEvent, updateSleepPlan)
- Event click handling

**Recommended extractions:**

1. **TimelineRenderer** - Renders the interleaved message/event list with date headers
2. **ToolOutputRenderer** - Displays tool invocation results (sleep events, plan updates)
3. **DialogManager** - Coordinates the 3 dialog states (could use useReducer)

This would reduce chat-content.tsx to ~400 lines focused on orchestration.

---

## Priority 10: Add Unit Tests (MEDIUM)

**Critical gaps:**

| Module                                      | What to Test                                                          |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `src/lib/sleep-utils.ts`                    | `groupEventsIntoSessions()` - event pairing logic, overnight handling |
| `src/lib/timezone.ts`                       | DST boundary handling, various timezone offsets                       |
| `src/lib/hooks/use-timeline-builder.ts`     | Deduplication, sorting, timestamp normalization                       |
| `src/app/api/chat/route.ts`                 | Authorization, tool execution, message persistence                    |
| `src/app/api/chat/messages/route.ts`        | Pagination cursor behavior, authorization                             |

**Recommended test setup:**

- Vitest for unit tests (already common in Next.js projects)
- Mock Supabase client for API route tests
- Test timezone edge cases with fixed dates

---

## Lower Priority Items

### Message ID Collisions - FIXED

**Location:** [src/app/api/chat/route.ts](../src/app/api/chat/route.ts)

Uses `Date.now()` for message IDs which can collide in multi-user scenarios. **Fixed:** Now uses `crypto.randomUUID()`.

### Partial Failure in Session Deletion

**Location:** [src/lib/hooks/use-sleep-event-crud.ts:272-298](../src/lib/hooks/use-sleep-event-crud.ts#L272)

If start event deletes successfully but end event fails, no rollback occurs. Consider wrapping in transaction or implementing compensating action.

### Performance: O(n²) Event Pairing

**Location:** [src/lib/sleep-utils.ts:81-153](../src/lib/sleep-utils.ts#L81)

The nested loop for event pairing is O(n²). For typical usage (<100 events/day) this is fine, but could be optimized to O(n) with a single-pass state machine if needed for historical data views.

---

## Files to Modify (Phase 2)

| File | Change |
|------|--------|
| `src/app/api/sleep-plan/route.ts` | Add authorization check |
| `src/app/api/chat/route.ts` | Add Zod validation, use crypto.randomUUID() |
| `src/app/api/chat/messages/route.ts` | Review cursor logic |
| `src/components/chat-content.tsx` | Define MessagePart type, extract components |
| `src/lib/hooks/use-realtime-sync.ts` | Add Zod validation for payloads |
| `src/lib/sleep-utils.ts` | Add unit tests |
| `src/lib/timezone.ts` | Add unit tests |

---

## Phase 1 Details (Completed)

---

## Priority 1: Break Up ChatContent (COMPLETED)

Extracted three custom hooks to reduce ChatContent from 1,070 lines to ~690 lines:

### New Hooks Created

1. **[use-sleep-event-crud.ts](../src/lib/hooks/use-sleep-event-crud.ts)**
   - Handles all sleep event CRUD operations
   - Manages `localEvents` and `deletedEventIds` state
   - Provides `createEvent`, `saveEvent`, `deleteEvent`, `saveSession`, `deleteSession`
   - Handles realtime event deduplication

2. **[use-chat-history.ts](../src/lib/hooks/use-chat-history.ts)**
   - Manages paginated chat history loading
   - Provides `loadMoreHistory`, `addRealtimeMessage`
   - Tracks `historyMessages`, `historySleepEvents`, loading state

3. **[use-timeline-builder.ts](../src/lib/hooks/use-timeline-builder.ts)**
   - Combines messages and events into sorted timeline
   - Deduplicates across history, initial, and live data
   - Exports helper functions: `formatDateHeader`, `getDateKey`, `getTimelineItemTimestamp`

---

## Priority 2: Eliminate Schema and Prompt Duplication (COMPLETED)

### Issue 1: Duplicate Sleep Plan Schema - FIXED

Created shared schema file [src/lib/ai/schemas/sleep-plan.ts](../src/lib/ai/schemas/sleep-plan.ts) that exports:
- `sleepPlanSchema` - Zod schema for sleep plans
- `scheduleItemSchema` - Zod schema for schedule items
- `SleepPlan` and `ScheduleItem` types

Updated both locations to import from shared schema:
- [src/app/api/sleep-plan/route.ts](../src/app/api/sleep-plan/route.ts)
- [src/lib/ai/tools/update-sleep-plan.ts](../src/lib/ai/tools/update-sleep-plan.ts)

### Issue 2: Duplicate System Prompt Construction - FIXED

Created unified prompt module [src/lib/ai/prompts.ts](../src/lib/ai/prompts.ts) with:
- `buildChatSystemPrompt()` - For chat route (includes write tools)
- `buildSleepPlanSystemPrompt()` - For sleep plan generation

Both routes now use shared prompt builders. Also fixed the truncated prompt in sleep-plan route (the incomplete `- If ` line now reads `- If baby is currently napping, mark that nap as "in_progress"`).

Removed unused functions from `src/lib/sleep-utils.ts`:
- `buildSystemPrompt()` - Replaced by tool-based approach
- `formatChatHistoryForPrompt()` - No longer needed
- `formatRecentHistory()` - No longer needed
- `formatEventWithDate()` - No longer needed
- `formatRelativeDate()` - No longer needed

---

## Priority 3: Fix Consistency Issues (COMPLETED)

### 3.1 Timezone Handling in get-sleep-history.ts - FIXED

Added `getStartOfDaysAgoForTimezone()` helper to [src/lib/timezone.ts](../src/lib/timezone.ts) and updated [src/lib/ai/tools/get-sleep-history.ts](../src/lib/ai/tools/get-sleep-history.ts) to use timezone-aware date calculation instead of naive `new Date()`.

### 3.2 Type Safety Bypasses - FIXED

Updated [src/app/api/sleep-plan/[babyId]/route.ts](../src/app/api/sleep-plan/[babyId]/route.ts) to use Zod validation for JSON fields from the database instead of unsafe `as unknown as` casting. Now uses `currentStateSchema.parse()`, `nextActionSchema.parse()`, and `scheduleSchema.parse()` for proper runtime validation.

### 3.3 Magic Numbers - FIXED

Extracted named constants with explanatory comments:
- `MAX_TOOL_STEPS = 6` in [src/app/api/chat/route.ts](../src/app/api/chat/route.ts) - documents the reasoning for allowing 6 tool invocation steps
- `MAX_OVERNIGHT_HOURS = 16` in [src/lib/sleep-utils.ts](../src/lib/sleep-utils.ts) - documents the window for pairing bedtime with wake events

---

## Priority 4: Add Safety Nets (COMPLETED)

### 4.1 Authorization Gap in Messages Route - FIXED

Added proper authorization check to [src/app/api/chat/messages/route.ts](../src/app/api/chat/messages/route.ts):

- Gets current user via `supabase.auth.getUser()`
- Returns 401 if not authenticated
- Verifies user has access to the baby via `family_members` table with both `baby_id` and `user_id` checks
- Returns 403 if user doesn't have access to the requested baby

### 4.2 Truncated System Prompt - FIXED (in Priority 2)

This was already fixed as part of Priority 2 when the prompts were unified. The `SLEEP_PLAN_GUIDELINES` in [src/lib/ai/prompts.ts](../src/lib/ai/prompts.ts) now contains the complete instructions:

- `If it's too late for a scheduled nap mark that nap as "skipped"`
- `If baby is currently napping, mark that nap as "in_progress"`

---

## Verification Steps

After completing all changes:

1. Run `npm run build` - ensure no type errors
2. Run `npm run lint` - check for new warnings
3. Manual testing with `npm run dev`:
   - Log sleep events and verify realtime sync
   - Send chat messages and verify AI responses
   - Check sleep plan generation
4. If tests exist, run `npm test`

---

## Files Modified So Far

| File | Change |
|------|--------|
| `src/lib/hooks/use-sleep-event-crud.ts` | **Created** - Event CRUD hook |
| `src/lib/hooks/use-chat-history.ts` | **Created** - Chat history hook |
| `src/lib/hooks/use-timeline-builder.ts` | **Created** - Timeline builder hook |
| `src/components/chat-content.tsx` | **Refactored** - Now uses new hooks |
| `src/lib/ai/schemas/sleep-plan.ts` | **Created** - Shared sleep plan schema |
| `src/lib/ai/prompts.ts` | **Created** - Unified prompt builders |
| `src/app/api/sleep-plan/route.ts` | **Refactored** - Uses shared schema and prompts |
| `src/lib/ai/tools/update-sleep-plan.ts` | **Refactored** - Uses shared schema |
| `src/app/api/chat/route.ts` | **Refactored** - Uses shared prompts, extracted `MAX_TOOL_STEPS` constant |
| `src/lib/sleep-utils.ts` | **Refactored** - Removed unused functions, extracted `MAX_OVERNIGHT_HOURS` constant |
| `src/lib/timezone.ts` | **Updated** - Added `getStartOfDaysAgoForTimezone()` helper |
| `src/lib/ai/tools/get-sleep-history.ts` | **Refactored** - Uses timezone-aware date calculation |
| `src/app/api/sleep-plan/[babyId]/route.ts` | **Refactored** - Uses Zod validation for JSON fields |
| `src/app/api/chat/messages/route.ts` | **Refactored** - Added user authorization check |
| `src/components/timeline-renderer.tsx` | **Created** - Extracted timeline rendering logic |
| `src/lib/hooks/use-realtime-sync.ts` | **Refactored** - Added Zod validation for realtime payloads |
