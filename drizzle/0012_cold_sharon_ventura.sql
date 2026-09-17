-- Asking for money, as its own record.
--
-- tenant_payment says money arrived. Nothing said what was asked for, which is
-- what a QR carrying a fixed amount needs: the sum has to be decided, shown,
-- and still be the same number when the transfer turns up minutes later — and
-- when it does, there has to be something to match it against.
--
-- The three columns on tenant_payment are the receipt งานเข้า issued for that
-- payment, copied here so the shop can be shown its own receipt without another
-- service having to be up. The two on tenant are what goes on that document:
-- a salon trading under one name may be invoiced as a company, and its
-- accountant needs the tax id or the paper is no use.
--
-- Additive only.

CREATE TABLE "payment_intent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"plan_id" uuid,
	"months" integer DEFAULT 1 NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"fee_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"qr_payload" text,
	"provider" text DEFAULT 'promptpay' NOT NULL,
	"gateway_ref1" text,
	"gateway_ref2" text,
	"gateway_charge_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"slip_url" text,
	"tenant_payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_intent_reference_unique" UNIQUE("reference"),
	CONSTRAINT "payment_intent_status_check" CHECK ("payment_intent"."status" in ('pending','paid','expired','cancelled'))
);
--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "billing_email" text;--> statement-breakpoint
ALTER TABLE "tenant_payment" ADD COLUMN "receipt_number" text;--> statement-breakpoint
ALTER TABLE "tenant_payment" ADD COLUMN "receipt_url" text;--> statement-breakpoint
ALTER TABLE "tenant_payment" ADD COLUMN "receipt_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_intent" ADD CONSTRAINT "payment_intent_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intent" ADD CONSTRAINT "payment_intent_plan_id_subscription_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plan"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intent" ADD CONSTRAINT "payment_intent_tenant_payment_id_tenant_payment_id_fk" FOREIGN KEY ("tenant_payment_id") REFERENCES "public"."tenant_payment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_intent_tenant_id_created_at_index" ON "payment_intent" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_intent_status_expires_at_index" ON "payment_intent" USING btree ("status","expires_at");--> statement-breakpoint

-- Iron rule #3: a table holding a shop's data is unreadable without the shop
-- being set on the connection. Drizzle cannot express this, so it lives here
-- with the rest of the policies from 0001.
ALTER TABLE "payment_intent" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_intent" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY tenant_isolation ON "payment_intent"
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);