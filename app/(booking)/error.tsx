'use client';

import { useEffect } from 'react';

/**
 * What a customer sees when the booking page throws.
 *
 * The audience is the reason this is separate from the dashboard's: somebody
 * standing outside a salon with a phone, who does not know what a digest is
 * and cannot fix anything. They need to know the shop is fine and that
 * phoning still works — not a stack of English words.
 *
 * On the group, not on `[tenantSlug]/`: that segment's layout looks the shop
 * up in the database, and a boundary beside a layout does not catch it.
 */
export default function BookingError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next 16 names this `retry`, not `reset` as earlier versions did.
  retry: () => void;
}) {
  useEffect(() => {
    console.error('[booking]', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-semibold">ตอนนี้เปิดหน้านี้ไม่ได้</h1>
      <p className="text-sm text-muted">
        ระบบขัดข้องชั่วคราว ไม่ได้เกิดจากร้าน ลองกดใหม่อีกสักครู่
        <br />
        ถ้ารีบ ติดต่อร้านทางโทรศัพท์หรือ LINE ได้เลย
      </p>

      <button
        type="button"
        onClick={() => retry()}
        className="ct-press rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-brand-contrast"
      >
        ลองใหม่อีกครั้ง
      </button>
    </main>
  );
}
