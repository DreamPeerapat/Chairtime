'use client';

/**
 * Duplicate customers, usually one record from a phone booking and one from
 * LINE. The survivor is the one with more visits, which is almost always the
 * older record.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { mergeCustomerRecords } from '@/lib/admin/actions';

export interface DuplicateGroup {
  name: string;
  ids: string[];
  phones: (string | null)[];
  visits: number[];
}

export function MergePanel({ duplicates }: { duplicates: DuplicateGroup[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  function merge(keepId: string, mergeId: string) {
    setError(null);
    startTransition(async () => {
      const result = await mergeCustomerRecords({ keepId, mergeId });
      if (result.ok) {
        setDone((prev) => [...prev, mergeId]);
        router.refresh();
      } else {
        setError(result.error ?? 'รวมไม่สำเร็จ');
      }
    });
  }

  const groups = duplicates.filter((g) => g.ids.some((id) => !done.includes(id)));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-500">
        รายชื่อที่ซ้ำกัน — มักเกิดจากลูกค้าคนเดิมจองทางโทรศัพท์ครั้งหนึ่งและทาง LINE อีกครั้ง
      </p>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
          ไม่พบรายชื่อซ้ำ
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => {
            const keepId = group.ids[0]!;
            return (
              <li
                key={group.name}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
              >
                <h2 className="text-sm font-medium">{group.name}</h2>
                <ul className="flex flex-col gap-1.5">
                  {group.ids.map((id, index) => (
                    <li key={id} className="flex items-center justify-between gap-3 text-xs">
                      <span className={done.includes(id) ? 'text-slate-400 line-through' : ''}>
                        {group.phones[index] ?? 'ไม่มีเบอร์'} · มา {group.visits[index] ?? 0} ครั้ง
                        {index === 0 ? (
                          <span className="ml-2 rounded bg-teal-100 px-1.5 py-0.5 text-teal-800">
                            เก็บอันนี้
                          </span>
                        ) : null}
                      </span>
                      {index > 0 && !done.includes(id) ? (
                        <button
                          type="button"
                          onClick={() => merge(keepId, id)}
                          disabled={pending}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 disabled:opacity-50 dark:border-slate-700"
                        >
                          รวมเข้าอันแรก
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
