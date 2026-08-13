'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { DateTime } from 'luxon';
import { saveCustomerNote } from '@/lib/admin/actions';
import { formatBaht, statusLabel } from '@/components/booking/format';

export function CustomerDetail({
  customer,
  visits,
  timezone,
}: {
  customer: {
    id: string;
    name: string;
    phone: string | null;
    lineUserId: string | null;
    note: string | null;
    visitCount: number;
    noShowCount: number;
    pointBalance: number;
    lifetimeSpend: string;
    isBlocked: boolean;
  };
  visits: Array<{
    id: string;
    code: string;
    status: string;
    startsAt: string;
    total: string;
    services: string[];
  }>;
  timezone: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState(customer.note ?? '');
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function save() {
    setSaved(false);
    startTransition(async () => {
      const result = await saveCustomerNote({ customerId: customer.id, note });
      if (result.ok) {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/dashboard/customers" className="text-xs text-slate-500">
          ‹ กลับไปรายชื่อ
        </Link>
        <h1 className="mt-1 text-lg font-semibold">{customer.name}</h1>
        <p className="text-sm text-slate-500">
          {customer.phone ?? 'ไม่มีเบอร์'}
          {customer.lineUserId ? ' · เชื่อม LINE แล้ว' : ''}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="มาแล้ว" value={`${customer.visitCount} ครั้ง`} />
        <Stat
          label="ไม่มา"
          value={`${customer.noShowCount} ครั้ง`}
          tone={customer.noShowCount >= 3 ? 'warn' : undefined}
        />
        <Stat label="แต้มคงเหลือ" value={String(customer.pointBalance)} />
        <Stat label="ยอดสะสม" value={formatBaht(customer.lifetimeSpend)} />
      </dl>

      {customer.noShowCount >= 3 ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          ลูกค้ารายนี้ไม่มาตามนัด {customer.noShowCount} ครั้ง — พิจารณาขอมัดจำก่อนรับจอง
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">
          โน้ต (เห็นเฉพาะร้าน)
        </h2>
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setSaved(false);
          }}
          rows={3}
          placeholder="เช่น แพ้น้ำยา X, ชอบช่างแนน, ผมบาง"
          className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
        />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? 'กำลังบันทึก…' : 'บันทึกโน้ต'}
          </button>
          {saved ? <span className="text-xs text-teal-700">บันทึกแล้ว</span> : null}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">ประวัติการมา</h2>
        {visits.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
            ยังไม่มีประวัติ
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visits.map((visit) => {
              const status = statusLabel(visit.status);
              const at = DateTime.fromISO(visit.startsAt).setZone(timezone);
              return (
                <li
                  key={visit.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <p className="text-sm">{at.setLocale('th').toFormat('d LLL yyyy · HH:mm')}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {visit.services.join(', ')}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${status.tone}`}>
                      {status.label}
                    </span>
                    <p className="mt-1 text-xs tabular-nums text-slate-500">
                      {formatBaht(visit.total)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-base font-semibold ${tone === 'warn' ? 'text-red-600' : ''}`}>{value}</dd>
    </div>
  );
}
