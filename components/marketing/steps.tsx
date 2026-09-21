/**
 * How a shop gets from reading this page to taking its first booking.
 *
 * Four steps because that is how many there are, and saying so is the point:
 * the fear a shop owner has about software is not the price, it is a week of
 * their evenings. Each line is something they will actually do, with the thing
 * they need to have ready named.
 *
 * This band is dark in both themes on purpose. The page above and below it is
 * a pale ivory, and a section that inverts is the cheapest way to say "this
 * is a different kind of thing" — it also puts the four numbered steps on the
 * one surface where a teal number reads as a light rather than a label. The
 * colours here are literal rather than tokens for that reason: the band does
 * not follow the theme, it sets its own.
 */
const STEPS = [
  {
    title: 'เข้าสู่ระบบด้วย LINE',
    body: 'ใช้บัญชี LINE ที่ใช้อยู่แล้ว ไม่ต้องตั้งรหัสผ่านใหม่ให้จำอีกอัน',
  },
  {
    title: 'ใส่ข้อมูลร้าน',
    body: 'ชื่อร้าน เวลาทำการ บริการที่มีพร้อมราคา และช่างในร้าน ระบบเตรียมรายการบริการมาตรฐานของร้านแต่ละประเภทไว้ให้แก้ต่อ',
  },
  {
    title: 'เชื่อม LINE ของร้าน',
    body: 'ทำตามขั้นตอนในหน้าตั้งค่า คัดลอกค่าจาก LINE มาวาง ระบบทดสอบการเชื่อมต่อให้เห็นกับตาว่าต่อติดแล้ว',
  },
  {
    title: 'ส่งลิงก์ให้ลูกค้า',
    body: 'ได้ลิงก์จองของร้านไปวางในเมนู LINE หรือโพสต์ในเพจ ลูกค้ากดจองได้ทันที',
  },
];

export function Steps() {
  return (
    <section id="วิธีใช้" className="scroll-mt-16 bg-[#14201f] text-[#f4f1ea]">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold tracking-[0.14em] text-[#5eead4] uppercase">
              สี่ขั้น
            </p>
            <h2 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              เปิดใช้งานได้ภายในวันเดียว
            </h2>
          </div>
          <p className="max-w-md text-sm leading-[1.85] text-[#a8b4b2]">
            ไม่ต้องรอทีมขายติดต่อกลับ ไม่ต้องนัดสาธิต ทำเองได้ทั้งหมดจากมือถือ
          </p>
        </div>

        <ol className="mt-11 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => {
            const last = index === STEPS.length - 1;

            return (
              <li
                key={step.title}
                className={
                  last
                    ? 'rounded-2xl border border-[#2f4a44] bg-[#16302c] p-6'
                    : 'rounded-2xl border border-[#26332f] bg-[#1b2827] p-6'
                }
              >
                <span
                  className={
                    last
                      ? 'grid size-9 place-items-center rounded-full bg-[#5eead4] text-sm font-semibold text-[#0b1f1c]'
                      : 'grid size-9 place-items-center rounded-full bg-[#0f766e] text-sm font-semibold text-white'
                  }
                >
                  {index + 1}
                </span>
                <h3 className="mt-5 text-base font-semibold text-white">{step.title}</h3>
                <p
                  className={
                    last
                      ? 'mt-2.5 text-sm leading-relaxed text-[#b6ded6]'
                      : 'mt-2.5 text-sm leading-relaxed text-[#a8b4b2]'
                  }
                >
                  {step.body}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
