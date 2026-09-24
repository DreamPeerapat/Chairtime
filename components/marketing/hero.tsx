import Link from 'next/link';
import { BookingPreview } from './booking-preview';

/**
 * The first screen.
 *
 * It answers the three questions a shop owner has in the first five seconds:
 * what is this, what does it do for me, and what does it cost to find out.
 * The old page answered none of them — it said the product's name and offered
 * a login box.
 *
 * The claim is deliberately narrow. "จองคิวผ่าน LINE" is what a salon owner
 * already understands, and it is the thing they can picture their own
 * customers doing tonight; "แพลตฟอร์มบริหารร้าน" is what a brochure says.
 *
 * Two columns from `lg` up, with the phone carrying the proof. Centred text
 * over a full-width column was symmetrical and said nothing — a picture of
 * the screen the customer actually sees does more than another paragraph.
 * Below `lg` the phone drops under the copy rather than disappearing: it is
 * the reason a shop keeps reading.
 */
const PROMISES = ['ไม่ต้องผูกบัตรเครดิต', 'ตั้งร้านเสร็จใน 10 นาที', 'ยกเลิกเมื่อไรก็ได้'];

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      {/* A wash of brand colour behind the fold. It drifts, slowly — it carries
          no text, so nothing being read moves. */}
      <div
        aria-hidden
        className="ct-drift pointer-events-none absolute -top-56 -right-40 h-[44rem] w-[44rem] rounded-full bg-[radial-gradient(closest-side,var(--brand-soft),transparent)]"
      />

      <div className="relative mx-auto grid max-w-6xl items-start gap-14 px-5 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_26rem] lg:gap-16">
        <div className="lg:pt-6">
          <h1 className="ct-intro-1 text-4xl leading-[1.2] font-semibold sm:text-5xl lg:text-[3.4rem]">
            ให้ลูกค้าจองคิวเอง
            <br className="hidden sm:block" /> ผ่าน LINE
          </h1>

          <p className="ct-intro-2 mt-6 max-w-xl text-base leading-[1.85] text-muted sm:text-lg">
            ร้านไม่ต้องตอบแชททีละคน ลูกค้าเลือกบริการ ช่าง และเวลาว่างเองได้ตลอด 24 ชั่วโมง
            ระบบกันคิวชนให้อัตโนมัติ เตือนก่อนถึงคิว และเก็บประวัติลูกค้าไว้ให้ครบ
          </p>

          <div className="ct-intro-3 mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/auth/start?provider=line"
              className="ct-press inline-flex w-full items-center justify-center gap-2.5 rounded-2xl bg-brand px-7 py-4 text-sm font-medium text-brand-contrast shadow-raised hover:bg-brand-strong sm:w-auto"
            >
              เริ่มทดลองฟรี 15 วัน
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
                <path d="M5 12h13" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </Link>
            <Link
              href="#วิธีใช้"
              className="ct-press inline-flex w-full items-center justify-center rounded-2xl border border-line bg-surface px-7 py-4 text-sm font-medium hover:bg-surface-muted sm:w-auto"
            >
              ดูว่าทำงานอย่างไร
            </Link>
          </div>

          <ul className="ct-intro-4 mt-7 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
            {PROMISES.map((promise) => (
              <li key={promise} className="flex items-center gap-2">
                <svg
                  aria-hidden
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3.5 text-brand"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {promise}
              </li>
            ))}
          </ul>
        </div>

        <div className="ct-intro-5">
          <BookingPreview />
        </div>
      </div>
    </section>
  );
}
