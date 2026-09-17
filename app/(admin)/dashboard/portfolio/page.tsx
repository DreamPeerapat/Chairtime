import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { listPortfolioForAdmin } from '@/lib/portfolio/queries';
import { PortfolioManager } from '@/components/admin/portfolio-manager';
import { PortfolioUploader } from '@/components/admin/portfolio-uploader';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const session = await requireSession('staff');

  const [photos, options] = await Promise.all([
    listPortfolioForAdmin(session.tenantId),
    withTenant(session.tenantId, async (tx) => ({
      staff: await tx
        .select({ id: schema.resource.id, name: schema.resource.name })
        .from(schema.resource)
        .innerJoin(schema.resourceType, eq(schema.resourceType.id, schema.resource.resourceTypeId))
        .where(eq(schema.resource.tenantId, session.tenantId))
        .orderBy(schema.resource.displayOrder),
      services: await tx
        .select({ id: schema.service.id, name: schema.service.name })
        .from(schema.service)
        .where(eq(schema.service.tenantId, session.tenantId))
        .orderBy(schema.service.displayOrder),
    })),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">ผลงานของร้าน</h1>
          <p className="mt-0.5 text-sm text-muted">
            รูปที่ลูกค้าจะเห็นในหน้าแกลเลอรี่ และตอนเลือกช่าง
          </p>
        </div>
        <PortfolioUploader tenantId={session.tenantId} />
      </div>

      <PortfolioManager photos={photos} staff={options.staff} services={options.services} />
    </div>
  );
}
