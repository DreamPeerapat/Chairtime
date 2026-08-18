'use client';

import { useState, useTransition } from 'react';
import { checkInRewardCode } from '@/lib/admin/actions';

interface CheckedIn {
  rewardName: string;
  customerName: string;
}

export function RewardCheckin() {
  const [code, setCode] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckedIn | null>(null);

  function submit(formData: FormData) {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const outcome = await checkInRewardCode({ code: formData.get('code') });
      if (outcome.ok) {
        setResult({ rewardName: outcome.rewardName ?? '', customerName: outcome.customerName ?? '' });
        setCode('');
      } else {
        setError(outcome.error ?? 'เช็คอินไม่สำเร็จ');
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={submit} className="flex gap-2">
        <input
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="กรอกโค้ด 6 หลัก"
          autoCapitalize="characters"
          className="flex-1 rounded-lg border border-slate-200 px-3 py-3 text-center text-lg font-medium tracking-widest dark:border-slate-800 dark:bg-slate-900"
        />
        <button
          type="submit"
          disabled={pending || !code.trim()}
          className="rounded-xl bg-teal-700 px-5 py-3 text-sm font-medium text-white disabled:opacity-40"
        >
          {pending ? 'กำลังตรวจสอบ…' : 'เช็คอิน'}
        </button>
      </form>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>
      ) : null}

      {result ? (
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm dark:border-teal-900 dark:bg-teal-950">
          <p className="font-medium text-teal-800 dark:text-teal-300">ใช้โค้ดสำเร็จ</p>
          <p className="mt-1 text-teal-700 dark:text-teal-400">
            {result.rewardName} — {result.customerName}
          </p>
        </div>
      ) : null}
    </div>
  );
}
