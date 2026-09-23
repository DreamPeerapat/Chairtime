import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { ownerRichMenuImage } from '@/lib/line/rich-menu';

export const dynamic = 'force-dynamic';

/**
 * GET /dashboard/settings/line/owner-menu.png
 *
 * The owner menu as this deployment draws it *right now*.
 *
 * The customer menu has had a preview since the wizard was written, because
 * the shop has to download that one and upload it to LINE by hand. The owner
 * menu is pushed by the product, so nobody ever needed to look at it — until
 * the picture changed and the only way to find out whether a phone was
 * showing the old one or the new one was to install it and squint.
 *
 * With this, the two possible causes separate in one click: the old design
 * here means the running deployment predates the redesign; the new design
 * here with an old menu on the phone means the menu was installed before that
 * deploy, or LINE is still serving its cached copy — and "สร้างใหม่" fixes
 * both, because it creates a new rich menu id rather than replacing the image
 * on the old one.
 *
 * Behind requireSession like every other dashboard route: the shop name is on
 * it, so it is not something to hand out to anyone who guesses the URL.
 */
export async function GET() {
  const session = await requireSession('manager');

  const [tenant] = await withTenant(session.tenantId, (tx) =>
    tx
      .select({ name: schema.tenant.name })
      .from(schema.tenant)
      .where(eq(schema.tenant.id, session.tenantId)),
  );

  return ownerRichMenuImage(tenant?.name ?? 'ร้านของเรา');
}
