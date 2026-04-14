# Local Setup

## Windows Worker Suite Setup (new device)

### Preferred flow: bootstrap installer

If the repo is not on the machine:

```powershell
git clone --branch codex/restore-cf0c19f https://github.com/rileyhins17/the-omniscient.git "$env:USERPROFILE\Axiom\the-omniscient-axiom-launcher"
cd "$env:USERPROFILE\Axiom\the-omniscient-axiom-launcher"
.\worker-bootstrap.cmd
```

If the repo already exists:

```powershell
cd <repo-path>
.\worker-bootstrap.cmd
```

What the installer handles:

- repo clone/update on the correct branch
- `npm ci` dependency install
- `.env.worker` creation/update
- worker identity persistence (`WORKER_NAME` and `AGENT_NAME`)
- machine-local launcher config and Desktop shortcut refresh
- initial launcher start

### Moved repo relink

If the project folder changes later:

```powershell
cd <new-repo-path>
.\scripts\windows-worker-bootstrap.ps1 -RelinkOnly -RepoRoot "<new-repo-path>" -NoLaunch
```

You can also relink from the launcher with **Change repo**.

### Why this over ZIP packaging

- The bootstrap path stays current with Git and branch updates.
- ZIP snapshots drift fast and are less reliable across machine differences.
- Relink mode gives you the "wizard" behavior without re-installing everything.

## 1. Create local env files

- Copy [`.env.example`](./.env.example) to `.env`
- Copy [`.dev.vars.example`](./.dev.vars.example) to `.dev.vars`

## 2. Prepare the local D1 database

```bash
wrangler d1 migrations apply axiom-ops-omniscient --local
```

## 3. Start the app

```bash
npm run dev
```

`next dev` runs with OpenNext's Cloudflare dev bindings enabled, so `.dev.vars` and local D1 are the default runtime path.

## 4. Sign in

Use an email listed in `AUTH_ALLOWED_EMAILS`. Admin-only pages and routes require the signed-in user to also be in `AUTH_ADMIN_EMAILS`.

## 5. Cloudflare preview

```bash
$env:BETTER_AUTH_SECRET='replace-with-at-least-32-characters'
npm run preview
```

## 6. Worker Studio

For the live scraping worker, use the native desktop launcher instead of `next dev`:

```powershell
.\worker-desktop.cmd
```

This opens the local Axiom Worker Studio UI and points the worker at the live control plane by default.

Inside the app you can:

- start and stop the worker
- rename the worker and save it to `.env.worker`
- create an `Axiom Worker.lnk` file on your Desktop for one-click relaunches
- change the repo location if you move the workspace to another folder or another Windows device

If you prefer the cleanest launcher, use the Desktop `Axiom Worker.lnk` shortcut created by the app. The older `start-worker.cmd` file is a fallback only.
