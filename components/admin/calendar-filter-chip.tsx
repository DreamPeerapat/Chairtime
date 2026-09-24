import { cn } from '@/lib/utils';

/** One staff filter above the day calendar, with its colour and booking count. */
export function FilterChip({
  active,
  onClick,
  label,
  color,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string | undefined;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition',
        active
          ? 'border-brand bg-brand text-brand-contrast'
          : 'border-line hover:border-muted',
      )}
    >
      {color ? (
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden />
      ) : null}
      {label}
      {typeof count === 'number' ? (
        <span className={active ? 'opacity-70' : 'text-muted'}>{count}</span>
      ) : null}
    </button>
  );
}
