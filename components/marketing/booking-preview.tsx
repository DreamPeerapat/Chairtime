/**
 * The product, drawn rather than described.
 *
 * A shop owner deciding whether this is for them wants to see what their
 * customer will see. A screenshot would be stale the week after it was taken
 * and unreadable at 320px; this is the real booking step in markup, so it
 * follows the palette, the fonts and dark mode by itself.
 *
 * Decorative: everything here is a static picture of a screen the customer
 * gets elsewhere, so it is hidden from screen readers and holds no controls.
 * The copy beside it in hero.tsx is what carries the claim.
 */
const SLOTS = ['10:00', '10:30', '11:00', '13:00', '13:30', '15:00'];
const DAYS = [
  { weekday: 'พฤ', date: '18' },
  { weekday: 'ศ', date: '19' },
  { weekday: 'ส', date: '20' },
  { weekday: 'อา', date: '21' },
];

export function BookingPreview() {
  return (
    <div aria-hidden className="ct-phone relative mx-auto w-full max-w-[320px] select-none">
      {/* The tinted plate behind the phone: it stops the device floating on
          the page unattached to anything. */}
      <div className="absolute inset-x-[-14%] top-10 bottom-16 rounded-[2.5rem] bg-brand-soft" />

      <div className="ct-phone-body relative">
        {/* The far side of the case. Sitting twelve pixels back, it is what
            the turn exposes down the right edge. */}
        <div className="ct-phone-back absolute inset-0 rounded-[2.4rem] bg-[#0b1412]" />

        <div className="relative rounded-[2.4rem] bg-[#14201f] p-2.5 shadow-[0_46px_80px_-44px_rgb(20_32_31/0.65)] ring-1 ring-white/10">
          <div className="flex h-[36rem] flex-col overflow-hidden rounded-[1.9rem] bg-surface">
          <div className="shrink-0 border-b border-line px-4 pt-4 pb-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">ร้านสวยสตูดิโอ</p>
                <p className="mt-0.5 truncate text-[11px] text-muted">นิมมานเหมินท์ ซอย 7</p>
              </div>
              <span className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[10px] text-muted">
                โทรหาร้าน
              </span>
            </div>

            <div className="mt-3.5 flex items-center gap-1.5">
              <span className="h-1 flex-1 rounded-full bg-brand" />
              <span className="h-1 flex-1 rounded-full bg-brand" />
              <span className="h-1 flex-1 rounded-full bg-brand" />
              <span className="h-1 flex-1 rounded-full bg-line" />
            </div>
            <p className="mt-2 text-[11px] text-muted">ขั้นที่ 3 จาก 4 · เลือกเวลา</p>
          </div>

          <div className="flex flex-1 flex-col gap-3 px-4 py-4">
            <div className="flex gap-1.5">
              {DAYS.map((day, index) => (
                <div
                  key={day.date}
                  className={
                    index === 1
                      ? 'flex-1 rounded-xl bg-brand py-2 text-center text-brand-contrast'
                      : 'flex-1 rounded-xl border border-line py-2 text-center'
                  }
                >
                  <p className={index === 1 ? 'text-[10px] opacity-80' : 'text-[10px] text-muted'}>
                    {day.weekday}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">{day.date}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {SLOTS.map((slot) => (
                <div
                  key={slot}
                  className={
                    slot === '13:00'
                      ? 'rounded-lg border-[1.5px] border-brand bg-brand-soft py-2.5 text-center text-xs font-semibold text-brand-strong'
                      : 'rounded-lg border border-line py-2.5 text-center text-xs'
                  }
                >
                  {slot}
                </div>
              ))}
            </div>

            <div className="mt-auto rounded-2xl border border-line bg-surface-muted px-3.5 py-3">
              <p className="text-[10px] text-muted">สรุปคิว</p>
              <div className="mt-1.5 flex items-baseline justify-between gap-2 text-xs">
                <span>สระไดร์ + ทำสีผม</span>
                <span className="font-semibold">1,450 ฿</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-2 text-[11px] text-muted">
                <span>ช่างแนน · ศุกร์ 19 · 13:00</span>
                <span>2 ชม. 15 น.</span>
              </div>
            </div>

            <div className="rounded-xl bg-brand py-3 text-center text-[13px] font-medium text-brand-contrast">
              ยืนยันการจอง
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
