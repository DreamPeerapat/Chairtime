import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, requireSession } from '@/lib/auth';

const NAV = [
  { href: '/dashboard', label: 'ปฏิทิน' },
  { href: '/dashboard/customers', label: 'ลูกค้า' },
  { href: '/dashboard/services', label: 'บริการ' },
  { href: '/dashboard/resources', label: 'ช่างและที่นั่ง' },
  { href: '/dashboard/settings', label: 'ตั้งค่า' },
] as const;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession('staff');

  async function logout() {
    'use server';
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    redirect('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm font-semibold">{session.tenantSlug}</span>
          <form action={logout}>
            <button type="submit" className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-slate-200">
              ออกจากระบบ
            </button>
          </form>
        </div>
        <nav className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-1 pb-2">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
    </div>
  );
}
