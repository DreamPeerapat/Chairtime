import Link from 'next/link';
import { DateTime } from 'luxon';
import { requireSession } from '@/lib/auth';
import { findMergeCandidates, searchCustomers } from '@/lib/admin/queries';
import { CustomerSearch } from '@/components/admin/customer-search';
import { MergePanel } from '@/components/admin/merge-panel';

export const dynamic = 'force-dynamic';

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; merge?: string }>;
}) {
  const session = await requireSession('staff');
  const { q = '', merge } = await searchParams;

  const [customers, duplicates] = await Promise.all([
    searchCustomers(session.tenantId, q),
    merge ? findMergeCandidates(session.tenantId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">ลูกค้า</h1>
        <Link
          href={merge ? '/dashboard/customers' : '/dashboard/customers?merge=1'}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs dark:border-slate-800"
        >
          {merge ? 'กลับไปรายชื่อ' : 'หาลูกค้าซ้ำ'}
        </Link>
      </div>

      {merge ? (
        <MergePanel duplicates={duplicates} />
      ) : (
        <CustomerSearch
          query={q}
          customers={customers.map((c) => ({
            ...c,
            lastVisitAt: c.lastVisitAt ? DateTime.fromJSDate(c.lastVisitAt).toISO() : null,
          }))}
        />
      )}
    </div>
  );
}
