'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DateTime } from 'luxon';

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
    <div className="flex flex-col gap-3">
      <form onSubmit={search} className="flex gap-2">
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="ค้นหาด้วยชื่อหรือเบอร์โทร"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
        />
        <button type="submit" className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white">
          ค้นหา
        </button>
      </form>

      {customers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
          {query ? `ไม่พบลูกค้าที่ตรงกับ "${query}"` : 'ยังไม่มีลูกค้า'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {customers.map((customer) => (
            <li key={customer.id}>
              <Link
                href={`/dashboard/customers/${customer.id}`}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {customer.name}
                    {customer.isBlocked ? (
                      <span className="ml-2 text-xs text-slate-400">รวมแล้ว/บล็อก</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {customer.phone ?? 'ไม่มีเบอร์'}
                    {customer.lineUserId ? ' · LINE' : ''}
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
                <span className="shrink-0 text-right text-xs">
                  <span className="block tabular-nums">มา {customer.visitCount} ครั้ง</span>
                  {customer.noShowCount > 0 ? (
                    <span className="block tabular-nums text-red-600">ไม่มา {customer.noShowCount}</span>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
