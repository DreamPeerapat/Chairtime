import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE } from '@/lib/auth';

/**
 * A deliberately plain shell, and deliberately not the shop dashboard's.
 *
 * The shop header names a shop and colours itself like one. An operator
 * standing outside every shop should not see that chrome, or the next screen
 * they open will feel like it belongs to whichever shop they last visited.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  async function logout() {
    'use server';
    const store = await cookies();
    store.delete(SESSION_COOKIE);
    redirect('/login');
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-[#26332f] bg-[#14201f] text-[#f4f1ea]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5">
          <Link href="/admin" className="text-sm font-semibold">
            Chairtime · แอดมินระบบ
          </Link>
          <div className="flex items-center gap-3 text-xs">
            <Link href="/dashboard" className="text-[#a8b4b2] hover:text-white">
              ร้านของฉัน
            </Link>
            <form action={logout}>
              <button type="submit" className="text-[#a8b4b2] hover:text-white">
                ออกจากระบบ
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">{children}</main>
    </div>
  );
}
