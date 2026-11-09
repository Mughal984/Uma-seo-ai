# Umar SEO AI — working MVP

A functional early-stage SEO workspace for website owners. The current implementation is evidence-first and does not fabricate rankings, traffic, search volumes, or connected integrations.

## Implemented
- Email/password registration and login with bcrypt password hashing and signed JWT bearer tokens.
- SQLite persistence for users, projects, and audit history.
- Add a website project and run an owner-initiated, limited same-domain technical SEO crawl.
- Technical checks for titles, descriptions, H1, noindex, canonical URLs, image alt text, HTTP errors, HTML language, mobile viewport, Open Graph, JSON-LD presence, and rough visible word count.
- robots.txt and sitemap inspection when reachable.
- On-page keyword signal extraction from page titles, descriptions, headings, and visible text.
- Competitor topic comparison for 1–3 user-supplied competitor websites, showing shared topics and possible topic gaps.
- Login/register rate limiting, API rate limiting, security headers, crawl page/time/response-size limits, and basic private-network URL blocking.

## Keyword and competitor comparison
Use the “Compare keyword topics” field on a website project and provide 1–3 competitor URLs. The feature compares visible on-page terms and phrases from the same limited crawl. It is a topic-gap aid, not live Google keyword research: it does not return search volume, keyword difficulty, rankings, SERP positions, backlinks, or traffic estimates. Current tokenization is English-focused. Review every suggested topic for relevance before publishing content.

## Run locally
Requires Node.js 20 or newer.

1. Run `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `JWT_SECRET` to a random value of at least 32 characters.
4. Run `npm start`.
5. Open http://localhost:3000.

## Umar SEO Agent V2
The technical audit endpoint also returns an evidence-based SEO action plan (`seoPlan`). Suggestions are derived from the technical audit and require review. The system does not access Search Console or Analytics, obtain verified keyword volumes/rankings, edit customer website files, or publish changes.

## API
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me` (Bearer token)
- `GET /api/projects` (Bearer token)
- `POST /api/projects` (Bearer token; JSON: name, url)
- `POST /api/projects/:id/audit` (Bearer token)
- `POST /api/projects/:id/keyword-research` (Bearer token; JSON: competitorUrls, 1–3 URLs)
- `GET /api/projects/:id/audits` (Bearer token)
- `GET /api/health`

## Not implemented yet
Google Search Console/Analytics OAuth, external keyword-volume and backlink providers, AI content generation, automatic on-site edits, email verification, password recovery, and production session revocation are not implemented. These require consent, credentials, additional backend work, and testing. Do not treat the current JWT/local-storage login as production-grade authentication.

## Production warning
This is an MVP, not ready for unrestricted public production. Before launch, move crawling into an isolated worker with outbound firewall and DNS-rebinding protection, use HTTPS and secure HttpOnly/SameSite cookies with CSRF protection, add account recovery and email verification, a durable queue, monitoring, backups, and independent security review. Never commit `.env` or credentials.

## Tests
Run `npm test` to execute the keyword comparison, SEO action-plan, and crawler URL-safety regression tests.
