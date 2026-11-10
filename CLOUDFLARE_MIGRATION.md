# Cloudflare free-hosting migration

This directory contains the first database migration for moving UMA SEO AI from local SQLite to Cloudflare D1.

## Important status

This is migration groundwork, **not a deployable replacement for the current application yet**. The existing application still starts with Express and the native `sqlite3` package. It must not be pointed at Cloudflare Workers until the API runtime, database access layer, authentication, crawler networking, Google OAuth callback, and tests have been ported and verified.

## Database migration

The schema in `migrations/0001_initial.sql` mirrors the current SQLite tables and indexes:

- users and projects
- audits and saved SEO task approvals
- Google OAuth connection records and temporary OAuth states
- bounded system event history

The migration intentionally does not contain user data or secrets. Existing SQLite customer data will need a separate, verified export/import process before any production cutover.

## Free-tier design target

- Cloudflare Workers for the API and static frontend delivery.
- Cloudflare D1 for persistent relational data.
- Cloudflare environment secrets for JWT and Google/Gemini credentials, only if those integrations are configured.
- No paid Render service and no persistent SQLite disk.

Cloudflare free-plan quotas and provider limits can change. Check the account's current limits before launch. The app must enforce per-user request limits and crawl limits so one account cannot exhaust shared quotas.

## Required porting work before deployment

1. Replace Express startup/middleware with a Workers-native request router.
2. Replace `src/db.js` with parameterized D1 query helpers and adapt every route to D1's result shape.
3. Port password hashing and JWT verification to Workers-compatible APIs; preserve current password compatibility.
4. Port the crawler to Workers-compatible fetch with strict redirect, DNS/private-network, response-size, timeout, and robots.txt protections.
5. Port Google OAuth using Workers Web Crypto and D1 state storage; verify exact callback and token encryption behavior.
6. Remove process-based self-repair and restart logic from the Workers runtime. Replace it with health checks and versioned deployments/rollback; never let an AI agent rewrite deployed source code at runtime.
7. Add integration tests for registration, login, ownership isolation, project CRUD, audit, task review, Google OAuth state, and quota/error handling.
8. Only deploy after all tests pass and a staging smoke test succeeds.

Do not delete the existing Express/SQLite implementation during migration. Keep it on `main` until the Cloudflare version is complete and verified.
