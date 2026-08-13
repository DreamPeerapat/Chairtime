-- Everything drizzle-kit cannot express from lib/db/schema.ts:
--   1. GiST indexes over tstzrange
--   2. the EXCLUDE constraint that makes double-booking impossible (iron rule #1)
--   3. partial indexes
--   4. row-level security (iron rule #3)
-- Keep this file in step with docs/schema.sql.

-- ---------------------------------------------------------------------
-- 1-3. Range indexes and the anti-double-booking constraint
-- ---------------------------------------------------------------------

CREATE INDEX "time_off_period_index" ON "time_off" USING gist ("period");--> statement-breakpoint
CREATE INDEX "resource_allocation_period_index" ON "resource_allocation" USING gist ("period");--> statement-breakpoint

-- The heart of correctness: postgres rejects the second booking itself, so the
-- application never needs a SELECT-then-INSERT check or an advisory lock.
ALTER TABLE "resource_allocation"
  ADD CONSTRAINT "resource_no_overlap"
  EXCLUDE USING gist ("resource_id" WITH =, "period" WITH &&)
  WHERE ("is_released" = false);--> statement-breakpoint

-- FIFO lookup of spendable points: soonest expiry first.
CREATE INDEX "point_lot_fifo_index"
  ON "point_lot" ("customer_id", "expires_at" NULLS LAST, "earned_at")
  WHERE "points_remaining" > 0;--> statement-breakpoint

-- One booking can only ever earn points once, however many times the
-- "job done" button is pressed or the webhook fires.
CREATE UNIQUE INDEX "point_ledger_idem"
  ON "point_ledger" ("tenant_id", "entry_type", "source_type", "source_id")
  WHERE "source_id" IS NOT NULL AND "entry_type" IN ('earn', 'redeem');--> statement-breakpoint

DROP INDEX "notification_queue_status_scheduled_at_index";--> statement-breakpoint
CREATE INDEX "notification_queue_status_scheduled_at_index"
  ON "notification_queue" ("status", "scheduled_at")
  WHERE "status" = 'pending';--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 4. Row-level security
--
-- FORCE is deliberate: without it the table owner silently bypasses the
-- policies, which is exactly the connection the app and the tests use, so a
-- cross-tenant leak would never show up until production.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  t text;
  tenant_tables text[] := ARRAY[
    'tenant_booking_policy', 'resource_type', 'resource', 'service_category', 'service',
    'business_hour', 'time_off', 'customer', 'booking', 'resource_allocation',
    'membership_tier', 'point_rule', 'point_lot', 'point_ledger', 'reward',
    'reward_redemption', 'package', 'customer_package', 'notification_queue',
    'staff_user', 'audit_log'
  ];
BEGIN
  FOREACH t IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)
         WITH CHECK (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t
    );
  END LOOP;
END $$;--> statement-breakpoint

-- Child tables without their own tenant_id are reached only through a parent
-- that is already filtered, so they are scoped by an EXISTS on that parent.
ALTER TABLE "service_segment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_segment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "service_segment"
  USING (EXISTS (SELECT 1 FROM service s WHERE s.id = service_id))
  WITH CHECK (EXISTS (SELECT 1 FROM service s WHERE s.id = service_id));--> statement-breakpoint

ALTER TABLE "service_resource_requirement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "service_resource_requirement" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "service_resource_requirement"
  USING (EXISTS (SELECT 1 FROM service s WHERE s.id = service_id))
  WITH CHECK (EXISTS (SELECT 1 FROM service s WHERE s.id = service_id));--> statement-breakpoint

ALTER TABLE "resource_service_skill" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "resource_service_skill" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "resource_service_skill"
  USING (EXISTS (SELECT 1 FROM service s WHERE s.id = service_id))
  WITH CHECK (EXISTS (SELECT 1 FROM service s WHERE s.id = service_id));--> statement-breakpoint

ALTER TABLE "booking_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "booking_item"
  USING (EXISTS (SELECT 1 FROM booking b WHERE b.id = booking_id))
  WITH CHECK (EXISTS (SELECT 1 FROM booking b WHERE b.id = booking_id));--> statement-breakpoint

ALTER TABLE "customer_tier" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "customer_tier" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "customer_tier"
  USING (EXISTS (SELECT 1 FROM customer c WHERE c.id = customer_id))
  WITH CHECK (EXISTS (SELECT 1 FROM customer c WHERE c.id = customer_id));--> statement-breakpoint

ALTER TABLE "package_service" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "package_service" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "package_service"
  USING (EXISTS (SELECT 1 FROM package p WHERE p.id = package_id))
  WITH CHECK (EXISTS (SELECT 1 FROM package p WHERE p.id = package_id));--> statement-breakpoint

-- point_ledger is append-only (iron rule #2). Enforced here rather than in
-- application code so no code path — including a future admin screen — can
-- rewrite history. This is a guard, not business logic.
CREATE OR REPLACE FUNCTION point_ledger_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'point_ledger is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER point_ledger_no_update
  BEFORE UPDATE OR DELETE ON "point_ledger"
  FOR EACH ROW EXECUTE FUNCTION point_ledger_is_append_only();--> statement-breakpoint

-- The application role owns nothing; grant it exactly what it needs.
DO $$
DECLARE
  app_role text := current_setting('chairtime.app_role', true);
BEGIN
  IF app_role IS NULL OR app_role = '' THEN
    app_role := 'chairtime';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', app_role);
    EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', app_role);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
      app_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
      app_role
    );
  END IF;
END $$;
