import { cn } from '@/lib/utils';

/** One figure with its label. Four of these in a row is the summary of anything. */
export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'brand' | 'warn';
}) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          'mt-1.5 font-display text-2xl leading-none font-semibold tabular-nums',
          tone === 'brand' && 'text-brand',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
        )}
      >
        {value}
      </dd>
      {hint ? <p className="mt-1.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
