import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findTenantBySlug } from '@/lib/booking/queries';
import { hasPublishedPortfolio } from '@/lib/portfolio/queries';

export default async function BookingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await findTenantBySlug(tenantSlug);
  if (!tenant) notFound();

  const hasPortfolio = await hasPublishedPortfolio(tenant.id);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{tenant.name}</h1>
          {tenant.address ? (
            <p className="mt-0.5 text-xs text-slate-500">{tenant.address}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* A booking form answers "when", never "can you do X for my hair".
              The shop's number belongs where that question gets asked, not
              buried at the end of the flow. */}
          {tenant.phone ? (
            <a
              href={`tel:${tenant.phone}`}
              className="ct-press rounded-lg border border-slate-200 px-3 py-1.5 text-xs whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              โทรหาร้าน
            </a>
          ) : null}

          {/* Only offered when there is something behind it — a link to an
              empty gallery is a worse first impression than no link. */}
          {hasPortfolio ? (
            <Link
              href={`/${tenantSlug}/gallery`}
              className="ct-press rounded-lg border border-slate-200 px-3 py-1.5 text-xs whitespace-nowrap hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              ดูผลงาน
            </Link>
          ) : null}
        </div>
      </header>
      <main className="flex flex-1 flex-col px-5 py-5">{children}</main>
      <footer className="px-5 py-6 text-center text-xs text-slate-400">
        จองคิวด้วย Chairtime
      </footer>
    </div>
  );
}
