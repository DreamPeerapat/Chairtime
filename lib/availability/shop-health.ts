/**
 * "Can this shop take a booking at all?" — asked on the shop's behalf.
 *
 * `diagnoseSetup` answers it for one basket of services; the dashboard needs
 * the shop-wide version, because the owner's problem is never "this basket" —
 * it is that nobody can book anything and nothing has said so. A shop created
 * by the onboarding wizard before this existed sat in exactly that state:
 * services and resource *types* from the business template, but not one actual
 * staff member or seat.
 */
import { and, eq } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import type { PlainDate } from '@/lib/time';
import { diagnoseSetup, type SetupProblem } from './diagnose';
import { loadAvailabilityContext } from './load';

/**
 * Every reason this shop cannot currently be booked, or an empty array.
 *
 * `date` only decides which day's closures and allocations get loaded; the
 * checks themselves are about configuration, not about any one day being busy.
 */
export async function diagnoseShop(
  tenantId: string,
  timezone: string,
  date?: PlainDate,
): Promise<SetupProblem[]> {
  const day = date ?? (DateTime.now().setZone(timezone).toISODate() as PlainDate);

  return withTenant(tenantId, async (tx) => {
    const services = await tx
      .select({ id: schema.service.id })
      .from(schema.service)
      .where(and(eq(schema.service.tenantId, tenantId), eq(schema.service.isActive, true)));

    // loadAvailabilityContext cannot be asked about an empty service list, and
    // there is nothing further to check once there is nothing to book.
    if (services.length === 0) {
      return [{ code: 'no_services' as const, message: 'ยังไม่มีบริการที่เปิดให้จอง', names: [] }];
    }

    const ctx = await loadAvailabilityContext(
      tx,
      tenantId,
      day,
      services.map((s) => s.id),
    );
    return diagnoseSetup(
      ctx,
      services.map((s) => s.id),
    );
  });
}
