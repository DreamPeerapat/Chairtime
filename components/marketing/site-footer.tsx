import Link from 'next/link';

/**
 * The last thing on the page: one more way in, and who is behind this.
 *
 * The line about typing หลังร้าน in LINE used to be the whole front page. It
 * belongs here — it matters to the shop owner who is already a customer and
 * has lost the dashboard link, not to the one deciding whether to sign up.
 *
 * The closing panel is filled with brand colour rather than tinted with it.
 * A page that has been pale the whole way down needs its last ask to be the
 * loudest thing on it, and a soft-teal box with a teal button inside it was
 * the quietest.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface-muted">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <div className="flex flex-col items-start gap-8 rounded-3xl bg-brand px-8 py-11 text-brand-contrast shadow-raised sm:px-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <h2 className="text-2xl font-semibold sm:text-3xl">ลองดูก่อน 15 วัน ไม่ต้องใส่บัตร</h2>
            <p className="mt-3 text-sm leading-[1.85] opacity-90">
              ตั้งร้านเสร็จภายในสิบนาที ถ้าไม่ใช่ก็เลิกได้ ไม่มีอะไรผูกไว้
            </p>
          </div>
          <Link
            href="/auth/start?provider=line"
            className="ct-press inline-flex shrink-0 items-center gap-2.5 rounded-2xl bg-surface px-7 py-4 text-sm font-semibold text-brand-strong hover:bg-surface-muted"
          >
            เริ่มทดลองฟรี
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <path d="M5 12h13" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-4 border-t border-line pt-8 text-xs text-muted sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Chairtime · ระบบจองคิวและสะสมแต้มสำหรับร้านบริการ</p>
          <p>
            เจ้าของร้านที่ไม่สะดวกใช้คอมพิวเตอร์ พิมพ์{' '}
            <span className="font-medium text-foreground">หลังร้าน</span> ในแชท LINE ของร้าน
            ระบบจะส่งลิงก์เข้าหลังบ้านให้
          </p>
        </div>
      </div>
    </footer>
  );
}
