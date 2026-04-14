# Worker Desktop Bootstrap Prompt

You are operating on Windows and your job is to keep setup/onboarding professional and portable.

## Source of truth

- GitHub repo: https://github.com/rileyhins17/the-omniscient.git
- Branch: `codex/restore-cf0c19f`
- Prefer installer/bootstrap flow over ad hoc manual setup.

## Packaging decision

Treat the setup model as:

1. **Bootstrap/install script** as the primary path
2. **First-run relink flow** for moved repos
3. **ZIP-only package** as fallback only

Reasoning:

- This project needs Node deps, branch updates, and Cloudflare runtime parity.
- Static ZIP bundles go stale quickly and are less reliable across devices.
- Relink mode keeps portability without reinstalling everything.

## Required files to inspect first

- `README.md`
- `setup.md`
- `scripts/windows-worker-bootstrap.ps1`
- `worker-bootstrap.cmd`
- `scripts/worker-desktop.ps1`
- `worker-studio.ps1`

## Required outcomes

1. New Windows device can be set up with minimal friction.
2. Desktop shortcut `Axiom Worker.lnk` is created/refreshed.
3. Launcher remembers repo path and worker name.
4. Moved repo can be re-linked quickly.
5. Existing shared secret can be reused without rotating Cloudflare secrets.

## Scope constraints

- Focus on docs/bootstrap/onboarding only.
- Do not redesign launcher UI in this task.
- Do not modify worker runtime/stop logic in this task.
- Do not overwrite unrelated local changes.
- Do not expose secrets in docs.

## Implementation expectations

- Keep bootstrap script idempotent:
  - clone if missing
  - fetch/checkout/pull branch if present
  - ensure `.env.worker`
  - persist machine-local config under `%APPDATA%\AxiomWorker`
  - refresh desktop launcher
- Keep relink explicit:
  - support `-RelinkOnly -RepoRoot "<path>"`
  - document launcher-side `Change repo` flow

## Verification checklist

1. PowerShell script parses cleanly.
2. Running bootstrap script updates/creates shortcut and config.
3. Docs match real commands and script flags.
4. Docs explain bootstrap vs ZIP tradeoff.
5. Docs include moved-repo relink command.

## Deliverable format

Provide:

- short summary of what was installed/refreshed
- exact desktop shortcut path
- exact files changed
- exact command path to run on a fresh Windows device
