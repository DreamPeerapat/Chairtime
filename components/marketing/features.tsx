/**
 * What the product does, one card each.
 *
 * Each card is a problem a shop already has, then the thing that answers it —
 * in that order, because a shop reading this does not know what "availability
 * engine" means but knows exactly what it feels like to double-book a chair.
 */
const FEATURES = [
  {
    title: 'จองคิวได้ตลอด 24 ชั่วโมง',
    body: 'ลูกค้ากดจองจาก LINE เองได้ตอนตีสอง เลือกบริการ ช่าง และเวลาว่างจริง ร้านไม่ต้องตื่นมาตอบ',
  },
  {
    title: 'คิวไม่ชนกัน ไม่ต้องคอยเช็ค',
    body: 'ระบบรู้ว่าช่างคนไหนว่าง เก้าอี้ตัวไหนว่าง และบริการไหนต้องพักระหว่างทำ เช่นย้อมผมที่ต้องรอสีติด ช่างจึงรับคิวอื่นคั่นได้',
  },
  {
    title: 'เตือนก่อนถึงคิว ลดคิวหลุด',
    body: 'ส่งเตือนอัตโนมัติผ่าน LINE ก่อนถึงเวลา ลูกค้าที่ลืมคือรายได้ที่หายไปทั้งช่อง',
  },
  {
    title: 'รู้จักลูกค้าทุกคน',
    body: 'ประวัติการมาใช้บริการ ยอดใช้จ่าย และช่างที่ชอบ อยู่ในที่เดียว ลูกค้าเก่ากลับมาแล้วร้านจำได้',
  },
  {
    title: 'โชว์ผลงานให้ลูกค้าเลือก',
    body: 'อัปรูปงานจริงของร้านและของช่างแต่ละคน ลูกค้าเลือกจากฝีมือที่เห็น ไม่ใช่จากชื่อที่ไม่รู้จัก',
  },
  {
    title: 'รู้ว่าเดือนนี้ได้เท่าไร',
    body: 'สรุปยอดขาย จำนวนคิว และรายได้ต่อช่าง โดยไม่ต้องนั่งรวมสมุดตอนสิ้นเดือน',
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          สิ่งที่ร้านได้ตั้งแต่วันแรก
        </h2>
        <p className="mt-3 text-muted">
          ไม่ต้องเรียนรู้อะไรใหม่ ลูกค้าใช้ LINE ที่มีอยู่แล้ว ร้านเปิดหลังบ้านจากมือถือได้เหมือนกัน
        </p>
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="rounded-2xl border border-line bg-surface p-6 transition hover:border-brand/40"
          >
            <h3 className="text-base font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
