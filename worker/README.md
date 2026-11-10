# Cloudflare Workers migration

This branch contains a Workers-native API and the existing browser dashboard served as Cloudflare static assets. It is a migration track; the original Express/SQLite app remains on `main`.

## Implemented on this branch

- D1-backed registration, login, profile and project endpoints
- Web Crypto HMAC-SHA256 JWT sessions and bcrypt password hashing
- Owner-scoped project and audit records
- Bounded technical crawler (maximum 8 pages) with same-origin and private-network protections
- Proposed SEO task records with approve/dismiss workflow (approval does not edit a site)
- Competitor title/meta topic comparison (not live keyword-volume/ranking data)
- Gemini content draft generation (draft only; never publishes)
- Google OAuth connection with one-time signed state, AES-GCM encrypted refresh tokens and read-only Search Console / Analytics endpoints
- Static dashboard assets served from `public/`
- GitHub Actions test and dependency-audit workflow

## Not yet implemented

- Google Search Console / Google Analytics OAuth and reporting on the Worker runtime
- CMS/repository connectors that can safely apply approved website edits
- Live keyword volume, keyword difficulty, backlink or rank-tracking provider
- Production account protections such as email verification, password reset, session revocation and API rate limiting
- A verified production deployment

Do not describe this migration as a fully autonomous SEO agent yet. The crawler and AI drafts are working components, but they do not publish edits or guarantee ranking changes.

## Free-tier setup

1. Create a Cloudflare D1 database named `uma-seo-ai` in your Cloudflare dashboard.
2. Copy its database ID into `wrangler.toml` where `REPLACE_WITH_YOUR_D1_DATABASE_ID` appears.
3. Install project dependencies with `npm install`.
4. Set a strong, unique JWT secret: `npx wrangler secret put JWT_SECRET`.
5. Set the Gemini key as a Worker secret: `npx wrangler secret put GEMINI_API_KEY`. The Gemini API key is required only for AI article drafts; without it, audit and project features remain available.
6. Apply the D1 schema: `npx wrangler d1 migrations apply uma-seo-ai --remote`.
7. Deploy: `npx wrangler deploy`.

The Cloudflare dashboard and provider terms determine current free-tier limits. Usage can exceed free allowances; check the account's usage before deployment. Never commit API keys or paste them into chat.

## Google endpoints\n\n- `POST /api/google/connect` starts OAuth.\n- `GET /api/google/callback` validates and consumes one-time OAuth state, then stores the refresh token encrypted with AES-GCM.\n- `GET /api/google/status` and `DELETE /api/google/connection` manage the user's connection.\n- `GET /api/google/search-console/sites` lists accessible properties.\n- `GET /api/google/search-console/performance?siteUrl=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` retrieves query performance.\n- `GET /api/google/analytics/properties` lists GA4 properties.\n- `GET /api/google/analytics/report?propertyId=...&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` retrieves active users, sessions and page views.\n\nGoogle APIs are read-only. This integration cannot edit Search Console or Analytics settings.\n\n## Local checks

- Run the repository tests with `npm test`.
- Use `npx wrangler dev` after configuring a local D1 database and the required local secrets.
- The deployment is not live until a successful Cloudflare deployment and a real health/dashboard smoke test have been confirmed.
