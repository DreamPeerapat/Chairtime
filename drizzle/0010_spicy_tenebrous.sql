-- Photos a customer attaches to show the shop what they want.
--
-- On the booking rather than in a table of their own: they are only ever read
-- with the booking they belong to, and they should go when it does. Stored as
-- [{ url, pathname }] — the pathname is what deleting from the blob store
-- needs, and recovering it by parsing the URL breaks the day the provider
-- changes its URL shape.
--
-- The bytes live in Vercel Blob, never in Postgres: a bytea column would put
-- every customer's screenshot into every backup.
--
-- Additive only, and defaulted, so every booking already written reads back as
-- an empty list rather than null.

ALTER TABLE "booking" ADD COLUMN "reference_images" jsonb DEFAULT '[]'::jsonb NOT NULL;
