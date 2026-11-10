# Umar SEO AI — working MVP

A functional early-stage SEO workspace for website owners. The current implementation is evidence-first and does not fabricate rankings, traffic, search volumes, or connected integrations.

## Implemented
- Email/password registration and login with bcrypt password hashing and signed JWT bearer tokens.
- SQLite persistence for users, projects, and audit history.
- Add a website project and run an owner-initiated, limited same-domain technical SEO crawl.
- Technical checks for titles, descriptions, H1, noindex, canonical URLs, image alt text, HTTP errors, HTML language, mobile viewport, Open Graph, JSON-LD presence, and rough visible word count. Crawler HTML responses are streamed with a 2 MB byte ceiling; robots.txt and sitemap responses use a 1 MB ceiling, enforced even when Content-Length is missing or inaccurate.
- robots.txt and sitemap inspection when reachable.
- On-page keyword signal extraction from page titles, descriptions, headings, and visible text.
- Competitor topic comparison for 1–3 user-supplied competitor websites, showing shared topics and possible topic gaps.
- Google OAuth connection with Search Console and Google Analytics read-only scopes, CSRF state validation, encrypted refresh-token storage, and disconnect support.
- Optional Gemini-powered SEO article drafts based on the latest site audit; drafts are never auto-published.
- Persistent per-project SEO task history generated from audits, with owner approval or dismissal recorded in SQLite.
- Runtime self-healing supervisor: periodic SQLite integrity checks, safe cleanup of expired one-time OAuth states, bounded event history, degraded/healthy status, and authenticated diagnostics.
- Owner-key protected source self-repair: Gemini may propose narrowly scoped `src/*.js` repairs; the engine backs up originals, applies the patch, runs the full test suite, and automatically restores files if tests fail.
- Search Console property listing and query-performance API endpoint; Analytics property listing and daily active-user/session/page-view report endpoint.
- Login/register rate limiting, API rate limiting, security headers, crawl page/time/response-size limits, and basic private-network URL blocking.

## Keyword and competitor comparison
Use the “Compare keyword topics” field on a website project and provide 1–3 competitor URLs. The feature compares visible on-page terms and phrases from the same limited crawl. It is a topic-gap aid, not live Google keyword research: it does not return search volume, keyword difficulty, rankings, SERP positions, backlinks, or traffic estimates. Current tokenization is English-focused. Review every suggested topic for relevance before publishing content.

## Deploy with a persistent Node host

A Dockerfile and Render Blueprint are included. The app uses native SQLite, so deploy it on a Node/Docker host with a persistent disk mounted at `/var/data`; do not use an ephemeral filesystem for the database. The included Render Blueprint provisions a paid Starter web service and a 1 GB persistent disk. A free ephemeral instance is not a safe production substitute because its local database can be lost on restart or redeploy.

Deployment steps:
1. Push this repository to GitHub and open Render's Blueprint flow: https://render.com/deploy
2. Connect this repository and apply `render.yaml`.
3. In the service environment, set `JWT_SECRET` (at least 32 random characters), `GEMINI_API_KEY`, and `SELF_REPAIR_KEY` (at least 32 random characters). Set `PUBLIC_BASE_URL` to the exact HTTPS service URL. Google OAuth variables are optional unless you want Google integrations; if enabled, add the callback URL `PUBLIC_BASE_URL/api/google/callback` to the Google OAuth client.
4. Deploy and confirm `/api/health` returns `{"status":"ok","product":"Umar SEO AI"}`.
5. Keep `AUTO_RESTART_AFTER_REPAIR=false` until a persistent, tested restart strategy is configured. Automatic repair can update the running container's writable source files, but a platform redeploy from the original image may discard those changes. The current setup reports `restart_required`; it does not claim to perform a durable automatic redeploy.

Never put secrets in GitHub files or the browser. The hosting account, billing approval, and secret values must be supplied by the owner; this repository change alone does not create a live deployment.

## Run locally
Requires Node.js 20 or newer.

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `JWT_SECRET` to a random value of at least 32 characters.
4. Run `npm start`.
5. Open http://localhost:3000.

## Google Search Console and Analytics connection

