/**
 * Four facts, across the page, straight after the fold.
 *
 * Not testimonials and not numbers: there is one shop on this product today
 * and inventing "ร้านกว่า 200 แห่งไว้วางใจ" would be a lie a shop finds out
 * about on day two. Every line here is something the software does, which is
 * the only social proof available and, for a shop comparing tools, the part
 * they were going to check anyway.
 */
const FACTS = [
  { headline: 'ไม่ต้องโหลดแอปใหม่', detail: 'ลูกค้าจองจาก LINE ที่มีอยู่แล้ว' },
  { headline: 'กันคิวชนอัตโนมัติ', detail: 'ดูทั้งช่างและเก้าอี้พร้อมกัน' },
  { headline: 'รองรับหลายสาขา', detail: 'แต่ละสาขาแยกข้อมูลจากกัน' },
  { headline: 'ข้อมูลเป็นของร้าน', detail: 'แยกกันที่ชั้นฐานข้อมูล' },
];

export function ProofStrip() {
  return (
    <section className="border-b border-line bg-surface">
      <div className="ct-stagger mx-auto grid max-w-6xl gap-x-8 gap-y-7 px-5 py-8 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-line">
        {FACTS.map((fact, index) => (
          <div key={fact.headline} className={index === 0 ? 'ct-reveal lg:pr-8' : 'ct-reveal lg:px-8 lg:last:pr-0'}>
            <p className="text-lg font-semibold text-brand">{fact.headline}</p>
            <p className="mt-1 text-sm text-muted">{fact.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
