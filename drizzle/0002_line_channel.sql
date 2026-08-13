CREATE TABLE "tenant_line_channel" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"channel_access_token_enc" text NOT NULL,
	"channel_secret_enc" text NOT NULL,
	"liff_id" text,
	"basic_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_line_channel" ADD CONSTRAINT "tenant_line_channel_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Secrets are tenant data like anything else, and the app role owns nothing.
ALTER TABLE "tenant_line_channel" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_line_channel" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant_line_channel"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('chairtime.app_role', true), ''), 'chairtime');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON "tenant_line_channel" TO %I', app_role);
  END IF;
END $$;
