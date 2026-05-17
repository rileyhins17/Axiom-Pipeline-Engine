/**
 * Scheduler Maintenance
 *
 * Self-healing, stale claim recovery, orphan cleanup, and force-reset
 * operations for the outreach automation scheduler. Extracted from
 * outreach-automation.ts for independent testability.
 *
 * NOTE: The canonical implementations still live in outreach-automation.ts
 * and are re-exported from there. This file serves as the documentation
 * boundary for the maintenance concern. Import from outreach-automation.ts
 * until the full migration is complete.
 */

export {
  recoverStaleClaims,
  healStaleSchedulerState,
  forceResetAllBlockedState,
  cleanupOrphanedRecords,
} from "./outreach-automation";
