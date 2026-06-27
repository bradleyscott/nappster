# ADR 004: Mock Data Mode for Offline Development

## Status
Accepted

## Context
Developers need to run the app without a live Supabase project or OpenAI API key. Setting up a full backend for every contributor is too heavy.

## Decision
Implement a `NEXT_PUBLIC_USE_MOCK_DATA=true` mode that swaps the Supabase client for an in-memory mock client. The mock provides auth, query building, and CRUD for all used tables. All data resets on page refresh.

## Consequences

**Pros:**
- No external services required for UI/feature development.
- Services accept an injectable `SupabaseClient`, so the same code paths run in mock and production.

**Cons:**
- Mock behavior must be kept in sync with Supabase semantics.
- Cannot test RLS or realtime behavior locally.

## Related Files
- `src/lib/mock/`
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
