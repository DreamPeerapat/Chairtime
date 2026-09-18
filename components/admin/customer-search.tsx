'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DateTime } from 'luxon';
import { Badge, Card, EmptyState, Rows } from '@/components/ui/page';

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  lineUserId: string | null;
  visitCount: number;
  noShowCount: number;
  pointBalance: number;
  lastVisitAt: string | null;
  note: string | null;
  isBlocked: boolean;
}

export function CustomerSearch({ query, customers }: { query: string; customers: CustomerRow[] }) {
  const router = useRouter();
  const [term, setTerm] = useState(query);

  function search(e: React.FormEvent) {
    e.preventDefault();
    router.push(term.trim() ? `/dashboard/customers?q=${encodeURIComponent(term.trim())}` : '/dashboard/customers');
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="ค้นหาด้วยชื่อหรือเบอร์โทร"
          className="flex-1 rounded-xl border border-line bg-surface px-4 py-3 text-sm"
        />
        <button
          type="submit"
          className="ct-press shrink-0 rounded-xl bg-brand px-5 py-3 text-sm font-medium text-brand-contrast"
        >
          ค้นหา
        </button>
      </form>

      <Card
        padded={false}
        title={query ? `ผลการค้นหา “${query}”` : 'ลูกค้าทั้งหมด'}
        description={customers.length > 0 ? `${customers.length} คน` : undefined}
      >
        {customers.length === 0 ? (
          <EmptyState
            title={query ? 'ไม่พบลูกค้าที่ตรงกับคำค้นนี้' : 'ยังไม่มีลูกค้า'}
            description={
              query
                ? 'ลองค้นด้วยเบอร์โทรสี่ตัวท้าย หรือชื่อเล่นที่ร้านใช้เรียก'
                : 'ลูกค้าจะขึ้นที่นี่เองเมื่อมีคนจองคิวเข้ามา หรือเมื่อร้านลงคิวหน้าร้านให้'
            }
          />
        ) : (
          <Rows>
            {customers.map((customer) => (
              <li key={customer.id}>
                <Link
                  href={`/dashboard/customers/${customer.id}`}
                  className="flex items-center gap-4 px-4 py-3.5 transition hover:bg-surface-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{customer.name}</span>
                      {customer.isBlocked ? <Badge tone="danger">รวมแล้ว/บล็อก</Badge> : null}
                      {customer.lineUserId ? <Badge tone="brand">LINE</Badge> : null}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {customer.phone ?? 'ไม่มีเบอร์'}
                      {customer.lastVisitAt
                        ? ` · มาล่าสุด ${DateTime.fromISO(customer.lastVisitAt).setLocale('th').toRelative()}`
                        : ' · ยังไม่เคยมา'}
                    </span>
                    {customer.note ? (
                      <span className="mt-1 block truncate text-xs text-amber-700 dark:text-amber-400">
                        {customer.note}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-medium tabular-nums">
                      {customer.visitCount}
                    </span>
                    <span className="block text-xs text-muted">ครั้ง</span>
                  </span>
                  {customer.noShowCount > 0 ? (
                    <Badge tone="warn">ไม่มา {customer.noShowCount}</Badge>
                  ) : null}
                  <span aria-hidden className="shrink-0 text-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </Rows>
        )}
      </Card>
    </div>
  );
}
