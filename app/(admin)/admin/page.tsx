import { redirect } from 'next/navigation';
import { platformSession, listAllShops } from '@/lib/admin/platform';
import { AdminShopList } from '@/components/admin/admin-shop-list';

export const dynamic = 'force-dynamic';

/**
 * Every shop, for the person who runs the platform.
 *
 * A plain redirect for anyone else rather than a 404 or a message: the page
 * exists, they are simply not it, and saying so tells them there is something
 * here to find.
 */
export default async function AdminPage() {
  const session = await platformSession();
  if (!session) redirect('/dashboard');

  const shops = await listAllShops();

  return <AdminShopList shops={shops} currentTenantId={session.tenantId} />;
}
