# Betanor Digital Business Platform

The operating platform for Betanor General Trading P.L.C.: a public technology-services website and modular internal workspace.

## Current phase

Phase 1 foundation is underway. No business database tables, RLS policies, authentication flow, or production business modules have been implemented.

## Local setup

1. Copy `.env.example` to `.env.local`.
2. Set the Supabase project URL and publishable key from Project Connect. Never put a service-role key in a `NEXT_PUBLIC_` variable.
3. Install dependencies with `pnpm install`.
4. Run `pnpm dev`.

Use Node.js 22 or later. See `docs/` for the approved architecture, conceptual data model, permissions, routes, workflows, design system, and phased plan.

## Supabase boundary

`src/lib/supabase/client.ts` is for browser code, and `src/lib/supabase/server.ts` is for Server Components, Server Actions, and Route Handlers. Authentication session refresh/protected routes are intentionally deferred to Phase 5. Database migrations are intentionally deferred to Phase 4.
