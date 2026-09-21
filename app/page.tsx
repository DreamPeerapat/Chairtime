import type { Metadata } from 'next';
import { Faq } from '@/components/marketing/faq';
import { Features } from '@/components/marketing/features';
import { Hero } from '@/components/marketing/hero';
import { Pricing } from '@/components/marketing/pricing';
import { ProofStrip } from '@/components/marketing/proof-strip';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteNav } from '@/components/marketing/site-nav';
import { Steps } from '@/components/marketing/steps';

/**
 * The front door.
 *
 * It was a title, one line of description and two buttons — which told a shop
 * owner who had heard the name nothing about whether this was for them. The
 * page now answers, in order, the questions they arrive with: what it does,
 * what they get, how long it takes to start, what it costs, and the six things
 * they would otherwise have to ask before signing up.
 *
 * A server component with one interactive island (the pricing switch), so the
 * whole page is in the HTML for anyone reading it without JavaScript — and for
 * the search engines a shop finds us through.
 */
export const metadata: Metadata = {
  title: 'Chairtime — ให้ลูกค้าจองคิวเองผ่าน LINE',
  description:
    'ระบบจองคิวสำหรับร้านผม ร้านเล็บ ร้านนวด สปา และคลินิก ลูกค้าจองเองผ่าน LINE ได้ 24 ชั่วโมง กันคิวชนอัตโนมัติ เตือนก่อนถึงคิว เก็บประวัติลูกค้าและสะสมแต้ม ทดลองฟรี 15 วัน',
  openGraph: {
    title: 'Chairtime — ให้ลูกค้าจองคิวเองผ่าน LINE',
    description:
      'ลูกค้าเลือกบริการ ช่าง และเวลาว่างเองได้ตลอด 24 ชั่วโมง ระบบกันคิวชนให้อัตโนมัติ ทดลองฟรี 15 วัน',
    type: 'website',
  },
};

export default function Home() {
  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <ProofStrip />
        <Features />
        <Steps />
        <Pricing />
        <Faq />
      </main>
      <SiteFooter />
    </>
  );
}
