import { cn } from '@/lib/utils';

/**
 * The shapes every screen is built from.
 *
 * Before this each page invented its own: a heading was `text-lg` here and
 * `text-base` there, a list was a stack of separately bordered boxes on one
 * page and a bare `<ul>` on the next, and nothing had a subtitle explaining
 * what the page was for. The result read as a wall of identical grey rows —
 * technically consistent, impossible to scan.
 *
 * Four ideas, and they are the whole system:
 *
 * - A page states what it is and what it is for, once, at the top.
 * - Related things sit inside one card, divided, rather than in a pile of
 *   separate cards. One border around a group reads faster than eight.
 * - A row has a primary line and a quiet second line, with the number on the
 *   right. The eye then has a column to run down instead of a paragraph.
 * - An empty screen explains itself and offers the action that fills it.
 */

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  /** one line: what this page is for, or the state it is in */
  description?: React.ReactNode;
  /** the primary action for the page, top right where it stays put */
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-prose text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

/** The page's own vertical rhythm, so no page has to guess its gap. */
export function PageBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-5', className)}>{children}</div>;
}

export function Card({
  title,
  description,
  action,
  children,
  padded = true,
  className,
}: {
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
  /** false when the card holds its own divided rows, which bring their own padding */
  padded?: boolean;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-2xl border border-line bg-surface', className)}>
      {title || action ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-semibold">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={padded ? 'p-4' : undefined}>{children}</div>
    </section>
  );
}

/** Rows inside a card: one border around the group, hairlines between. */
export function Rows({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-line">{children}</ul>;
}

export function Row({
  title,
  meta,
  value,
  valueMeta,
  href,
  onClickAction,
  children,
}: {
  title: React.ReactNode;
  /** the quiet second line — times, counts, whatever the row is about */
  meta?: React.ReactNode;
  /** the number, right-aligned, where the eye can run down a column */
  value?: React.ReactNode;
  valueMeta?: React.ReactNode;
  href?: string;
  onClickAction?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        {meta ? <div className="mt-0.5 text-xs text-muted">{meta}</div> : null}
        {children}
      </div>
      {value !== undefined || valueMeta !== undefined ? (
        <div className="shrink-0 text-right">
          {value !== undefined ? <div className="text-sm font-medium tabular-nums">{value}</div> : null}
          {valueMeta !== undefined ? <div className="text-xs text-muted">{valueMeta}</div> : null}
        </div>
      ) : null}
      {onClickAction}
    </>
  );

  const shell = 'flex items-center gap-4 px-4 py-3.5';

  return (
    <li>
      {href ? (
        <a href={href} className={cn(shell, 'transition hover:bg-surface-muted')}>
          {body}
        </a>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </li>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

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
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums',
          tone === 'brand' && 'text-brand',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
        )}
      >
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

const TONES = {
  brand: 'bg-brand-soft text-brand',
  neutral: 'bg-surface-muted text-muted',
  warn: 'bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  danger: 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300',
} as const;

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONES;
}) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap',
        TONES[tone],
      )}
    >
      {children}
    </span>
  );
}
