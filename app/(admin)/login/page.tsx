import { redirect } from 'next/navigation';
import { currentSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ERROR_MESSAGES: Record<string, string> = {
  oauth: 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง',
  oauth_config: 'ระบบล็อกอินยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแล',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await currentSession();
  if (session) redirect('/dashboard');

  const { error } = await searchParams;
  const message = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.oauth) : null;

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">Chairtime</h1>
          <p className="mt-1 text-sm text-slate-500">เข้าสู่ระบบหลังร้าน</p>
        </div>

        {message ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {message}
          </p>
        ) : null}

        <a
          href="/auth/start?provider=line"
          className="flex items-center justify-center gap-2 rounded-xl bg-[#06C755] py-3 text-sm font-medium text-white"
        >
          เข้าสู่ระบบด้วย LINE
        </a>

        <a
          href="/auth/start?provider=google"
          className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-800 dark:border-slate-700 dark:text-slate-100"
        >
          เข้าสู่ระบบด้วย Google
        </a>

        <p className="text-center text-xs text-slate-400">
          ยังไม่มีร้าน?{' '}
          <a href="/auth/start?provider=line" className="underline">
            สมัครใช้งานฟรี
          </a>
        </p>
      </div>
    </main>
  );
}
