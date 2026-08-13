-- Iron rule #7: auth becomes OAuth-only (LINE Login + Google), no passwords
-- anywhere in the system. This migration:
--   1. adds the reference tables self-serve signup needs (subscription_plan,
--      business_type_template)
--   2. replaces the tenant-scoped `staff_user` (email + password_hash) with
--      the identity model docs/schema.sql now specifies: auth_identity +
--      staff_user (global) + staff_auth_identity + staff_tenant
--   3. renames `tenant_line_channel` to `tenant_line_oa` and adds the manual
--      connection wizard's step_* columns (docs/logic.md ข้อ 1.6)
--   4. adds tenant.plan_id / trial_ends_at / onboarded_at
--
-- CLAUDE.md forbids a migration that drops a column without a backup step.
-- Both `staff_user` and `tenant_line_channel` are RENAMEd (data kept, just no
-- longer reachable through the app) rather than DROPped, and `tenant.plan`
-- is renamed to `plan_deprecated` rather than removed. Nothing here destroys
-- data; a follow-up migration can DROP the *_backup tables once nobody needs
-- to consult them.

-- ---------------------------------------------------------------------
-- 1. subscription_plan / business_type_template
-- ---------------------------------------------------------------------

CREATE TABLE "subscription_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"price_monthly" numeric(10, 2),
	"price_yearly" numeric(10, 2),
	"max_resources" integer,
	"max_bookings_per_month" integer,
	"trial_days" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "subscription_plan_code_unique" UNIQUE("code")
);--> statement-breakpoint

CREATE TABLE "business_type_template" (
	"business_type" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"services_json" jsonb DEFAULT '[]' NOT NULL,
	"resource_types_json" jsonb DEFAULT '[]' NOT NULL
);--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 2. Identity model
-- ---------------------------------------------------------------------

CREATE TABLE "auth_identity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_uid" text NOT NULL,
	"email" text,
	"display_name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_identity_provider_provider_uid_unique" UNIQUE("provider","provider_uid"),
	CONSTRAINT "auth_identity_provider_check" CHECK ("auth_identity"."provider" in ('line','google'))
);--> statement-breakpoint

-- The old `staff_user` (tenant_id, email, password_hash, role) violates iron
-- rule #7 outright. Its data is not thrown away — see the note at the top —
-- but nothing in the app will read this table again after this migration.
ALTER TABLE "staff_user" RENAME TO "staff_user_password_auth_backup";--> statement-breakpoint

-- The SECURITY DEFINER login lookup (drizzle/0003) existed only to serve
-- password login against a FORCE-RLS staff_user. There is no password login
-- anymore, so it goes with it.
DROP FUNCTION IF EXISTS staff_login_lookup(text);--> statement-breakpoint

CREATE TABLE "staff_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"primary_email" text,
	"display_name" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "staff_auth_identity" (
	"staff_id" uuid NOT NULL,
	"auth_identity_id" uuid NOT NULL,
	CONSTRAINT "staff_auth_identity_staff_id_auth_identity_id_pk" PRIMARY KEY("staff_id","auth_identity_id"),
	CONSTRAINT "staff_auth_identity_auth_identity_id_unique" UNIQUE("auth_identity_id")
);--> statement-breakpoint

CREATE TABLE "staff_tenant" (
	"staff_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_id" uuid,
	"role" text DEFAULT 'staff' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_tenant_staff_id_tenant_id_pk" PRIMARY KEY("staff_id","tenant_id")
);--> statement-breakpoint

ALTER TABLE "staff_auth_identity" ADD CONSTRAINT "staff_auth_identity_staff_id_staff_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_auth_identity" ADD CONSTRAINT "staff_auth_identity_auth_identity_id_auth_identity_id_fk" FOREIGN KEY ("auth_identity_id") REFERENCES "public"."auth_identity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tenant" ADD CONSTRAINT "staff_tenant_staff_id_staff_user_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tenant" ADD CONSTRAINT "staff_tenant_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_tenant" ADD CONSTRAINT "staff_tenant_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "staff_tenant_tenant_id_index" ON "staff_tenant" USING btree ("tenant_id");--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 3. tenant: subscription + onboarding state
-- ---------------------------------------------------------------------

ALTER TABLE "tenant" RENAME COLUMN "plan" TO "plan_deprecated";--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_plan_id_subscription_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Shops seeded/created before this migration are already in use; treat them
-- as onboarded so existing logins are not thrown into the wizard.
UPDATE "tenant" SET "onboarded_at" = "created_at" WHERE "status" = 'active';--> statement-breakpoint

ALTER TABLE "tenant" ALTER COLUMN "status" SET DEFAULT 'pending_payment';--> statement-breakpoint
ALTER TABLE "tenant" DROP CONSTRAINT IF EXISTS "tenant_status_check";--> statement-breakpoint
ALTER TABLE "tenant" ADD CONSTRAINT "tenant_status_check" CHECK ("tenant"."status" in ('pending_payment','active','suspended','cancelled'));--> statement-breakpoint
CREATE INDEX "tenant_status_index" ON "tenant" USING btree ("status");--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 4. tenant_line_channel -> tenant_line_oa
-- ---------------------------------------------------------------------

ALTER TABLE "tenant_line_channel" RENAME TO "tenant_line_channel_backup";--> statement-breakpoint

