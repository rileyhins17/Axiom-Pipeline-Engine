# The Omniscient

Private internal Axiom lead-finding and enrichment dashboard, prepared for deployment on Cloudflare Workers via OpenNext.

## What Changed

- Session auth is enforced for the app and API surface, with admin-only protection on scraping, export, deletion, backfill, and settings.
- Secrets are server-side only. The settings page now reports runtime status instead of storing API keys in the browser.
- Production persistence is set up for Cloudflare D1, with SQL migrations in [`migrations`](./migrations).
- Scraping no longer writes to local disk. Exports are generated in-memory and require authenticated admin access.
- Cloudflare deployment config lives in [`wrangler.jsonc`](./wrangler.jsonc) and [`open-next.config.ts`](./open-next.config.ts).

## Local Development

1. Copy [`.env.example`](./.env.example) to `.env` and fill in real values.
2. Copy [`.dev.vars.example`](./.dev.vars.example) to `.dev.vars` for local Cloudflare-style runtime values.
3. Apply the local D1 schema used by Wrangler-backed local dev:

```bash
wrangler d1 migrations apply axiom-ops-omniscient --local
```

4. Start the dev server:

```bash
npm run dev
```

5. Open [http://localhost:3000/sign-in](http://localhost:3000/sign-in).

## Worker Studio

### Windows Worker Suite (Recommended)

For a professional, repeatable Windows setup, use the bootstrap installer.

If the repo is not on the machine yet:

```powershell
git clone --branch codex/restore-cf0c19f https://github.com/rileyhins17/the-omniscient.git "$env:USERPROFILE\Axiom\the-omniscient-axiom-launcher"
cd "$env:USERPROFILE\Axiom\the-omniscient-axiom-launcher"
.\worker-bootstrap.cmd
```

If the repo is already present:

```powershell
cd <your-repo-path>
.\worker-bootstrap.cmd
```

What this does:

- clones or updates the repo to `codex/restore-cf0c19f`
- installs dependencies (`npm ci`)
- creates or updates `.env.worker`
- preserves the existing shared secret (no rotation needed)
- writes machine-local launcher config in `%APPDATA%\AxiomWorker\studio.json`
- creates or refreshes Desktop shortcut `Axiom Worker.lnk`
- launches the desktop launcher (unless `-NoLaunch` is passed)

### Packaging Decision

Current best path is an installer/bootstrap script, not a pre-baked ZIP.

- Bootstrap script is preferred because this project depends on Node modules and active branch updates.
- ZIP-only bundles are heavier, age quickly, and are brittle across device differences.
- First-run relink is still supported for moved repos via launcher **Change repo** and bootstrap `-RelinkOnly`.

Use the native desktop launcher when you want the local worker to control the live site:

```powershell
.\worker-desktop.cmd
```

or:

```powershell
.\start-worker.cmd
```

That opens the local Axiom Worker Studio, which can:

- start and stop the local scraper process
- rename the worker from the UI and persist it into `.env.worker`
- open the live hunt page on `operations.getaxiom.ca`
- remember the repo root if you move the workspace to another folder
- create an `Axiom Worker.lnk` shortcut on your Desktop for one-click relaunches

The Desktop shortcut is the no-console launcher. Use that instead of the older `start-worker.cmd` file if you want the clean native app feel.

The studio defaults to the live control plane, not localhost, so the worker pushes results to the web app instead of a dev server.

If the repo moves to a new folder later, either:

```powershell
cd <new-repo-path>
.\scripts\windows-worker-bootstrap.ps1 -RelinkOnly -RepoRoot "<new-repo-path>" -NoLaunch
```

or use **Change repo** in the launcher UI.

Notes:

- Local auth requires `BETTER_AUTH_SECRET`.
- Sign-up is restricted to `AUTH_ALLOWED_EMAILS`.
- Admin permissions are granted to emails listed in `AUTH_ADMIN_EMAILS`.
- `next dev` runs with OpenNext Cloudflare bindings enabled, so `.dev.vars` and local D1 are the default runtime path.
- Local scraping falls back to Playwright. Cloudflare deploys use the Browser Rendering binding instead.
- The app runtime reads the Cloudflare `DB` binding directly. There is no Prisma client generation step anymore.
- On this Windows host, OpenNext still warns that WSL/Linux is the safer environment for production-style builds, even though the validated build path now succeeds locally.
- If you move the repo to another folder or another Windows device, use the **Change repo** button in Worker Studio once and the app will remember it.

## Required Environment Variables

App/runtime:

- `APP_BASE_URL`
- `BETTER_AUTH_SECRET`
- `AUTH_ALLOWED_EMAILS`
- `AUTH_ADMIN_EMAILS`

Server-only secrets:

- `GEMINI_API_KEY`

Operational limits:

- `RATE_LIMIT_WINDOW_SECONDS`
- `RATE_LIMIT_MAX_AUTH`
- `RATE_LIMIT_MAX_EXPORT`
- `RATE_LIMIT_MAX_SCRAPE`
- `SCRAPE_CONCURRENCY_LIMIT`
- `SCRAPE_TIMEOUT_MS`

## Cloudflare Deployment

### 1. Create the D1 database

```bash
wrangler d1 create axiom-ops-omniscient
```

Copy the returned `database_id` into [`wrangler.jsonc`](./wrangler.jsonc).

### 2. Apply D1 migrations

```bash
wrangler d1 migrations apply axiom-ops-omniscient --remote
```

For local Wrangler preview:

```bash
wrangler d1 migrations apply axiom-ops-omniscient --local
```

### 3. Configure Cloudflare secrets

```bash
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put GEMINI_API_KEY
```

### 4. Configure Cloudflare vars

Set these in the Worker environment or keep them in [`wrangler.jsonc`](./wrangler.jsonc) and override per environment as needed:

- `APP_BASE_URL=https://ops.getaxiom.ca`
- `AUTH_ALLOWED_EMAILS`
- `AUTH_ADMIN_EMAILS`
- rate-limit and scrape limit values

### 5. Enable Browser Rendering

In Cloudflare, enable Browser Rendering for the Worker and keep the `BROWSER` binding name.

### 6. Build and preview

```bash
$env:BETTER_AUTH_SECRET='replace-with-at-least-32-characters'
npm run build:next
npm run build:cloudflare
npm run preview
```

If you want Wrangler preview secrets locally, copy [`.dev.vars.example`](./.dev.vars.example) to `.dev.vars`.

### 7. Deploy

```bash
npm run deploy
```

### 8. Attach the domain

Attach `ops.getaxiom.ca` to the deployed Worker in Cloudflare and update `APP_BASE_URL` to the final HTTPS origin.

Recommended:

- Put the Worker behind Cloudflare Access for an extra network-level gate.
- Restrict admin emails to the two internal operators who should control scraping/export.

## Validation Commands

Next production build:

```bash
$env:BETTER_AUTH_SECRET='replace-with-at-least-32-characters'
npm run build:next
```

Cloudflare/OpenNext build:

```bash
$env:BETTER_AUTH_SECRET='replace-with-at-least-32-characters'
npm run build:cloudflare
```

Generate Cloudflare env typings:

```bash
npm run cf:typegen
```
