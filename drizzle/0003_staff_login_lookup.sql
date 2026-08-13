-- Logging in is the one lookup that cannot be tenant-scoped: the person typing
-- their email has not told us which shop they belong to yet, and `staff_user`
-- is under FORCE row-level security like every other tenant table. Without
-- this, the lookup returns zero rows and login can never succeed.
--
-- Rather than weaken the policy, expose exactly one SECURITY DEFINER function
-- that returns exactly the columns a login needs, for one email. It runs as the
-- table owner, so RLS does not apply inside it; everything else about
-- `staff_user` stays sealed.

CREATE OR REPLACE FUNCTION staff_login_lookup(p_email text)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  email text,
  password_hash text,
  role text,
  resource_id uuid,
  is_active boolean,
  tenant_slug text,
  tenant_status text
)
LANGUAGE sql
SECURITY DEFINER
-- Pin the search path: a SECURITY DEFINER function that resolves names through
-- a caller-controlled search_path is a privilege-escalation hole.
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT s.id,
         s.tenant_id,
         s.email,
         s.password_hash,
         s.role,
         s.resource_id,
         s.is_active,
         t.slug,
         t.status
    FROM staff_user s
    JOIN tenant t ON t.id = s.tenant_id
   WHERE s.email = lower(btrim(p_email))
     AND s.is_active
     AND t.status = 'active'
   LIMIT 10;
$$;--> statement-breakpoint

-- The function is callable by the app role; the table itself still is not
-- readable outside a tenant scope.
REVOKE ALL ON FUNCTION staff_login_lookup(text) FROM PUBLIC;--> statement-breakpoint

DO $$
DECLARE
  app_role text := coalesce(nullif(current_setting('chairtime.app_role', true), ''), 'chairtime');
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION staff_login_lookup(text) TO %I', app_role);
  END IF;
END $$;
