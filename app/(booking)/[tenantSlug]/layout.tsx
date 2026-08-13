import { notFound } from 'next/navigation';
import { findTenantBySlug } from '@/lib/booking/queries';

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

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col">
      <header className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <h1 className="text-lg font-semibold">{tenant.name}</h1>
        {tenant.address ? (
          <p className="mt-0.5 text-xs text-slate-500">{tenant.address}</p>
        ) : null}
      </header>
      <main className="flex-1 px-5 py-5">{children}</main>
      <footer className="px-5 py-6 text-center text-xs text-slate-400">
        จองคิวด้วย Chairtime
      </footer>
    </div>
  );
}
