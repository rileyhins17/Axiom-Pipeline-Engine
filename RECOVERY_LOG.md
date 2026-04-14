# Recovery Log

## 2026-04-13

- Started production recovery for `axiom-ops-omniscient` from `C:\Users\riley\Documents\Playground`.
- Loaded Cloudflare/Wrangler workflow guidance and inspected local `wrangler.jsonc` to confirm the target Worker name.
- Queried Cloudflare accounts and identified the Worker in account `fe468a56a5b8c7f8fc5d39e265c2f791`.
- Confirmed the currently active production deployment is `08b6f098-b913-4209-85ea-faaba56a046e`, created `2026-04-10T14:49:27.780787Z`, annotated `Rollback to previous version`.
- Confirmed the active production version is `01e0d086-d001-43f5-8ad3-beb4ed91f03e` (version number `117`), originally uploaded `2026-04-08T22:25:19.827896Z`.
- Confirmed the active deployment is the latest deployment actively serving traffic and the most recent successful deployment serving 100% of traffic.
- Confirmed the live custom domain is `operations.getaxiom.ca` on zone `getaxiom.ca` (`5476f053e9b9ae2460dc7d67e5a2ff6e`), with no zone routes currently configured for this Worker.
- Confirmed the Worker subdomain is enabled and previews are enabled.
- Captured live compatibility/runtime settings from Cloudflare: compatibility date `2026-03-15`, flags `nodejs_compat` and `global_fetch_strictly_public`, usage model `standard`, observability enabled, handlers `fetch` and `scheduled`, assets served directly.
- Captured live active-version bindings from Cloudflare: `ASSETS`, `DB`, `BROWSER`, `WORKER_SELF_REFERENCE`, plain-text vars for auth/app/rate-limit/scrape settings, and secret bindings including `AGENT_SHARED_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GEMINI_API_KEY`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `OPENROUTER_API_KEY`.
- Captured script-level secret names from Cloudflare settings: `AGENT_SHARED_SECRET`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GEMINI_API_KEY`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_PLACES_API_KEY`, `OPENROUTER_API_KEY`.
- Noted discrepancy: current script settings expose `GOOGLE_MAPS_API_KEY` and `GOOGLE_PLACES_API_KEY`, but those names are not present in the active production version snapshot. Treating the active version snapshot as the production behavior baseline and keeping the discrepancy for later parity review.
- Cloudflare did not expose a Git commit hash or branch for the active production deployment/version in the deployment/version metadata gathered so far.
- Inspected git status on `main` and found extensive tracked and untracked local modifications that could not be treated as the production baseline.
- Created `backup/pre-production-recovery` from the dirty starting state.
- Committed the full pre-recovery snapshot on `backup/pre-production-recovery` as `513e0d40684dacd5e73a7c678bd992431f2324b6` with message `backup: pre production recovery snapshot`.
- Created annotated tag `pre-recovery-snapshot` at the backup snapshot commit.
- Switched back to `main` and created clean branch `recovery/live-production-baseline` from commit `f244e85ea15dd3ca0c510b9e5aa8d320b131671d`.
- Confirmed the clean `main` branch did not match live production by comparing route inventory and bundle fingerprints against the active Cloudflare Worker content.
- Verified the live bundle includes production-only code not present on clean `main`, including the automation status route, the mailboxes-aware Gmail callback flow, pipeline-backed enrichment/send behavior, the route-state-aware automation page, and the current sidebar/dashboard/hunt/vault/settings UI variants.
- Reconstructed the repo manually from live production evidence rather than hard-resetting to a Cloudflare-exposed Git commit, because no production commit hash was available.
- Restored the live-backed source slice needed for production parity, including the automation route-state helpers, lead pipeline records/repository/orchestrator modules, automation status endpoint, production UI pages/components, and supporting Prisma/migration updates.
- Added explicit Wrangler source-of-truth entries for production routing: `workers_dev: true` and custom-domain route `operations.getaxiom.ca`.
- Added `getAutomationRuntimeStatus()` to `src/lib/outreach-automation.ts` so the restored production status endpoint works without importing the later split-core refactor.
- Ran `npx tsc --noEmit` successfully after the recovery edits.
- Ran `npm run build:cloudflare` successfully after the recovery edits; the build now includes `/api/outreach/automation/status` and generates a Cloudflare bundle without errors.
- Ran `npx wrangler deploy --dry-run` successfully after the recovery edits; bindings match the production Worker metadata and the only output warnings were existing OpenNext bundle warnings about duplicate object keys in generated code.
- Ran repo lint in two modes:
  - `npm run lint` reported non-actionable noise from generated `.open-next` output and temporary bundle artifacts before cleanup.
  - `npx eslint src worker.mjs next.config.ts middleware.ts cloudflare-env.d.ts scripts --ignore-pattern '.codex-temp/**'` reported many pre-existing repo-wide lint violations outside the recovery scope; these were not fixed because they are not required to match the working production baseline.
