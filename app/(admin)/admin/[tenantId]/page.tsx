import { notFound, redirect } from 'next/navigation';
import { platformSession, loadShopDetail } from '@/lib/admin/platform';
import { enterShop } from '@/lib/admin/impersonate';
import { AdminShopDetail } from '@/components/admin/admin-shop-detail';

export const dynamic = 'force-dynamic';

export default async function AdminShopPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const session = await platformSession();
  if (!session) redirect('/dashboard');

  const { tenantId } = await params;
  const shop = await loadShopDetail(tenantId);
  if (!shop) notFound();

  async function open() {
    'use server';
    // Re-checked inside the action: the page's check happened when it
    // rendered, and this is the call that hands out a session.
    const operator = await platformSession();
    if (!operator) redirect('/dashboard');

    await enterShop(operator.staffUserId, tenantId);
    redirect('/dashboard');
  }

  return <AdminShopDetail shop={shop} onOpen={open} />;
}
