/**
 * The strip that says whose shop this is.
 *
 * An operator with several shops open is one mis-click from editing the wrong
 * one, and every screen below this looks identical whichever shop it is
 * showing. So the banner is loud, it names the shop, and the way out is in it
 * — a operator who cannot find the exit stays impersonating, which is how a
 * stray edit lands in somebody's live calendar.
 */
export function ImpersonationBanner({
  shopName,
  onLeave,
}: {
  shopName: string;
  onLeave: () => Promise<void>;
}) {
  return (
    <div className="border-b border-slate-700 bg-slate-800 text-slate-100 dark:border-slate-600 dark:bg-slate-700">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
        <p>
          <span className="font-medium">โหมดแอดมินระบบ</span> — กำลังดูหลังบ้านของ{' '}
          <span className="font-medium">{shopName}</span> การแก้ไขทุกอย่างมีผลกับร้านนี้จริง
        </p>
        <form action={onLeave}>
          <button
            type="submit"
            className="ct-press shrink-0 rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-900"
          >
            ออกจากโหมดแอดมิน
          </button>
        </form>
      </div>
    </div>
  );
}
