# Cloudflare Workers migration

This branch contains a Workers-native API and the existing browser dashboard served as Cloudflare static assets. It is a migration track; the original Express/SQLite app remains on `main`.

## Implemented on this branch

- D1-backed registration, login, profile and project endpoints
- Web Crypto HMAC-SHA256 JWT sessions and bcrypt password hashing
- Owner-scoped project and audit records
- Bounded technical crawler (maximum 8 pages) with same-origin checks and local/private IP-literal blocking
- Proposed SEO task records with approve/dismiss workflow (approval does not edit a site)
- Competitor title/meta topic comparison (not live keyword-volume/ranking data)
- Gemini content draft generation (draft only; never publishes)
- Google OAuth connection with one-time signed state, AES-GCM encrypted refresh tokens and read-only Search Console / Analytics endpoints
- Static dashboard assets served from `public/`
- GitHub Actions test and dependency-audit workflow

## Not yet implemented

- CMS/repository connectors that can safely apply approved website edits
- Live keyword volume, keyword difficulty, backlink or rank-tracking provider
- Production account protections such as email verification, password reset, session revocation and API rate limiting
- A verified production deployment

Do not describe this migration as a fully autonomous SEO agent yet. The crawler and AI drafts are working components, but they do not publish edits or guarantee ranking changes. Hostnames are fetched through the Worker platform's network resolver; the crawler does not pin DNS answers to prevent a hostile domain changing its DNS between checks.

## Free-tier setup

1. Create a Cloudflare D1 database named `uma-seo-ai` in your Cloudflare dashboard.
2. Copy its database ID into `wrangler.toml` where `REPLACE_WITH_YOUR_D1_DATABASE_ID` appears.
3. Install project dependencies with `npm install`.
4. Set a strong, unique JWT secret: `npx wrangler secret put JWT_SECRET`.
5. Set `PUBLIC_BASE_URL` to the exact deployed HTTPS origin, e.g. `https://YOUR-WORKER.workers.dev`, using `npx wrangler secret put PUBLIC_BASE_URL`.
6. For Google integration, set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and `GOOGLE_TOKEN_ENCRYPTION_KEY` with `npx wrangler secret put NAME`. Generate the encryption key as 64 hex characters (for example `openssl rand -hex 32`). In Google Cloud Console, enable Search Console API, Google Analytics Admin API and Google Analytics Data API, then add `https://YOUR-WORKER.workers.dev/api/google/callback` as an authorized redirect URI. These Google settings are optional if you do not need Google reports.
7. Set the Gemini key as a Worker secret: `npx wrangler secret put GEMINI_API_KEY`. It is required only for AI article drafts; audit and project features work without it.
8. Apply the D1 schema: `npx wrangler d1 migrations apply uma-seo-ai --remote`.
9. Deploy: `npx wrangler deploy`.
10. Verify `https://YOUR-WORKER.workers.dev/api/health` reports a connected database and test sign-up/login from the dashboard.

The Cloudflare dashboard and provider terms determine current free-tier limits. Usage can exceed free allowances; check the account's usage before deployment. Never commit API keys or paste them into chat.

## Google endpoints

- `POST /api/google/connect` starts OAuth.\n- `GET /api/google/callback` validates and consumes one-time OAuth state, then stores the refresh token encrypted with AES-GCM.\n- `GET /api/google/status` and `DELETE /api/google/connection` manage the user's connection.\n- `GET /api/google/search-console/sites` lists accessible properties.\n- `GET /api/google/search-console/performance?siteUrl=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` retrieves query performance.\n- `GET /api/google/analytics/properties` lists GA4 properties.\n- `GET /api/google/analytics/report?propertyId=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` retrieves active users, sessions and page views.\n\nGoogle APIs are read-only. This integration cannot edit Search Console or Analytics settings.\n\n## Local checks

- Run the repository tests with `npm test`.
- Use `npx wrangler dev` after configuring a local D1 database and the required local secrets.
- The deployment is not live until a successful Cloudflare deployment and a real health/dashboard smoke test have been confirmed.
