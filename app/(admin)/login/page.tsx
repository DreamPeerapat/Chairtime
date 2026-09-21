import Image from 'next/image';
import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';
import { providerIsConfigured } from '@/lib/auth/oauth';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  oauth: 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง',
  oauth_config: 'ระบบล็อกอินยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล',
  // The provider verified this person fine; the failure was on our side
  // (database or SESSION_SECRET). Retrying the same login will not help,
  // so the copy does not invite it — the detail is in the server log.
  server: 'ระบบขัดข้องชั่วคราว ยืนยันตัวตนผ่านแล้วแต่เปิดบัญชีไม่สำเร็จ กรุณาติดต่อผู้ดูแล',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await currentSession();
  if (session) redirect('/dashboard');

  // Only offer a provider this deployment can actually complete.
  const lineReady = providerIsConfigured('line');
  const googleReady = providerIsConfigured('google');

  const { error } = await searchParams;
  const message = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.oauth) : null;

  return (
    // A door, not a form: three lines of text floating in the middle of an
    // empty page looked like something half-loaded. The card gives the two
    // buttons somewhere to stand, and the mark says which product this is to
    // a shop owner who followed a link from LINE.
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <div className="flex w-full max-w-sm flex-col gap-5 rounded-3xl border border-line bg-surface p-8 shadow-card">
        <div className="text-center">
          <span className="relative mx-auto block size-12 overflow-hidden rounded-2xl bg-[#0b1220]">
            <Image src="/logo-mark.png" alt="" fill sizes="48px" className="object-cover" priority />
          </span>
          <h1 className="mt-5 text-2xl font-semibold">Chairtime</h1>
          <p className="mt-1.5 text-sm text-muted">เข้าสู่ระบบหลังร้าน</p>
        </div>

        {message ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {message}
          </p>
        ) : null}

        {lineReady ? (
          <a
            href="/auth/start?provider=line"
            className="ct-press flex items-center justify-center gap-2 rounded-2xl bg-[#06C755] py-3.5 text-sm font-medium text-white"
          >
            เข้าสู่ระบบด้วย LINE
          </a>
        ) : null}

        {googleReady ? (
          <a
            href="/auth/start?provider=google"
            className="ct-press flex items-center justify-center gap-2 rounded-2xl border border-line py-3.5 text-sm font-medium text-foreground hover:bg-surface-muted"
          >
            เข้าสู่ระบบด้วย Google
          </a>
        ) : null}

        {!lineReady && !googleReady ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            ยังไม่ได้ตั้งค่าช่องทางเข้าสู่ระบบ กรุณาติดต่อผู้ดูแลระบบ
          </p>
        ) : null}

        <p className="text-center text-xs text-muted">
          ยังไม่มีร้าน?{' '}
          <a
            href={`/auth/start?provider=${lineReady ? 'line' : 'google'}`}
            className="underline"
          >
            สมัครใช้งานฟรี
          </a>
        </p>
      </div>
    </main>
  );
}