CREATE TABLE "tenant_line_oa" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"connection_method" text DEFAULT 'manual' NOT NULL,
	"channel_access_token" text,
	"channel_secret" text,
	"oa_basic_id" text,
	"webhook_url" text,
	"liff_id" text,
	"step_oa_created" boolean DEFAULT false NOT NULL,
	"step_api_enabled" boolean DEFAULT false NOT NULL,
	"step_token_saved" boolean DEFAULT false NOT NULL,
	"step_webhook_verified" boolean DEFAULT false NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"connected_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_line_oa_connection_method_check" CHECK ("tenant_line_oa"."connection_method" in ('manual','partner_oauth'))
);--> statement-breakpoint
ALTER TABLE "tenant_line_oa" ADD CONSTRAINT "tenant_line_oa_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- Shops that had already connected LINE under the old table keep their
-- credentials and wizard is marked complete — nobody should have to
-- reconnect just because the table was reshaped.
INSERT INTO "tenant_line_oa" (
	"tenant_id", "channel_access_token", "channel_secret", "oa_basic_id", "liff_id",
	"step_oa_created", "step_api_enabled", "step_token_saved", "step_webhook_verified",
	"is_verified", "connected_at", "created_at", "updated_at"
)
SELECT
	"tenant_id", "channel_access_token_enc", "channel_secret_enc", "basic_id", "liff_id",
	true, true, true, true,
	"is_active", "created_at", "created_at", "updated_at"
FROM "tenant_line_channel_backup";--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 5. Row-level security for the new tenant-scoped tables
--    (auth_identity, staff_user, staff_auth_identity, subscription_plan and
--    business_type_template are global — no tenant_id, no RLS, per
--    docs/schema.sql ข้อ 13's note)
-- ---------------------------------------------------------------------

ALTER TABLE "staff_tenant" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "staff_tenant" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "staff_tenant"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

ALTER TABLE "tenant_line_oa" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_line_oa" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "tenant_line_oa"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 6. Cross-tenant staff routing lookup
--
-- The callback in docs/logic.md ข้อ 1.5 has to answer "which shops does this
-- person belong to" before a tenant is chosen and `app.tenant_id` can be set
-- — the same chicken-and-egg problem `staff_login_lookup` (drizzle/0003)
-- solved for password login. `staff_tenant` is under FORCE RLS, so this is
-- the one SECURITY DEFINER read that is allowed to see across tenants, and
-- only for the one staff_id the caller already resolved from their own
-- OAuth identity.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION staff_tenant_lookup(p_staff_id uuid)
RETURNS TABLE (
  tenant_id            uuid,
  tenant_slug          text,
  tenant_name          text,
  tenant_status        text,
  tenant_onboarded_at  timestamptz,
  role                 text,
  resource_id          uuid,
  is_active            boolean
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT st.tenant_id, t.slug, t.name, t.status, t.onboarded_at, st.role, st.resource_id, st.is_active
    FROM staff_tenant st
    JOIN tenant t ON t.id = st.tenant_id
   WHERE st.staff_id = p_staff_id
     AND st.is_active
   ORDER BY st.joined_at;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION staff_tenant_lookup(uuid) FROM PUBLIC;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------

DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('chairtime.app_role', true), ''), 'chairtime');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON
         "auth_identity", "staff_user", "staff_auth_identity", "staff_tenant", "tenant_line_oa"
       TO %I',
      app_role
    );
    -- Reference data the app reads but never writes on its own.
    EXECUTE format('GRANT SELECT ON "subscription_plan", "business_type_template" TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION staff_tenant_lookup(uuid) TO %I', app_role);
  END IF;
END $$;--> statement-breakpoint

-- ---------------------------------------------------------------------
-- 8. Seed reference data — signup cannot work without at least one plan
--    and one business type template to offer.
-- ---------------------------------------------------------------------

INSERT INTO "subscription_plan" ("code", "name", "price_monthly", "price_yearly", "max_resources", "max_bookings_per_month", "trial_days") VALUES
    ('trial', 'ทดลองใช้',   0,    0,     3,    100,  14),
    ('basic', 'Basic',      590,  5900,  8,    1000, 0),
    ('pro',   'Pro',        1200, 12000, NULL, NULL, 0);--> statement-breakpoint

INSERT INTO "business_type_template" ("business_type", "display_name", "services_json", "resource_types_json") VALUES
    ('nail', 'ร้านทำเล็บ',
     '[{"name":"ทำเล็บมือ เจล","price":350,"duration_min":60},
       {"name":"ทำเล็บเท้า เจล","price":400,"duration_min":75},
       {"name":"ต่อเล็บ","price":600,"duration_min":90}]'::jsonb,
     '[{"code":"staff","name":"ช่างทำเล็บ","is_human":true},
       {"code":"table","name":"โต๊ะทำเล็บ","is_human":false}]'::jsonb),
    ('hair', 'ร้านทำผม',
     '[{"name":"สระ+ตัด","price":250,"duration_min":45},
       {"name":"ย้อมสีผม","price":1200,"duration_min":150},
       {"name":"ดัดผม","price":1500,"duration_min":180}]'::jsonb,
     '[{"code":"staff","name":"ช่างผม","is_human":true},
       {"code":"chair","name":"เก้าอี้ทำผม","is_human":false}]'::jsonb),
    ('massage', 'ร้านนวด',
     '[{"name":"นวดไทย 60 นาที","price":300,"duration_min":60},
       {"name":"นวดน้ำมัน 90 นาที","price":600,"duration_min":90},
       {"name":"นวดเท้า 45 นาที","price":250,"duration_min":45}]'::jsonb,
     '[{"code":"staff","name":"หมอนวด","is_human":true},
       {"code":"bed","name":"เตียงนวด","is_human":false}]'::jsonb),
    ('other', 'อื่นๆ (เริ่มจากว่างเปล่า)', '[]'::jsonb, '[]'::jsonb);--> statement-breakpoint
