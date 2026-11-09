# Umar SEO AI — working MVP

A functional early-stage SEO workspace for website owners. The current implementation is intentionally evidence-first and does not fabricate rankings, traffic, keyword volumes, or connected integrations.

## Implemented
- Email/password registration and login (bcrypt password hashing; signed JWT bearer tokens).
- SQLite persistence for users, projects, and audit history.
- Add a website project.
- Owner-initiated, limited same-domain technical SEO crawl.
- Checks page title and description, H1 count, noindex, canonical URL, image alt text, HTTP errors, HTML language, mobile viewport, Open Graph metadata, JSON-LD presence, and rough visible word count. Also inspects robots.txt and a sitemap URL when reachable.
- API rate limiting, security headers, crawl page/time/response-size limits, and basic private-network URL blocking.

## Run locally
Requires Node.js 20 or newer.

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `JWT_SECRET` to a random value of at least 32 characters.
4. Run `npm start`.
5. Open http://localhost:3000.

## Umar SEO Agent V2

The technical audit endpoint also returns an evidence-based SEO action plan (`seoPlan`). The workspace displays suggested tasks sorted by priority, including the affected page, category, and whether approval is required. The plan is derived only from findings returned by the technical audit and provides suggested next steps. It does not independently access Search Console or Analytics, obtain verified keyword volumes/rankings, research competitors, edit customer website files, or publish changes. All website changes remain manual and require review.

## API
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me` (Bearer token)
- `GET /api/projects` (Bearer token)
- `POST /api/projects` (Bearer token; JSON: name, url)
- `POST /api/projects/:id/audit` (Bearer token)
- `GET /api/projects/:id/audits` (Bearer token)
- `GET /api/health`

## Not implemented yet
Google Search Console/Analytics OAuth, keyword-volume and backlink providers, AI content generation, competitor data providers, automatic on-site edits, email verification, password recovery, and production session revocation are not implemented. These require consent, credentials, additional backend work, and testing. Do not treat the current JWT/local-storage login as production-grade authentication.

## Production warning
This is an MVP, not ready for unrestricted public production. Before launch, move crawling into an isolated worker with outbound firewall and DNS-rebinding protection, use HTTPS and secure HttpOnly/SameSite cookies with CSRF protection, add account recovery and email verification, a durable queue, monitoring, backups, and independent security review. Never commit `.env` or credentials.
