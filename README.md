# Mubende Country Resort (Next.js)

App Router website for Mubende Country Resort using Tailwind CSS.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Database schema

This storefront and the admin panel share a single Neon Postgres database. The schema, migrations, seed data, and Pesapal payment-recovery infrastructure live in the admin repo:

- Repo: <https://github.com/mubendereso/mubendecountryresort-admin>
- Path: `db/`

Do not duplicate schema files here.

## Security TODOs

- [ ] Tighten Content Security Policy (CSP) with explicit `script-src`, `img-src`, `style-src`, and `connect-src` directives for production domains (Vercel analytics/speed insights + allowed media hosts).
- [ ] Add automated secret scanning in CI (for example: gitleaks on push/PR).
- [ ] Add dependency security checks in CI (`npm audit` and dependency update cadence).
- [ ] Review and enforce Cloudflare edge security controls (WAF, bot protection, rate limiting for any future form/API endpoints).
