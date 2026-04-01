# Worker Desktop Bootstrap Prompt

You are operating inside the OpenClaw workspace on Windows.

Goal:
Keep the Axiom worker desktop launcher current, branded, and easy to run on this machine. Make sure it uses the latest repo state, preserves the clean native launcher UI, and keeps the worker runnable from the desktop on any Windows device with the same setup flow.

Source of truth:
- GitHub repo: https://github.com/rileyhins17/the-omniscient.git
- If the repo is not already present on the machine, clone it first.
- If the repo is already present, fetch and pull the latest commit from origin before making changes.

Important context:
- The repo is the-omniscient.
- It is a Next.js app using OpenNext + Cloudflare Workers.
- The launcher is native PowerShell WinForms, not a web app.
- The worker build path uses `.open-next`.
- The local dev path uses `.dev.vars`.
- The launcher should feel like a desktop app with the Axiom logo, not a PowerShell console.
- The launcher must stay minimal: no visible logs, no diagnostics panel, no cluttered dashboard layout.
- The launcher must support:
  - start/stop the worker
  - edit/save worker name
  - change repo location
  - create a Desktop launcher shortcut
  - open the live hunt

What to do first:
1. Confirm you are on the latest repo state.
2. Inspect `git status`, branch name, and remote tracking.
3. If a remote exists, fetch and fast-forward only if it is safe and there are no conflicting local changes you did not make.
4. Read the repo docs and launcher files:
   - `README.md`
   - `setup.md`
   - `package.json`
   - `wrangler.jsonc`
   - `.dev.vars.example`
   - `scripts/worker-desktop.ps1`
   - `start-worker.cmd`
   - `worker-desktop.cmd`
   - `worker-studio.cmd`
   - `start-ops.cmd`

Workspace rules:
- Do not overwrite user secrets.
- Do not delete or recreate `.open-next` unless it is safe and unlocked.
- Do not kill broad sets of processes blindly.
- If a stale process is blocking work, stop only the exact process that is holding the relevant file lock.
- Prefer minimal, reversible edits.
- Keep the public site untouched unless a change is clearly required for the launcher to work.

UI requirements:
- Make the launcher look like a polished native desktop app.
- Use the Axiom logo in the window chrome and taskbar.
- Prefer a Desktop shortcut launcher like `Axiom Worker.lnk` over a visible console window.
- Remove visible logs from the default UI.
- Remove diagnostics from the default UI.
- Keep the layout calm, sharp, and premium.
- Use one strong status banner and a small number of clear controls.
- Keep the worker name and repository controls obvious.
- Keep the start/stop action as the primary button.
- Avoid dashboard clutter, tiny stat grids, and noisy helper text.

Functional requirements:
- The launcher must point to the Cloudflare/OpenNext worker path the app expects.
- It must not rely on `next dev` for the real worker flow.
- It must be able to start and stop the local worker.
- It must persist the worker name.
- It must support changing the repo root if the project is moved.
- It must be able to create a Desktop `start-worker.cmd` launcher on the current machine.
- The Desktop launcher should be hidden-shell / no obvious console flash if possible.
- The launcher should use the same branded icon and feel consistent across machines.

Verification requirements:
- Run a syntax parse on the PowerShell launcher after editing it.
- If possible, run the launcher and confirm the window opens with the Axiom icon.
- Confirm the worker can start from the launcher.
- Confirm the UI stays clean with no visible logs or diagnostic panels.
- If something fails, diagnose the exact file and line, patch minimally, and re-check.

Portable setup requirements for any Windows device:
- If the repo is in a different folder, let the launcher discover or select it.
- Make the Desktop launcher point at the local repo path on that machine.
- Preserve the worker name and repo settings in a machine-local config.
- If the launcher is missing, create or refresh the Desktop shortcut.
- If the launcher is already present, refresh it rather than replacing it with a worse version.

Suggested working order:
1. Inspect current files and git state.
2. Update the PowerShell launcher UI.
3. Update the `.cmd` launchers so they open cleanly.
4. Verify the icon and the hidden-shell launch behavior.
5. Verify the worker still starts correctly.
6. Summarize exactly what changed and how to start it from Desktop.

If you need to make assumptions:
- Prefer the current repo root over asking unless the path is genuinely ambiguous.
- Prefer preserving existing worker behavior over redesigning the runtime.
- Prefer fixing the launcher shell rather than touching the public site.

Deliverable:
- A clean Axiom worker desktop launcher that feels native, looks premium, and is ready to run on any Windows machine with the same repo setup.
