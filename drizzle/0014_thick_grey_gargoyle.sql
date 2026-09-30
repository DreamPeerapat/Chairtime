CREATE TABLE "booking_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"customer_id" uuid,
	"score" integer NOT NULL,
	"comment" text,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "booking_feedback_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "booking_feedback_score_check" CHECK ("booking_feedback"."score" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "tenant_booking_policy" ADD COLUMN "feedback_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_feedback" ADD CONSTRAINT "booking_feedback_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_feedback" ADD CONSTRAINT "booking_feedback_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_feedback" ADD CONSTRAINT "booking_feedback_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booking_feedback_tenant_id_created_at_index" ON "booking_feedback" USING btree ("tenant_id","created_at");--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Row-level security, the same shape as drizzle/0005 §portfolio_item.
--
-- These rows are read on the public booking page, so the isolation matters
-- more than usual: without it a bad tenant_id in a query would show one
-- shop's reviews on another shop's page.
-- ---------------------------------------------------------------------

ALTER TABLE "booking_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "booking_feedback" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "booking_feedback"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('chairtime.app_role', true), ''), 'chairtime');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "booking_feedback" TO %I', app_role);
  END IF;
END $$;
