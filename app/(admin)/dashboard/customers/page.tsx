import Link from 'next/link';
import { DateTime } from 'luxon';
import { requireSession } from '@/lib/auth';
import { findMergeCandidates, searchCustomers } from '@/lib/admin/queries';
import { CustomerSearch } from '@/components/admin/customer-search';
import { MergePanel } from '@/components/admin/merge-panel';
import { PageBody, PageHeader } from '@/components/ui/page';

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
    <PageBody>
      <PageHeader
        title="ลูกค้า"
        description="ทุกคนที่เคยจองหรือเคยมาที่ร้าน กดชื่อเพื่อดูประวัติและโน้ตของคนนั้น"
        action={
          <Link
            href={merge ? '/dashboard/customers' : '/dashboard/customers?merge=1'}
            className="ct-press rounded-xl border border-line bg-surface px-4 py-2.5 text-sm font-medium"
          >
            {merge ? 'กลับไปรายชื่อ' : 'หาลูกค้าซ้ำ'}
          </Link>
        }
      />

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
    </PageBody>
  );
}
