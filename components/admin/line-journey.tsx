import { cn } from '@/lib/utils';

/**
 * The rail across the top of the LINE wizard: every step in the order it gets
 * built, the current one marked, and where it all ends up. Split out of
 * line-wizard.tsx for the 200-line rule in CLAUDE.md.
 */

export interface JourneyStep {
  n: number;
  /** a few words, as the shop would say it — not the step's full title */
  label: string;
  /**
   * null when the step happens somewhere we cannot see: the Rich menu is
   * built in LINE's own console, and rule 6 in CLAUDE.md keeps us from asking
   * LINE about it from a page render. Those steps stay on the rail and out of
   * the count, rather than the count claiming to know.
   */
  done: boolean | null;
}

export function LineJourney({ steps }: { steps: JourneyStep[] }) {
  const doneCount = steps.filter((s) => s.done === true).length;
  const checkable = steps.filter((s) => s.done !== null).length;
  const current = steps.find((s) => s.done !== true)?.n ?? null;
  const percent = checkable > 0 ? Math.round((doneCount / checkable) * 100) : 0;

  return (
    <section className="rounded-2xl border border-line bg-surface-muted px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">เส้นทางการเชื่อม LINE</h2>
        <p className="text-xs text-muted">
          ทำแล้ว {doneCount} จาก {checkable} ขั้น
        </p>
      </div>

      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${percent}%` }} />
      </div>

      <ol className="mt-3.5 flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {steps.map((step, i) => (
          <li key={step.n} className="flex items-center gap-1.5">
            <span
              className={cn(
                'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs whitespace-nowrap',
                step.done === true && 'bg-brand-soft font-medium text-brand',
                step.done !== true && step.n === current && 'bg-brand font-medium text-brand-contrast',
                step.done !== true && step.n !== current && 'text-muted',
              )}
            >
              <span aria-hidden>{step.done === true ? '✓' : step.n}</span>
              {step.label}
            </span>
            {i < steps.length - 1 ? (
              <span aria-hidden className="text-muted">
                ›
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      <p className="mt-3 text-xs text-muted">
        ปลายทาง: ลูกค้ากดปุ่มใต้ห้องแชท LINE ของร้าน → เลือกบริการและเวลาเอง → ร้านได้ข้อความแจ้งทันที
        และลูกค้าได้คำยืนยันกับเตือนนัดเองโดยร้านไม่ต้องพิมพ์
      </p>
    </section>
  );
}
