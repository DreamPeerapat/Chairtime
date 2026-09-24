import { cn } from '@/lib/utils';

export const STEPS = ['บริการ', 'ช่าง', 'เวลา', 'ยืนยัน'] as const;

export function StepIndicator({ current, disabled }: { current: number; disabled: number[] }) {
  return (
    <ol className="flex items-center gap-1.5 text-xs">
      {STEPS.map((label, index) => {
        const skipped = disabled.includes(index);
        return (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5">
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-medium',
                'transition-[background-color,color,transform] duration-200',
                index === current
                  ? 'scale-110 bg-brand text-brand-contrast shadow-sm shadow-brand/30'
                  : index < current
                    ? 'bg-brand-soft text-brand-strong'
                    : 'bg-surface-muted text-muted',
                skipped && 'opacity-40',
              )}
            >
              {/* A finished step says so, rather than repeating its number —
                  but a step that was skipped (no staff to pick) was never
                  done, so it keeps its number rather than claiming a tick. */}
              {index < current && !skipped ? (
                <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
                  <path
                    d="m4.5 10.5 3.5 3.5 7.5-8"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                index + 1
              )}
            </span>
            <span
              className={cn(
                'truncate transition-colors duration-200',
                index === current
                  ? 'font-medium'
                  : index < current
                    ? 'text-muted'
                    : 'text-muted',
              )}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
