# Recovery Notes

This branch is aligned to the currently active production deployment for `axiom-ops-omniscient`:

- Deployment ID: `08b6f098-b913-4209-85ea-faaba56a046e`
- Active version ID: `01e0d086-d001-43f5-8ad3-beb4ed91f03e`
- Deployment created: `2026-04-10T14:49:27.780787Z`
- Version uploaded: `2026-04-08T22:25:19.827896Z`

Direct commit reset was not possible because Cloudflare did not expose a Git commit hash or branch for the active production deployment. This baseline was reconstructed manually by matching the current live production deployment metadata and live Worker bundle behavior, then restoring only the code/config slice required to match that live deployment.

## Files Changed

- `RECOVERY_LOG.md`
- `migrations/0007_deterministic_lead_pipeline.sql`
- `migrations/0008_automation_email_system_prompt.sql`
- `src/app/api/leads/analytics/route.ts`
- `src/app/api/outreach/automation/status/route.ts`
- `src/app/api/outreach/enrich/route.ts`
- `src/app/api/outreach/gmail/callback/route.ts`
- `src/app/api/outreach/send/route.ts`
- `src/app/automation/AutomationPageClient.tsx`
- `src/app/automation/page.tsx`
- `src/app/dashboard/page.tsx`
- `src/app/hunt/HuntClient.tsx`
- `src/app/settings/SettingsClient.tsx`
- `src/app/vault/page.tsx`
- `src/components/VaultDataTable.tsx`
- `src/components/app-sidebar.tsx`
- `src/components/automation/console.tsx`
- `src/components/automation/helpers.ts`
- `src/components/automation/tab-blocked.tsx`
- `src/components/automation/tab-mailboxes.tsx`
- `src/components/automation/tab-overview.tsx`
- `src/components/automation/tab-queue.tsx`
- `src/components/automation/tab-rules.tsx`
- `src/components/automation/types.ts`
- `src/lib/automation-overview.ts`
- `src/lib/axiom-scoring.ts`
- `src/lib/disqualifiers.ts`
- `src/lib/lead-pipeline/assessment.ts`
- `src/lib/lead-pipeline/compatibility.ts`
- `src/lib/lead-pipeline/email-drafting.ts`
- `src/lib/lead-pipeline/email-prompt.ts`
- `src/lib/lead-pipeline/orchestrator.ts`
- `src/lib/lead-pipeline/repository.ts`
- `src/lib/lead-pipeline/schema.ts`
- `src/lib/lead-pipeline/send-decision.ts`
- `src/lib/lead-website.ts`
- `src/lib/outbound-navigation.ts`
- `src/lib/outreach-automation.ts`
- `src/lib/prisma.ts`
- `wrangler.jsonc`

## Future Operator Rules

1. Always branch from `recovery/live-production-baseline`.
2. Always treat the current branch files as the source of truth.
3. Never use later broken deployment history as the source of truth.
