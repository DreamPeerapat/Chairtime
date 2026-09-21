/**
 * What the product does, one card each.
 *
 * Each card is a problem a shop already has, then the thing that answers it —
 * in that order, because a shop reading this does not know what "availability
 * engine" means but knows exactly what it feels like to double-book a chair.
 *
 * The icon is the only ornament, and it earns its place by making the grid
 * scannable: six paragraphs of Thai at the same weight is a wall, and a shop
 * owner reading on a phone gives this section about four seconds. Each is an
 * outline glyph in brand colour on a soft tile — drawn inline rather than
 * pulled from an icon package, which would be a dependency for six shapes.
 */
const FEATURES = [
  {
    title: 'จองคิวได้ตลอด 24 ชั่วโมง',
    body: 'ลูกค้ากดจองจาก LINE เองได้ตอนตีสอง เลือกบริการ ช่าง และเวลาว่างจริง ร้านไม่ต้องตื่นมาตอบ',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  {
    title: 'คิวไม่ชนกัน ไม่ต้องคอยเช็ค',
    body: 'ระบบรู้ว่าช่างคนไหนว่าง เก้าอี้ตัวไหนว่าง และบริการไหนต้องพักระหว่างทำ เช่นย้อมผมที่ต้องรอสีติด ช่างจึงรับคิวอื่นคั่นได้',
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M8 3v4" />
        <path d="M16 3v4" />
        <path d="m9 14 2 2 4-4" />
      </>
    ),
  },
  {
    title: 'เตือนก่อนถึงคิว ลดคิวหลุด',
    body: 'ส่งเตือนอัตโนมัติผ่าน LINE ก่อนถึงเวลา ลูกค้าที่ลืมคือรายได้ที่หายไปทั้งช่อง',
    icon: (
      <>
        <path d="M18 8a6 6 0 1 0-12 0c0 6-3 7-3 7h18s-3-1-3-7" />
        <path d="M10.5 20a2 2 0 0 0 3 0" />
      </>
    ),
  },
  {
    title: 'รู้จักลูกค้าทุกคน',
    body: 'ประวัติการมาใช้บริการ ยอดใช้จ่าย และช่างที่ชอบ อยู่ในที่เดียว ลูกค้าเก่ากลับมาแล้วร้านจำได้',
    icon: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M3 20a6 6 0 0 1 12 0" />
        <path d="M16 5.5a3 3 0 0 1 0 5.6" />
        <path d="M18 14.2A5.6 5.6 0 0 1 21 20" />
      </>
    ),
  },
  {
    title: 'โชว์ผลงานให้ลูกค้าเลือก',
    body: 'อัปรูปงานจริงของร้านและของช่างแต่ละคน ลูกค้าเลือกจากฝีมือที่เห็น ไม่ใช่จากชื่อที่ไม่รู้จัก',
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="8.5" cy="9.5" r="1.6" />
        <path d="m4 17 5-5 4 4 2.5-2.5L20 17" />
      </>
    ),
  },
  {
    title: 'รู้ว่าเดือนนี้ได้เท่าไร',
    body: 'สรุปยอดขาย จำนวนคิว และรายได้ต่อช่าง โดยไม่ต้องนั่งรวมสมุดตอนสิ้นเดือน',
    icon: (
      <>
        <path d="M4 20V10" />
        <path d="M10 20V4" />
        <path d="M16 20v-7" />
        <path d="M22 20H2" />
      </>
    ),
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-accent uppercase">
            สิ่งที่ร้านได้
          </p>
          <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">ได้ตั้งแต่วันแรกที่เปิดใช้</h2>
        </div>
        <p className="max-w-md text-sm leading-[1.85] text-muted">
          ไม่ต้องเรียนรู้อะไรใหม่ ลูกค้าใช้ LINE ที่มีอยู่แล้ว ร้านเปิดหลังบ้านจากมือถือได้เหมือนกัน
        </p>
      </div>

      <div className="ct-stagger mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="ct-reveal ct-lift rounded-2xl border border-line bg-surface p-6 shadow-card hover:border-brand/40"
          >
            <span className="ct-lift-mark grid size-11 place-items-center rounded-xl bg-brand-soft">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5 text-brand"
              >
                {feature.icon}
              </svg>
            </span>
            <h3 className="mt-5 text-base font-semibold">{feature.title}</h3>
            <p className="mt-2.5 text-sm leading-relaxed text-muted">{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
