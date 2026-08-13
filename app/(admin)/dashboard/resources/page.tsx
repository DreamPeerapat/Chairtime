import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { db, schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import {
  listResourcesForAdmin,
  listServicesForAdmin,
  listShopHours,
  listTimeOff,
} from '@/lib/admin/queries';
import { ResourceManager } from '@/components/admin/resource-manager';

export const dynamic = 'force-dynamic';

export default async function ResourcesPage() {
  const session = await requireSession('manager');

  const [tenant] = await db
    .select({ timezone: schema.tenant.timezone })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, session.tenantId));
  const timezone = tenant?.timezone ?? 'Asia/Bangkok';

  const [resources, services, shopHours, timeOff, types] = await Promise.all([
    listResourcesForAdmin(session.tenantId),
    listServicesForAdmin(session.tenantId),
    listShopHours(session.tenantId),
    listTimeOff(session.tenantId, timezone, DateTime.now().setZone(timezone).startOf('day')),
    withTenant(session.tenantId, (tx) =>
      tx
        .select({
          id: schema.resourceType.id,
          code: schema.resourceType.code,
          name: schema.resourceType.name,
          isHuman: schema.resourceType.isHuman,
        })
        .from(schema.resourceType)
        .where(eq(schema.resourceType.tenantId, session.tenantId)),
    ),
  ]);

  return (
    <ResourceManager
      timezone={timezone}
      resources={resources}
      resourceTypes={types}
      services={services.map((s) => ({ id: s.id, name: s.name }))}
      shopHours={shopHours}
      timeOff={timeOff.map((t) => ({
        id: t.id,
        resourceId: t.resourceId,
        start: t.start.toISO()!,
        end: t.end.toISO()!,
        reason: t.reason,
      }))}
    />
  );
}
