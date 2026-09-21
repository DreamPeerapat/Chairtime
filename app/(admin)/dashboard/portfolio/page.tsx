import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { listPortfolioForAdmin } from '@/lib/portfolio/queries';
import { PortfolioManager } from '@/components/admin/portfolio-manager';
import { PortfolioUploader } from '@/components/admin/portfolio-uploader';
import { PageBody, PageHeader } from '@/components/ui/page';

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
    <PageBody>
      <PageHeader
        title="ผลงานของร้าน"
        description="รูปที่ลูกค้าจะเห็นในหน้าแกลเลอรี่ และตอนเลือกช่าง"
        action={<PortfolioUploader tenantId={session.tenantId} />}
      />

      <PortfolioManager photos={photos} staff={options.staff} services={options.services} />
    </PageBody>
  );
}
