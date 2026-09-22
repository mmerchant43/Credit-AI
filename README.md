# Credit Comp Platform ("Credit Team") — Version 29.0

Crow Holdings internal credit comp database. Past underwritten deals ("comps")
compared against new opportunities. Sister site to the Industrial Comp
Database — same stack, same look, same deployment model.

Stack: Next.js 14 (App Router) + TypeScript + Tailwind + Prisma + PostgreSQL
(Neon via Vercel). Auth: two shared team passwords (Analyst / Admin) as env
vars, signed session cookies — no third-party auth.

## What the shell includes

- Crow-branded chrome: navy/gold, EB Garamond, top bar, tile homepage.
- Sign-in (name + team password → Analyst or Admin role, attributed records).
- The full `CreditComp` data model: property/market, two-way deal category
  (Bridge/Refi = built and existing · Construction = not built / to be
  built), Crow position, loan terms, LTV/LTC/DSCR/debt yield, sponsor,
  outcome — verbatim-or-null doctrine (nothing derived; null renders as —).
- `/comps` — the database table (empty until data lands).
- Placeholder pages for Add a Comp and New Deal Analysis describing what
  each will do.

## Environment variables (Vercel → Settings → Environment Variables)

- `DATABASE_URL`, `DATABASE_URL_UNPOOLED` — auto-added by the Neon integration
- `AUTH_SECRET` — any long random string
- `ANALYST_PASSWORD`, `ADMIN_PASSWORD` — the two shared team passwords
- `ANTHROPIC_API_KEY` — powers the OM-upload extraction (console.anthropic.com);
  without it the upload tab shows a friendly "not configured" message and
  manual entry still works

## Deploy

Push to the connected GitHub repo → Vercel builds (`prisma generate && prisma
db push --accept-data-loss && node prisma/seed.mjs && next build`) — schema
changes apply themselves and the 356-comp seed re-imports idempotently on
every deploy.

## What's live (see Website Change List.md in the project folder)

356 imported comps · comps table with filters (category, stories, state,
city, zip, LTV) and a duplicate-review popup (same name + city flagged;
remove archives, approve keeps) · Add a Comp (OM upload or manual) · New
Deal Analysis (OM upload or manual → adjustable five-criteria popup with
toggles, live re-screen on every change; location is a hard gate — no-zip
comps fail zip/radius screens — while vintage/occupancy/category skip
missing data → AI deal writeup in the header, trimmed comparison table
(Property · Location · Vintage · Units · Loan Amount · ✕ with undo),
centered "Subject vs. Comps" line charts, failed candidates in a
collapsible; subject auto-added, with Loan/Unit and Loan PSF derived for
the subject when the OM omits them) · comp map on every analysis (Leaflet +
OpenStreetMap, Census address-level pins with zip-centroid fallback, radius
circle, inline "no address" fix-ups) · homepage Pinned Deals via star toggle.
