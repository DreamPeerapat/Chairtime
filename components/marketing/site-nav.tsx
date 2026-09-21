import Image from 'next/image';
import Link from 'next/link';

/**
 * The bar across the top of the public pages.
 *
 * Two doors and nothing else: a shop already using this wants in, and one
 * looking at it wants to start. Everything else on this page is scrolling, so
 * the bar sticks — a shop that has read to the bottom should not have to
 * scroll back up to act.
 *
 * The section links appear from `md` up. On a phone they would push the
 * trial button onto a second line, and the page is short enough to scroll;
 * on a laptop they are how somebody who came for the price finds it without
 * reading the rest.
 */
const SECTIONS = [
  { href: '#วิธีใช้', label: 'วิธีใช้' },
  { href: '#ราคา', label: 'ราคา' },
  { href: '#คำถาม', label: 'คำถามบ่อย' },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-background/85 backdrop-blur">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2.5">
          {/*
            The mark is artwork on black, so it keeps its own dark tile in both
            themes rather than sitting in a white square in light mode with a
            black box inside it.
          */}
          <span className="relative size-9 shrink-0 overflow-hidden rounded-xl bg-[#0b1220]">
            <Image src="/logo-mark.png" alt="" fill sizes="36px" className="object-cover" priority />
          </span>
          <span className="text-base font-semibold tracking-tight">Chairtime</span>
        </Link>

        <div className="flex items-center gap-1">
          {SECTIONS.map((section) => (
            <Link
              key={section.href}
              href={section.href}
              className="hidden rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground md:block"
            >
              {section.label}
            </Link>
          ))}

          <Link
            href="/login"
            className="ml-1 rounded-lg px-3 py-2 text-sm whitespace-nowrap text-muted hover:text-foreground"
          >
            เข้าสู่ระบบ
          </Link>
          <Link
            href="/auth/start?provider=line"
            className="ct-press rounded-xl bg-brand px-4 py-2.5 text-sm font-medium whitespace-nowrap text-brand-contrast hover:bg-brand-strong"
          >
            {/* The length matters at 375px, where the full label wraps to two lines. */}
            ทดลองฟรี<span className="hidden sm:inline"> 15 วัน</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
