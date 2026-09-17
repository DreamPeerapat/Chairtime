-- Who a shop is when it is being invoiced, and the document it asked for.
--
-- A salon trading as "The Hair" may be billed as a company with its own
-- registered name, address and tax id. An accountant holding a document with
-- the shopfront name on it cannot put it through, so the billing identity is
-- its own three columns rather than the shop's own name and address reused.
-- All optional: most shops are one person and the two are the same.
--
-- The invoice columns hang off payment_intent rather than tenant_payment
-- because an invoice exists precisely while the money does not — a shop that
-- has to get the spend approved needs the document first and pays weeks later.
--
-- Additive only.

ALTER TABLE "payment_intent" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "payment_intent" ADD COLUMN "invoice_url" text;--> statement-breakpoint
ALTER TABLE "payment_intent" ADD COLUMN "invoice_issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "billing_name" text;--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "billing_address" text;