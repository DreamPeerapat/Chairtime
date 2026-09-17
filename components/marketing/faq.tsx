/**
 * The questions that decide whether a shop signs up.
 *
 * Built from `<details>` so it opens and closes without a line of JavaScript,
 * and so the answers are in the page for anyone searching for them.
 *
 * Every answer here is true today. An FAQ that promises what the product will
 * do next quarter is the fastest way to lose the shop that believed it.
 */
const QUESTIONS = [
  {
    q: 'ต้องให้ลูกค้าโหลดแอปใหม่ไหม',
    a: 'ไม่ต้อง ลูกค้าจองผ่าน LINE ที่มีอยู่แล้ว หรือเปิดลิงก์ร้านในเบราว์เซอร์ก็จองได้เหมือนกัน',
  },
  {
    q: 'ร้านมีหลายช่าง หลายเก้าอี้ ระบบจัดให้ได้ไหม',
    a: 'ได้ ระบบดูทั้งช่างและเก้าอี้พร้อมกัน ช่างที่ทำบริการนั้นไม่ได้จะไม่ถูกเสนอให้ลูกค้าเลือก และบริการที่มีช่วงพักระหว่างทำ เช่นย้อมผมที่ต้องรอสีติด ช่างจะรับคิวอื่นคั่นได้ในช่วงนั้น',
  },
  {
    q: 'ถ้าลูกค้าโทรมาจองเอง ร้านลงคิวให้ได้ไหม',
    a: 'ได้ หลังบ้านลงคิวแทนลูกค้าได้ทุกเมื่อ ใช้ปฏิทินเดียวกัน คิวจึงไม่ชนกับที่ลูกค้าจองเอง',
  },
  {
    q: 'ข้อมูลลูกค้าเป็นของใคร',
    a: 'ของร้าน ทุกร้านเห็นเฉพาะข้อมูลของตัวเอง ระบบแยกข้อมูลกันที่ชั้นฐานข้อมูล ไม่ใช่แค่ที่หน้าจอ',
  },
  {
    q: 'จ่ายเงินอย่างไร',
    a: 'สแกน QR พร้อมเพย์ที่ระบบสร้างให้พร้อมยอด แล้วแนบสลิป ระบบตรวจกับธนาคารและต่ออายุให้ พร้อมส่งใบเสร็จเข้าอีเมลและ LINE ของร้าน',
  },
  {
    q: 'ยกเลิกแล้วข้อมูลหายไหม',
    a: 'ไม่หายทันที ร้านที่หมดอายุจะรับจองใหม่ไม่ได้ แต่คิวที่จองไว้แล้วและข้อมูลลูกค้ายังอยู่ กลับมาต่ออายุเมื่อไรก็ใช้ต่อได้',
  },
];

export function Faq() {
  return (
    <section className="border-t border-line bg-surface-muted">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
        <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
          คำถามที่ถามกันบ่อย
        </h2>

        <div className="mt-8 flex flex-col gap-3">
          {QUESTIONS.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-line bg-surface px-5 py-4 open:border-brand/40"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium">
                {item.q}
                <span
                  aria-hidden
                  className="shrink-0 text-muted transition group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
