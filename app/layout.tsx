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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${plexThai.variable} ${serifThai.variable}`}>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
