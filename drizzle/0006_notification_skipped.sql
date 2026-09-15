-- A message the worker gave up on must not look like one that arrived.
--
-- `markSent` was called for both: a real push, and the case where there was
-- nothing to push to (no linked LINE account, the booking deleted). The queue
-- then reads `sent` for every row, so a shop whose messages are all going
-- nowhere looks exactly like a shop whose messages all arrived.
--
-- Additive only: no column is dropped, and every existing row keeps the status
-- it has. Rows already marked `sent` are left alone - guessing which of them
-- were really skipped would be worse than the gap itself, and the gap closes
-- from here forward.

ALTER TABLE "notification_queue" DROP CONSTRAINT "notification_queue_status_check";--> statement-breakpoint
ALTER TABLE "notification_queue" ADD COLUMN "skip_reason" text;--> statement-breakpoint
ALTER TABLE "notification_queue" ADD CONSTRAINT "notification_queue_status_check" CHECK ("notification_queue"."status" in ('pending','sent','skipped','failed','cancelled'));--> statement-breakpoint

-- Same shape as drizzle/0005: the role named by `chairtime.app_role`,
-- defaulting to `chairtime`. The existing table grant already covers the new
-- column; this keeps the migration self-contained the way the others are.
DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('chairtime.app_role', true), ''), 'chairtime');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "notification_queue" TO %I', app_role);
  END IF;
END $$;
