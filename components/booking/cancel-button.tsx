'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CancelBookingButton({
  tenantId,
  bookingId,
  cancelCutoffMin,
}: {
  tenantId: string;
  bookingId: string;
  cancelCutoffMin: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true);
    setError(null);
    const response = await fetch(
      `/api/bookings/${bookingId}?tenantId=${tenantId}&reason=${encodeURIComponent('ลูกค้ายกเลิกเอง')}`,
      { method: 'DELETE' },
    );
    if (response.ok) {
      router.refresh();
    } else {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? 'ยกเลิกไม่สำเร็จ กรุณาติดต่อร้าน');
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-xl border border-red-200 py-3 text-sm text-red-700 dark:border-red-900 dark:text-red-400"
      >
        ยกเลิกคิว
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-red-200 p-4 dark:border-red-900">
      <p className="text-sm">ยืนยันยกเลิกคิวนี้?</p>
      <p className="text-xs text-slate-500">
        ยกเลิกได้ก่อนเวลานัดอย่างน้อย {cancelCutoffMin} นาที หลังจากนั้นต้องติดต่อร้านโดยตรง
      </p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm dark:border-slate-800"
        >
          ไม่ยกเลิก
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'กำลังยกเลิก…' : 'ยืนยันยกเลิก'}
        </button>
      </div>
    </div>
  );
}
