'use client';

import { useEffect } from 'react';

/**
 * What the shop sees when anything behind the login throws.
 *
 * Without this the production build shows React's own screen — "A server
 * error occurred", in English, with no hint of what to do. A shop owner
 * reading that has no way to tell a database that is down from a bug, and
 * nothing to quote when they ask about it.
 *
 * It sits on the group rather than on `dashboard/`, because a boundary does
 * not catch the layout it sits beside — and the dashboard layout is itself a
 * database read. Put it one level down and the very failure it was written
 * for would sail straight past it.
 *
 * The digest is the one thing worth showing: it is the id of the real error
 * in the server log, and it is what turns "มันพัง" into a question that can
 * be answered.
 */
export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  // Next 16 names this `retry`, not `reset` as earlier versions did.
  retry: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard]', error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <h1 className="text-lg font-semibold">หน้านี้โหลดไม่สำเร็จ</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        ระบบขัดข้องชั่วคราว ข้อมูลการจองและการชำระเงินของร้านยังอยู่ครบ ไม่ได้หายไปไหน
        <br />
        ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบพร้อมรหัสด้านล่าง
      </p>

      <button
        type="button"
        onClick={() => retry()}
        className="ct-press rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-medium text-white"
      >
        ลองใหม่อีกครั้ง
      </button>

      {error.digest ? (
        <p className="font-mono text-xs text-slate-500">รหัสข้อผิดพลาด {error.digest}</p>
      ) : null}
    </div>
  );
}
