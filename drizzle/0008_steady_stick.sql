-- Where the shop is, as a point rather than as prose.
--
-- `address` is already there and is what the contact reply reads out, but a
-- customer holding a line of Thai text still has to retype it into a map.
-- With coordinates the OA can answer with a LINE location message, which
-- opens navigation in one tap.
--
-- numeric rather than float: a coordinate is written down and read back, never
-- summed, and 7 decimal places is about a centimetre.
--
-- Additive only.

ALTER TABLE "tenant" ADD COLUMN "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "tenant" ADD COLUMN "longitude" numeric(10, 7);
