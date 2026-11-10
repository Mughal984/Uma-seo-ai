# Cloudflare Workers API foundation

This is the first runnable Workers-native API slice. It deliberately does not replace the existing Express app yet.

## Included
- D1-backed registration and login (bcrypt password hashes)
- HMAC-SHA256 JWT sessions using Web Crypto
- Authenticated profile and project endpoints
- Authenticated SEO task listing and approval/dismissal records
- Health check that verifies D1 connectivity
- Basic URL input validation for project URLs

## Not included yet
- Website crawling/audits and secure SSRF-resistant outbound fetches
- Keyword/competitor research and Gemini content generation
- Google Search Console / Analytics OAuth
- Full parity with the existing Express API and frontend
- Production-grade email verification, password reset, session revocation, billing, and rate limiting

Task approval only stores a decision; it does not edit or publish a customer's website.

## Setup
1. Create a Cloudflare D1 database named `uma-seo-ai`.
2. Replace the placeholder `database_id` in `wrangler.toml` with the ID from Cloudflare.
3. Set a Worker secret: `npx wrangler secret put JWT_SECRET` (use a unique random value of at least 32 characters).
4. Apply schema: `npx wrangler d1 migrations apply uma-seo-ai --remote`.
5. Deploy: `npx wrangler deploy`.

Do not deploy until the D1 database ID and secret are configured. The migration and deploy commands can incur usage within Cloudflare plan limits; check the current Cloudflare dashboard before running them.

## Local development
Install dependencies, then use Wrangler's local D1 workflow. The existing project is Node/Express and remains available on the main branch; this Worker entrypoint is a separate migration track.
