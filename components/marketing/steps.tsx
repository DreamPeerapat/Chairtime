/**
 * How a shop gets from reading this page to taking its first booking.
 *
 * Four steps because that is how many there are, and saying so is the point:
 * the fear a shop owner has about software is not the price, it is a week of
 * their evenings. Each line is something they will actually do, with the thing
 * they need to have ready named.
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
    <section id="วิธีใช้" className="scroll-mt-16 border-y border-line bg-surface-muted">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            เปิดใช้งานภายในวันเดียว
          </h2>
          <p className="mt-3 text-muted">
            ไม่ต้องรอทีมขายติดต่อกลับ ไม่ต้องนัดสาธิต ทำเองได้ทั้งหมดจากมือถือ
          </p>
        </div>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="rounded-2xl border border-line bg-surface p-6">
              <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
                {index + 1}
              </span>
              <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
