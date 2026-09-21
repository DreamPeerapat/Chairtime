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
    <div className="border-b border-[#26332f] bg-[#1b2827] text-[#f4f1ea]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs">
        <p>
          <span className="font-medium">โหมดแอดมินระบบ</span> — กำลังดูหลังบ้านของ{' '}
          <span className="font-medium">{shopName}</span> การแก้ไขทุกอย่างมีผลกับร้านนี้จริง
        </p>
        <form action={onLeave}>
          <button
            type="submit"
            className="ct-press shrink-0 rounded-lg bg-[#f4f1ea] px-3 py-1.5 font-medium text-[#14201f]"
          >
            ออกจากโหมดแอดมิน
          </button>
        </form>
      </div>
    </div>
  );
}
