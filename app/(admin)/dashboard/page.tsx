import { DateTime } from 'luxon';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { db, schema } from '@/lib/db/client';
import { loadDayCalendar, listServicesForAdmin, summariseDay } from '@/lib/admin/queries';
import { diagnoseShop } from '@/lib/availability/shop-health';
import { DayView } from '@/components/admin/day-view';
import { SetupWarning } from '@/components/admin/setup-warning';

export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await requireSession('staff');
  const { date } = await searchParams;

  const [tenant] = await db
    .select({ timezone: schema.tenant.timezone, name: schema.tenant.name })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, session.tenantId));

  const timezone = tenant?.timezone ?? 'Asia/Bangkok';
  const day = date ?? DateTime.now().setZone(timezone).toISODate()!;

  const [calendar, services, setupProblems] = await Promise.all([
    loadDayCalendar(session.tenantId, day, timezone),
    listServicesForAdmin(session.tenantId),
    diagnoseShop(session.tenantId, timezone, day),
  ]);

  return (
    <div className="flex flex-col gap-4">
      {/* Above the calendar on purpose: an empty day looks the same whether
          the shop is quiet or unbookable, and only one of those is fixable. */}
      <SetupWarning problems={setupProblems} />
      <DayView
        calendar={calendar}
        stats={summariseDay(calendar.bookings)}
        services={services.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name }))}
        shopName={tenant?.name ?? ''}
      />
    </div>
  );
}
