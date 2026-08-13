CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"before_json" jsonb,
	"after_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"code" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'online' NOT NULL,
	"subtotal" numeric(10, 2) DEFAULT '0' NOT NULL,
	"discount_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"point_discount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"deposit_paid" numeric(10, 2) DEFAULT '0' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"points_earned" integer DEFAULT 0 NOT NULL,
	"points_spent" integer DEFAULT 0 NOT NULL,
	"customer_note" text,
	"internal_note" text,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_tenant_id_code_unique" UNIQUE("tenant_id","code"),
	CONSTRAINT "booking_status_check" CHECK ("booking"."status" in ('pending','confirmed','in_progress','completed','cancelled','no_show'))
);
--> statement-breakpoint
CREATE TABLE "booking_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"seq" integer DEFAULT 1 NOT NULL,
	"service_name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"duration_min" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"customer_package_id" uuid,
	CONSTRAINT "booking_item_booking_id_seq_unique" UNIQUE("booking_id","seq")
);
--> statement-breakpoint
CREATE TABLE "business_hour" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_id" uuid,
	"weekday" integer NOT NULL,
	"open_time" time NOT NULL,
	"close_time" time NOT NULL,
	CONSTRAINT "business_hour_weekday_check" CHECK ("business_hour"."weekday" between 0 and 6),
	CONSTRAINT "business_hour_time_check" CHECK ("business_hour"."close_time" > "business_hour"."open_time")
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"line_user_id" text,
	"phone" text,
	"name" text NOT NULL,
	"email" text,
	"birth_date" date,
	"note" text,
	"point_balance" integer DEFAULT 0 NOT NULL,
	"lifetime_points" integer DEFAULT 0 NOT NULL,
	"lifetime_spend" numeric(12, 2) DEFAULT '0' NOT NULL,
	"visit_count" integer DEFAULT 0 NOT NULL,
	"no_show_count" integer DEFAULT 0 NOT NULL,
	"last_visit_at" timestamp with time zone,
	"is_blocked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_tenant_id_line_user_id_unique" UNIQUE("tenant_id","line_user_id"),
	CONSTRAINT "customer_tenant_id_phone_unique" UNIQUE("tenant_id","phone")
);
--> statement-breakpoint
CREATE TABLE "customer_package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"package_id" uuid NOT NULL,
	"sessions_total" integer NOT NULL,
	"sessions_used" integer DEFAULT 0 NOT NULL,
	"purchased_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	CONSTRAINT "customer_package_status_check" CHECK ("customer_package"."status" in ('active','used_up','expired','refunded')),
	CONSTRAINT "customer_package_sessions_check" CHECK ("customer_package"."sessions_used" <= "customer_package"."sessions_total")
);
--> statement-breakpoint
CREATE TABLE "customer_tier" (
	"customer_id" uuid PRIMARY KEY NOT NULL,
	"tier_id" uuid NOT NULL,
	"achieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" date,
	"is_manual" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membership_tier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	"qualify_spend" numeric(12, 2) DEFAULT '0' NOT NULL,
	"qualify_visits" integer DEFAULT 0 NOT NULL,
	"qualify_window_months" integer DEFAULT 12 NOT NULL,
	"point_multiplier" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0' NOT NULL,
	"priority_booking_days" integer DEFAULT 0 NOT NULL,
	"perks_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"color" text,
	CONSTRAINT "membership_tier_tenant_id_level_unique" UNIQUE("tenant_id","level")
);
--> statement-breakpoint
CREATE TABLE "notification_queue" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid,
	"channel" text DEFAULT 'line' NOT NULL,
	"template" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"dedupe_key" text,
	CONSTRAINT "notification_queue_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "notification_queue_status_check" CHECK ("notification_queue"."status" in ('pending','sent','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "package_service" (
	"package_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	CONSTRAINT "package_service_package_id_service_id_pk" PRIMARY KEY("package_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "package" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"total_sessions" integer NOT NULL,
	"valid_days" integer,
	"is_transferable" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "point_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"entry_type" text NOT NULL,
	"points" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"lot_id" uuid,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "point_ledger_entry_type_check" CHECK ("point_ledger"."entry_type" in ('earn','redeem','expire','adjust','revert'))
);
--> statement-breakpoint
CREATE TABLE "point_lot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"points_total" integer NOT NULL,
	"points_remaining" integer NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"source_type" text NOT NULL,
	"source_id" uuid,
	CONSTRAINT "point_lot_points_total_check" CHECK ("point_lot"."points_total" > 0),
	CONSTRAINT "point_lot_points_remaining_check" CHECK ("point_lot"."points_remaining" >= 0),
	CONSTRAINT "point_lot_remaining_lte_total_check" CHECK ("point_lot"."points_remaining" <= "point_lot"."points_total")
);
--> statement-breakpoint
CREATE TABLE "point_rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"baht_per_point" numeric(10, 2) DEFAULT '100' NOT NULL,
	"rounding" text DEFAULT 'floor' NOT NULL,
	"point_value_baht" numeric(10, 2) DEFAULT '1.00' NOT NULL,
	"min_redeem_points" integer DEFAULT 50 NOT NULL,
	"max_redeem_percent" numeric(5, 2) DEFAULT '50' NOT NULL,
	"expiry_months" integer,
	"expiry_mode" text DEFAULT 'from_earn' NOT NULL,
	"signup_bonus" integer DEFAULT 0 NOT NULL,
	"birthday_bonus" integer DEFAULT 0 NOT NULL,
	"referral_bonus" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "point_rule_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "resource" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_type_id" uuid NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"photo_url" text,
	"bio" text,
	"is_bookable" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_allocation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"booking_item_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"period" "tstzrange" NOT NULL,
	"is_active_hold" boolean DEFAULT true NOT NULL,
	"is_released" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_service_skill" (
	"resource_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"price_override" numeric(10, 2),
	"duration_factor" numeric(4, 2) DEFAULT '1.00' NOT NULL,
	CONSTRAINT "resource_service_skill_resource_id_service_id_pk" PRIMARY KEY("resource_id","service_id")
);
--> statement-breakpoint
CREATE TABLE "resource_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_human" boolean DEFAULT false NOT NULL,
	CONSTRAINT "resource_type_tenant_id_code_unique" UNIQUE("tenant_id","code")
);
--> statement-breakpoint
CREATE TABLE "reward" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"reward_type" text NOT NULL,
	"point_cost" integer NOT NULL,
	"service_id" uuid,
	"value_amount" numeric(10, 2),
	"min_tier_level" integer DEFAULT 0 NOT NULL,
	"stock" integer,
	"stock_used" integer DEFAULT 0 NOT NULL,
	"valid_from" date,
	"valid_until" date,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "reward_reward_type_check" CHECK ("reward"."reward_type" in ('free_service','discount_amount','discount_percent','free_item'))
);
--> statement-breakpoint
CREATE TABLE "reward_redemption" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"reward_id" uuid NOT NULL,
	"points_spent" integer NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"booking_id" uuid,
	"expires_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reward_redemption_tenant_id_code_unique" UNIQUE("tenant_id","code"),
	CONSTRAINT "reward_redemption_status_check" CHECK ("reward_redemption"."status" in ('issued','used','expired','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "service" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"base_price" numeric(10, 2) NOT NULL,
	"buffer_before_min" integer DEFAULT 0 NOT NULL,
	"buffer_after_min" integer DEFAULT 0 NOT NULL,
	"point_earn_mode" text DEFAULT 'inherit' NOT NULL,
	"point_earn_value" numeric(10, 2) DEFAULT '0',
	"is_point_redeemable" boolean DEFAULT true NOT NULL,
	"max_parallel_customers" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_resource_requirement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"resource_type_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"hold_scope" text DEFAULT 'whole' NOT NULL,
	CONSTRAINT "service_resource_requirement_service_id_resource_type_id_unique" UNIQUE("service_id","resource_type_id"),
	CONSTRAINT "service_resource_requirement_hold_scope_check" CHECK ("service_resource_requirement"."hold_scope" in ('active_only','whole'))
);
--> statement-breakpoint
CREATE TABLE "service_segment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"kind" text NOT NULL,
	"duration_min" integer NOT NULL,
	"label" text,
	CONSTRAINT "service_segment_service_id_seq_unique" UNIQUE("service_id","seq"),
	CONSTRAINT "service_segment_kind_check" CHECK ("service_segment"."kind" in ('active','passive')),
	CONSTRAINT "service_segment_duration_min_check" CHECK ("service_segment"."duration_min" > 0)
);
--> statement-breakpoint
CREATE TABLE "staff_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_id" uuid,
	"email" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'staff' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "staff_user_tenant_id_email_unique" UNIQUE("tenant_id","email")
);
--> statement-breakpoint
CREATE TABLE "tenant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"business_type" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"currency" char(3) DEFAULT 'THB' NOT NULL,
	"phone" text,
	"address" text,
	"plan" text DEFAULT 'trial' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tenant_booking_policy" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"slot_granularity_min" integer DEFAULT 15 NOT NULL,
	"min_lead_time_min" integer DEFAULT 60 NOT NULL,
	"max_advance_days" integer DEFAULT 60 NOT NULL,
	"cancel_cutoff_min" integer DEFAULT 180 NOT NULL,
	"allow_customer_pick_staff" boolean DEFAULT true NOT NULL,
	"require_deposit" boolean DEFAULT false NOT NULL,
	"deposit_percent" numeric(5, 2) DEFAULT '0',
	"auto_confirm" boolean DEFAULT true NOT NULL,
	"no_show_fee" numeric(10, 2) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "time_off" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"resource_id" uuid,
	"period" "tstzrange" NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking" ADD CONSTRAINT "booking_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_item" ADD CONSTRAINT "booking_item_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_item" ADD CONSTRAINT "booking_item_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hour" ADD CONSTRAINT "business_hour_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_hour" ADD CONSTRAINT "business_hour_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_package" ADD CONSTRAINT "customer_package_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_package" ADD CONSTRAINT "customer_package_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_package" ADD CONSTRAINT "customer_package_package_id_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."package"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tier" ADD CONSTRAINT "customer_tier_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_tier" ADD CONSTRAINT "customer_tier_tier_id_membership_tier_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."membership_tier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_tier" ADD CONSTRAINT "membership_tier_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_queue" ADD CONSTRAINT "notification_queue_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_queue" ADD CONSTRAINT "notification_queue_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_service" ADD CONSTRAINT "package_service_package_id_package_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."package"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package_service" ADD CONSTRAINT "package_service_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "package" ADD CONSTRAINT "package_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_ledger" ADD CONSTRAINT "point_ledger_lot_id_point_lot_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."point_lot"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_lot" ADD CONSTRAINT "point_lot_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_lot" ADD CONSTRAINT "point_lot_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_rule" ADD CONSTRAINT "point_rule_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_resource_type_id_resource_type_id_fk" FOREIGN KEY ("resource_type_id") REFERENCES "public"."resource_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_allocation" ADD CONSTRAINT "resource_allocation_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_allocation" ADD CONSTRAINT "resource_allocation_booking_item_id_booking_item_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_allocation" ADD CONSTRAINT "resource_allocation_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_service_skill" ADD CONSTRAINT "resource_service_skill_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_service_skill" ADD CONSTRAINT "resource_service_skill_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_type" ADD CONSTRAINT "resource_type_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward" ADD CONSTRAINT "reward_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemption" ADD CONSTRAINT "reward_redemption_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemption" ADD CONSTRAINT "reward_redemption_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemption" ADD CONSTRAINT "reward_redemption_reward_id_reward_id_fk" FOREIGN KEY ("reward_id") REFERENCES "public"."reward"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_redemption" ADD CONSTRAINT "reward_redemption_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service" ADD CONSTRAINT "service_category_id_service_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_category" ADD CONSTRAINT "service_category_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_resource_requirement" ADD CONSTRAINT "service_resource_requirement_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_resource_requirement" ADD CONSTRAINT "service_resource_requirement_resource_type_id_resource_type_id_fk" FOREIGN KEY ("resource_type_id") REFERENCES "public"."resource_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_segment" ADD CONSTRAINT "service_segment_service_id_service_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."service"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_user" ADD CONSTRAINT "staff_user_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_user" ADD CONSTRAINT "staff_user_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_booking_policy" ADD CONSTRAINT "tenant_booking_policy_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_off" ADD CONSTRAINT "time_off_resource_id_resource_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resource"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_tenant_id_created_at_index" ON "audit_log" USING btree ("tenant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "booking_tenant_id_starts_at_index" ON "booking" USING btree ("tenant_id","starts_at");--> statement-breakpoint
CREATE INDEX "booking_tenant_id_status_starts_at_index" ON "booking" USING btree ("tenant_id","status","starts_at");--> statement-breakpoint
CREATE INDEX "booking_customer_id_starts_at_index" ON "booking" USING btree ("customer_id","starts_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "customer_tenant_id_name_index" ON "customer" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "customer_package_customer_id_status_index" ON "customer_package" USING btree ("customer_id","status");--> statement-breakpoint
CREATE INDEX "notification_queue_status_scheduled_at_index" ON "notification_queue" USING btree ("status","scheduled_at");--> statement-breakpoint
CREATE INDEX "point_ledger_customer_id_created_at_index" ON "point_ledger" USING btree ("customer_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "resource_tenant_id_is_active_index" ON "resource" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "resource_allocation_tenant_id_resource_id_index" ON "resource_allocation" USING btree ("tenant_id","resource_id");--> statement-breakpoint
CREATE INDEX "service_tenant_id_is_active_index" ON "service" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE INDEX "time_off_tenant_id_resource_id_index" ON "time_off" USING btree ("tenant_id","resource_id");