import Link from 'next/link';

/**
 * The last thing on the page: one more way in, and who is behind this.
 *
 * The line about typing หลังร้าน in LINE used to be the whole front page. It
 * belongs here — it matters to the shop owner who is already a customer and
 * has lost the dashboard link, not to the one deciding whether to sign up.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="rounded-2xl border border-line bg-brand-soft px-6 py-10 text-center">
          <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
            ลองดูก่อน 15 วัน ไม่ต้องใส่บัตร
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted">
            ตั้งร้านเสร็จภายในสิบนาที ถ้าไม่ใช่ก็เลิกได้ ไม่มีอะไรผูกไว้
          </p>
          <Link
            href="/auth/start?provider=line"
            className="ct-press mt-6 inline-block rounded-xl bg-brand px-6 py-3.5 text-sm font-medium text-brand-contrast hover:bg-brand-strong"
          >
            เริ่มทดลองฟรี
          </Link>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 text-xs text-muted sm:flex-row">
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
