-- The per-user rich menu attached to the owner's own LINE chat.
--
-- The customer menu is built by hand in LINE OA Manager. This one cannot be:
-- linking a menu to a single user id is an API call and there is no screen for
-- it, so the product creates it and has to remember which one it made.
--
-- Kept so a rebuild can delete the menu it replaces. LINE caps how many rich
-- menus a channel may hold, and a shop that renames itself a few times would
-- otherwise leave a pile of orphans behind.
--
-- Additive only.

ALTER TABLE "tenant_line_oa" ADD COLUMN "owner_rich_menu_id" text;
