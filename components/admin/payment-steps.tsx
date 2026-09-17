/**
 * The four states a payment passes through, drawn as a row.
 *
 * A shop that has scanned a QR and is waiting has no other way to tell whether
 * anything is happening. Naming the steps turns "nothing on screen" into "we
 * are on step three of four", which is the difference between waiting and
 * pressing the button again.
 */
const STEPS = [
  { title: 'สร้างรายการ', caption: 'เลือกแพ็กเกจ' },
  { title: 'โอนเงิน', caption: 'สแกน QR' },
  { title: 'ตรวจสอบ', caption: 'แนบสลิป' },
  { title: 'สำเร็จ', caption: 'ต่ออายุแล้ว' },
] as const;

export function PaymentSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {STEPS.map((step, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;

        return (
          <li
            key={step.title}
            className={`flex flex-1 items-center gap-2 rounded-xl border px-3 py-2 ${
              active
                ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40'
                : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium ${
                done || active
                  ? 'bg-teal-700 text-white'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {done ? '✓' : number}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{step.title}</span>
              <span className="block truncate text-[11px] text-slate-500">{step.caption}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
