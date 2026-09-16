import Link from 'next/link';

/**
 * The front door.
 *
 * It used to be a title and one line of description, with no way in at all —
 * a shop owner who typed the domain into a laptop had nowhere to click, and
 * /login was a URL they had to be told. The two things anyone arriving here
 * wants are to sign in or to start a shop.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold">Chairtime</h1>
        <p className="mt-1 text-slate-500">ระบบจองคิวและสะสมแต้มสำหรับร้านบริการ</p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/login"
          className="ct-press rounded-xl bg-teal-700 px-6 py-3 text-center text-sm font-medium text-white hover:bg-teal-600"
        >
          เข้าสู่ระบบสำหรับร้าน
        </Link>
        <Link
          href="/auth/start?provider=line"
          className="ct-press rounded-xl border border-slate-200 px-6 py-3 text-center text-sm font-medium hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
        >
          สมัครใช้งานฟรี
        </Link>
      </div>

      <p className="text-xs text-slate-500">
        เจ้าของร้านที่ไม่สะดวกใช้คอมพิวเตอร์ พิมพ์ <span className="font-medium">หลังร้าน</span>{' '}
        ในแชท LINE ของร้าน ระบบจะส่งลิงก์เข้าหลังบ้านให้
      </p>
    </main>
  );
}
