-- The automation scheduler queues sequences with queuedByUserId='system',
-- which hit a FOREIGN KEY violation against User.id and silently dropped every
-- auto-queue batch. Create a dedicated system user row so the FK is satisfied.
-- Without this, 0 sequences get queued per cron tick even when leads are ready.

INSERT INTO "User" (id, name, email, emailVerified, role, createdAt, updatedAt)
VALUES (
  'system',
  'Axiom Automation',
  'system@automation.axiom.internal',
  1,
  'system',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT(id) DO NOTHING;
