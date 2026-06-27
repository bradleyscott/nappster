# ADR 005: Repository/Service Layer for Data Access

## Status
Accepted

## Context
Direct `supabase.from(...)` calls were scattered across components, hooks, API routes, and AI tools. This made schema changes painful, duplicated query logic, and complicated testing.

## Decision
Introduce a typed service layer in `src/lib/services/`. Each domain entity (`sleep_events`, `sleep_plans`, `chat_messages`, `babies`, `family_members`, `invite_codes`) has a dedicated module. Services accept an injected Supabase client and return `{ data, error }` shapes.

## Consequences

**Pros:**
- Single place to change query logic or add instrumentation.
- Easier unit testing with a mocked client.
- Keeps components and hooks focused on UI/business logic.

**Cons:**
- Adds a thin abstraction layer that must be maintained.
- Service functions can grow if not kept focused.

## Rules
1. No `supabase.from('...')` calls outside `src/lib/services/`.
2. Services must work with both real and mock Supabase clients.
3. Prefer small, purpose-built functions over generic query builders.

## Related Files
- `src/lib/services/`
