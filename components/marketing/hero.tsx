import Link from 'next/link';

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
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      {/* A wash of brand colour behind the fold, and nothing that moves. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-80 bg-[radial-gradient(60%_100%_at_50%_100%,var(--brand-soft),transparent)]"
      />

      <div className="relative mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
            สำหรับร้านผม ร้านเล็บ ร้านนวด สปา และคลินิก
          </span>

          <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
            ให้ลูกค้าจองคิวเองผ่าน LINE
            <br className="hidden sm:block" /> ร้านไม่ต้องตอบแชททีละคน
          </h1>

          <p className="mt-5 text-base text-muted sm:text-lg">
            ลูกค้าเลือกบริการ ช่าง และเวลาว่างเองได้ตลอด 24 ชั่วโมง
            ระบบกันคิวชนให้อัตโนมัติ เตือนก่อนถึงคิว และเก็บประวัติลูกค้าให้ครบ
            โดยที่ร้านไม่ต้องจดสมุดอีก
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/auth/start?provider=line"
              className="ct-press w-full rounded-xl bg-brand px-6 py-3.5 text-sm font-medium text-brand-contrast hover:bg-brand-strong sm:w-auto"
            >
              เริ่มทดลองฟรี 15 วัน
            </Link>
            <Link
              href="#วิธีใช้"
              className="ct-press w-full rounded-xl border border-line bg-surface px-6 py-3.5 text-sm font-medium hover:bg-surface-muted sm:w-auto"
            >
              ดูว่าทำงานอย่างไร
            </Link>
          </div>

          <p className="mt-4 text-xs text-muted">
            ไม่ต้องผูกบัตรเครดิต · ตั้งร้านเสร็จใน 10 นาที · ยกเลิกเมื่อไรก็ได้
          </p>
        </div>
      </div>
    </section>
  );
}
