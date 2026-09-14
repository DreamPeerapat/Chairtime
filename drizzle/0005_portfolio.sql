CREATE TABLE "portfolio_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"image_url" text NOT NULL,
	"blob_pathname" text,
	"caption" text,
	"resource_id" uuid,
	"service_id" uuid,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portfolio_item" ADD CONSTRAINT "portfolio_item_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_item" ADD CONSTRAINT "portfolio_item_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portfolio_item" ADD CONSTRAINT "portfolio_item_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "portfolio_item_tenant_id_display_order_index" ON "portfolio_item" USING btree ("tenant_id","display_order");--> statement-breakpoint
CREATE INDEX "portfolio_item_resource_id_index" ON "portfolio_item" USING btree ("resource_id");--> statement-breakpoint

-- ---------------------------------------------------------------------
-- Everything below is hand-written: drizzle-kit cannot express RLS or grants.
--
-- Files live in Vercel Blob, not in Postgres — a bytea column would put image
-- bytes in every backup and serve them through a serverless function. Only the
-- URL and the blob pathname are stored, the pathname because deleting from the
-- store needs it and recovering it by parsing the URL breaks the day the
-- provider changes its URL shape.
--
-- resource_id and service_id are independent and both optional, so one table
-- feeds both the shop-wide gallery and the per-stylist strip on the booking
-- flow's staff step. ON DELETE SET NULL, not CASCADE: a stylist leaving must
-- not delete the shop's portfolio.
-- ---------------------------------------------------------------------

ALTER TABLE "portfolio_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "portfolio_item" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "portfolio_item"
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
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "portfolio_item" TO %I', app_role);
  END IF;
END $$;
