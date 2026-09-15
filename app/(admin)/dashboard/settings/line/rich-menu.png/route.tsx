import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { richMenuImage } from '@/lib/line/rich-menu';

export const dynamic = 'force-dynamic';

/**
 * GET /dashboard/settings/line/rich-menu.png
 *
 * The image for step 6 of the LINE wizard, drawn for whichever shop is signed
 * in. Behind requireSession like every other dashboard route: the shop name is
 * on it, so it is not something to hand out to anyone who guesses the URL.
 */
export async function GET() {
  const session = await requireSession('manager');

  const [tenant] = await withTenant(session.tenantId, (tx) =>
    tx
      .select({ name: schema.tenant.name })
      .from(schema.tenant)
      .where(eq(schema.tenant.id, session.tenantId)),
  );

  return richMenuImage(tenant?.name ?? 'ร้านของเรา');
}
