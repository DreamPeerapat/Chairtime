import type { Metadata } from 'next';
import { IBM_Plex_Sans_Thai, Noto_Serif_Thai } from 'next/font/google';
import './globals.css';

/**
 * The two faces the whole product is set in.
 *
 * globals.css has named IBM Plex Sans Thai since the first commit, and until
 * now nothing downloaded it — every screen was rendering in whatever the
 * phone happened to have, which on Android is not a Thai face with matching
 * weights. next/font self-hosts both and gives them stable CSS variables, so
 * there is no request to Google at runtime and no flash of a fallback.
 *
 * The serif is headings only (see the h1–h3 rule in globals.css); it is
 * loaded at the weights that rule actually uses, because every extra weight
 * is a file a shop on 4G waits for.
 */
const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-thai',
  display: 'swap',
});

const serifThai = Noto_Serif_Thai({
  subsets: ['thai', 'latin'],
  weight: ['500', '600'],
  variable: '--font-serif-thai',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Chairtime',
  description: 'ระบบจองคิวและสะสมแต้มสำหรับร้านบริการ',
};

/**
 * Applies a stored theme choice before the first paint.
 *
 * The default is light: <html> is rendered with data-theme="light", so a page
 * with no stored choice — or no JavaScript — is light whatever the OS says.
 * This script only changes that for someone who chose dark, or chose to
 * follow the device ('system', which removes the attribute and hands the
 * decision back to the prefers-color-scheme rule in globals.css).
 *
 * Without it the page renders light, hydrates, and then flips — a white
 * flash on every navigation for anybody who chose dark. It has to be
 * inline and it has to be in <head>, so it is a string rather than a module:
 * an external file would be a round trip, and the flash is exactly as long
 * as that round trip.
 *
 * Nothing here can throw. Storage access alone throws in a private window,
 * and an exception in this script would leave the page unstyled.
 *
 * Keep the key and the values in step with components/ui/theme-toggle.tsx.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem('chairtime-theme'),r=document.documentElement;if(t==='dark'){r.dataset.theme='dark'}else if(t==='system'){r.removeAttribute('data-theme')}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning is for THEME_SCRIPT below and nothing else: it
    // changes `data-theme` on this element before React sees the page, and React
    // would otherwise report the attribute value it did not render as a mismatch.
    // It suppresses warnings for this element's own attributes only, not for
    // anything inside it.
    <html
      lang="th"
      data-theme="light"
      suppressHydrationWarning
      className={`${plexThai.variable} ${serifThai.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
