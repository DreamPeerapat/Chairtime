CREATE TABLE "tenant_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"plan_id" uuid,
	"amount" numeric(10, 2) NOT NULL,
	"method" text DEFAULT 'bank_transfer' NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"slip_url" text,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_payment_status_check" CHECK ("tenant_payment"."status" in ('pending_review','verified','rejected')),
	CONSTRAINT "tenant_payment_period_check" CHECK ("tenant_payment"."period_end" > "tenant_payment"."period_start")
);
--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "paid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant_payment" ADD CONSTRAINT "tenant_payment_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_payment" ADD CONSTRAINT "tenant_payment_plan_id_subscription_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tenant_payment_tenant_id_created_at_index" ON "tenant_payment" USING btree ("tenant_id","created_at");

-- ---------------------------------------------------------------------
-- Hand-written below: drizzle-kit cannot express RLS or grants.
--
-- What a shop has paid us, and the stretch of time it bought. The balance is
-- `tenant.paid_until`; this is the history behind it.
--
-- Kept apart from `trial_ends_at` rather than overwriting it, so "the free
-- month ran out" and "they paid and it lapsed again" stay distinguishable.
-- Readers coalesce the two in lib/billing/access.ts.
--
-- The period is extended as soon as the shop says it transferred — they have
-- customers booked and cannot be locked out waiting on a bank statement — so
-- a row lands as `pending_review` and is matched against the statement later.
-- Nothing here verifies a slip; that is Phase 8 (SlipOK).
--
-- Additive only: one new table, one new nullable column.
-- ---------------------------------------------------------------------

ALTER TABLE "tenant_payment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_payment" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant_payment"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

-- Same shape as drizzle/0004 §7: the role named by `chairtime.app_role`,
-- defaulting to `chairtime`. `pnpm db:migrate` sets it from APP_DB_ROLE — a
-- managed provider's role is rarely called `chairtime`, and a grant aimed at a
-- role that does not exist is skipped in silence.
DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('chairtime.app_role', true), ''), 'chairtime');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_payment" TO %I', app_role);
  END IF;
END $$;
