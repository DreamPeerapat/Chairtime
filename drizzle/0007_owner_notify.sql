-- Where to tell the shop that a customer just cancelled.
--
-- The owner's identity cannot be reused from their login: a LINE user id is
-- scoped to the provider that issued it, and a shop creates its Messaging API
-- channel under its own provider while staff sign in through ours. The two ids
-- for the same human are different, so the owner claims notifications on
-- purpose by sending a short code to their own OA.
--
-- Additive only.

ALTER TABLE "tenant_line_oa" ADD COLUMN "owner_line_user_id" text;--> statement-breakpoint
ALTER TABLE "tenant_line_oa" ADD COLUMN "owner_link_code" text;
