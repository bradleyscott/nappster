# ADR 001: Tool-Based AI Architecture

## Status
Accepted

## Context
Nappster's AI needs up-to-date baby sleep data to make recommendations. Two options were considered:

1. **Pre-inject all context** into the system prompt (profile, today's events, history, trends).
2. **Tool calling** – the AI decides which data to fetch and can write data back.

## Decision
Use tool calling with the Vercel AI SDK. The model receives a compact system prompt and a set of typed tools (`getBabyProfile`, `getTodayEvents`, `createSleepEvent`, `updateSleepPlan`, etc.).

## Consequences

**Pros:**
- Reduces token waste by fetching only the data the AI actually needs.
- Enables dynamic queries (e.g., "show me last Tuesday").
- Write operations happen during inference, keeping AI and UI state in sync.

**Cons:**
- Requires careful tool contracts and runtime validation.
- Multi-step tool loops need step limits and timeout handling.
- Tool outputs rendered in the UI must be stable across SDK versions.

## Related Files
- `src/lib/ai/tools/`
- `src/app/api/chat/route.ts`
