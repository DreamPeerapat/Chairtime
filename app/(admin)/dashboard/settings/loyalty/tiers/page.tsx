import { notFound } from 'next/navigation';
import { LOYALTY_ENABLED } from '@/lib/features';
import { requireSession } from '@/lib/auth';
import { listTiersForAdmin } from '@/lib/admin/queries';
import { TierManager } from '@/components/admin/tier-manager';

export const dynamic = 'force-dynamic';

export default async function TierSettingsPage() {
  // Hidden with the rest of loyalty: a bookmarked URL must not get in either.
  if (!LOYALTY_ENABLED) notFound();

  // Managers can look; saving is owner-only in the action, like the point rule.
  const session = await requireSession('manager');
  const tiers = await listTiersForAdmin(session.tenantId);
  return <TierManager tiers={tiers} canEdit={session.role === 'owner'} />;
}
