import { requireSession } from '@/lib/auth';
import { listServicesForAdmin } from '@/lib/admin/queries';
import { ServiceManager } from '@/components/admin/service-manager';

export const dynamic = 'force-dynamic';

export default async function ServicesPage() {
  const session = await requireSession('manager');
  const services = await listServicesForAdmin(session.tenantId);
  return <ServiceManager services={services} />;
}