Set these deployment environment variables (never commit real values): `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_BASE_URL`, and `GOOGLE_TOKEN_ENCRYPTION_KEY` (exactly 64 hexadecimal characters). Set `PUBLIC_BASE_URL` to the exact HTTPS origin of the deployed app. Add this exact authorized redirect URI to the Google OAuth web client: `https://YOUR-APP-HOST/api/google/callback` (replace the host with the deployed app host). Enable the Google Search Console API, Google Analytics Admin API, and Google Analytics Data API in the same Google Cloud project. The workspace Connect Google button requests only `webmasters.readonly` and `analytics.readonly`. After user consent, refresh tokens are encrypted with AES-256-GCM before storage. The app lists available properties and exposes read-only report endpoints. Google OAuth consent-screen verification/testing-mode restrictions may apply to external users.

API additions (Bearer token required except callback): `POST /api/google/connect`, `GET /api/google/callback`, `GET /api/google/status`, `DELETE /api/google/connection`, `GET /api/google/search-console/sites`, `GET /api/google/analytics/properties`, `GET /api/google/search-console/performance?siteUrl=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`, and `GET /api/google/analytics/report?propertyId=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`.

## Gemini AI content drafts

Set `GEMINI_API_KEY` as a server-side secret (never commit it to GitHub). Optionally set `GEMINI_MODEL`; the default is `gemini-2.5-flash`. Run a technical audit, enter a topic on the project card, and choose Generate AI content draft. The endpoint uses the latest saved audit as context and returns a draft only; it does not edit or publish the customer website. Provider quotas, pricing, model availability, and regional eligibility are controlled by Google and may change.

## Umar SEO Agent V2
The technical audit endpoint also returns an evidence-based SEO action plan (`seoPlan`). Suggestions are derived from the technical audit and require review. The system does not obtain verified keyword volumes/rankings, edit customer website files, or publish changes.

## API
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me` (Bearer token)
- `GET /api/projects` (Bearer token)
- `POST /api/projects` (Bearer token; JSON: name, url)
- `POST /api/projects/:id/audit` (Bearer token)
- `POST /api/projects/:id/keyword-research` (Bearer token; JSON: competitorUrls, 1–3 URLs)
- `GET /api/projects/:id/audits` (Bearer token); `GET /api/projects/:id/tasks` and `PATCH /api/projects/:id/tasks/:taskId` (Bearer token; status `approved` or `dismissed`)
- `GET /api/health`

## Runtime self-healing and self-repair

The background supervisor checks SQLite integrity every 60 seconds and removes expired one-time OAuth state records. Set `AUTO_SELF_REPAIR=true` to enable automatic diagnostics: it runs the project test suite every 5 minutes and, only when tests fail, may request a narrowly scoped Gemini source repair. Repairs are restricted to complete JavaScript files under `src/`, limited in size, backed up under `data/self-repair-backups/`, validated with `npm test`, and automatically rolled back if validation fails. It allows at most one repair attempt every 30 minutes.

Set `AUTO_RESTART_AFTER_REPAIR=true` only when the app runs under a process manager or hosting restart policy that will restart it after process exit. Without that, a successful repair is recorded as `restart_required` and the operator must restart the process. Authenticated diagnostics are available at `GET /api/system/self-healing`. The owner-key protected manual endpoint `POST /api/system/self-repair` remains available using `SELF_REPAIR_KEY` (32+ random characters) in the `x-self-repair-key` header.

This cannot recover a crashed host, repair a corrupted database file, restore third-party credentials, or safely fix every defect. Never expose repair keys to customers or the browser.

## Not implemented yet
External keyword-volume and backlink providers, automatic on-site edits, email verification, password recovery, and production session revocation are not implemented. Task approval records owner decisions but does not itself modify a customer website; actual edits require a verified website platform/repository connector and a tested deployment path. These require consent, credentials, additional backend work, and testing. Do not treat the current JWT/local-storage login as production-grade authentication.

## Production warning
This is an MVP, not ready for unrestricted public production. Before launch, move crawling into an isolated worker with outbound firewall and DNS-rebinding protection, use HTTPS and secure HttpOnly/SameSite cookies with CSRF protection, add account recovery and email verification, a durable queue, monitoring, backups, and independent security review. Never commit `.env` or credentials.

## Tests
Run `npm test` to execute the keyword comparison, SEO action-plan, crawler URL-safety, bounded-response-reader, runtime supervisor, and self-repair/rollback regression tests.
