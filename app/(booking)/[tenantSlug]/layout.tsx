import Link from 'next/link';
import { notFound } from 'next/navigation';
import { findTenantBySlug } from '@/lib/booking/queries';
import { hasPublishedPortfolio } from '@/lib/portfolio/queries';
import { publicRating } from '@/lib/feedback/queries';

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

  const [hasPortfolio, rating] = await Promise.all([
    hasPublishedPortfolio(tenant.id),
    publicRating(tenant.id),
  ]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col">
      {/* The shop's name, at the size a shop's name deserves. This page is the
          first thing that shop's customers see of it, and a 14px line above a
          form said "system generated". The header sits on the bright surface
          so the flow below it reads as the page and this reads as the sign
          over the door. */}
      <header className="flex items-start justify-between gap-3 border-b border-line bg-surface px-5 py-5">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">{tenant.name}</h1>
          {tenant.address ? (
            <p className="mt-1 truncate text-xs text-muted">{tenant.address}</p>
          ) : null}
          {/* What other customers thought, next to the shop's name — the one
              place a customer deciding whether to book will actually look.
              Hidden entirely below a handful of ratings: an average of one is
              not an average, and showing "5.0 จาก 1 รีวิว" reads as a boast. */}
          {rating.count >= 3 ? (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs">
              <span aria-hidden className="text-amber-400">★</span>
              <span className="font-medium">{rating.average.toFixed(1)}</span>
              <span className="text-muted">จาก {rating.count} รีวิว</span>
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* A booking form answers "when", never "can you do X for my hair".
              The shop's number belongs where that question gets asked, not
              buried at the end of the flow. */}
          {tenant.phone ? (
            <a
              href={`tel:${tenant.phone}`}
              className="ct-press inline-flex h-11 items-center rounded-xl border border-line px-3.5 text-xs whitespace-nowrap hover:bg-surface-muted"
            >
              โทรหาร้าน
            </a>
          ) : null}

          {/* Only offered when there is something behind it — a link to an
              empty gallery is a worse first impression than no link. */}
          {hasPortfolio ? (
            <Link
              href={`/${tenantSlug}/gallery`}
              className="ct-press inline-flex h-11 items-center rounded-xl border border-line px-3.5 text-xs whitespace-nowrap hover:bg-surface-muted"
            >
              ดูผลงาน
            </Link>
          ) : null}
        </div>
      </header>
      <main className="flex flex-1 flex-col px-5 py-5">{children}</main>
      <footer className="px-5 py-6 text-center text-xs text-muted">
        จองคิวด้วย Chairtime
      </footer>
    </div>
  );
}
