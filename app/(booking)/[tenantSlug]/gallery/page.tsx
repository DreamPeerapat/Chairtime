import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findTenantBySlug } from '@/lib/booking/queries';
import { listPublishedPortfolio } from '@/lib/portfolio/queries';
import { GalleryView } from '@/components/booking/gallery-view';

export const dynamic = 'force-dynamic';

export default async function GalleryPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await findTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const photos = await listPublishedPortfolio(tenant.id);

  return (
    <div className="ct-enter flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">ผลงานของเรา</h2>
        <p className="mt-0.5 text-sm text-muted">ดูตัวอย่างงานก่อนตัดสินใจจองได้เลยค่ะ</p>
      </div>

      <GalleryView photos={photos} shopName={tenant.name} />

      <Link
        href={`/${tenantSlug}`}
        className="ct-press mt-2 rounded-xl bg-brand py-3 text-center text-sm font-medium text-brand-contrast hover:bg-brand-strong active:bg-brand-strong"
      >
        จองคิว
      </Link>
    </div>
  );
}
