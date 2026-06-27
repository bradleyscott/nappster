# ADR 003: Broadcast Delete Workaround for Realtime

## Status
Accepted

## Context
Supabase Realtime's `postgres_changes` does not broadcast DELETE events when RLS is enabled, even if the deleting user has access. This breaks multi-caregiver sync for deleted events.

## Decision
After a successful delete in `useSleepEventCRUD`, broadcast a custom `delete` event on the same realtime channel. `useRealtimeSync` listens for `broadcast` events and treats them as DELETEs.

## Consequences

**Pros:**
- Keeps all clients consistent after deletions.
- No changes to RLS or database triggers needed.

**Cons:**
- Adds a second code path for DELETE handling.
- Broadcast is best-effort; missed deletes are recovered by `useBackgroundRefresh` on reconnect/visibility change.

## Related Files
- `src/lib/hooks/use-realtime-sync.ts`
- `src/lib/hooks/use-sleep-event-crud.ts`
