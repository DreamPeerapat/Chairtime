import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { LoginFailedError, SESSION_COOKIE, SESSION_COOKIE_OPTIONS, authenticate, currentSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await currentSession();
  if (session) redirect('/dashboard');

  const { error } = await searchParams;

  async function login(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    let token: string;
    try {
      token = await authenticate(email, password);
    } catch (err) {
      if (err instanceof LoginFailedError) redirect('/login?error=invalid');
      throw err;
    }

    const store = await cookies();
    store.set(SESSION_COOKIE, token, SESSION_COOKIE_OPTIONS);
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <form action={login} className="flex w-full max-w-sm flex-col gap-4">
        <div>
          <h1 className="text-xl font-semibold">Chairtime</h1>
          <p className="mt-1 text-sm text-slate-500">เข้าสู่ระบบหลังร้าน</p>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            อีเมลหรือรหัสผ่านไม่ถูกต้อง
          </p>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">อีเมล</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">รหัสผ่าน</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900"
          />
        </label>

        <button
          type="submit"
          className="rounded-xl bg-teal-700 py-3 text-sm font-medium text-white"
        >
          เข้าสู่ระบบ
        </button>
      </form>
    </main>
  );
}
