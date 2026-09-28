import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/page';

/**
 * The shell the LINE setup wizard is drawn in.
 *
 * It used to be seven identical bordered boxes, all open at once, all in the
 * same grey 12px type — so a shop halfway through could not tell where it
 * was, what was left, or why any of it mattered. Three fixes, all here:
 *
 * - The journey comes before the steps, in the order it gets built, with the
 *   current one marked. Copying a Channel Secret makes sense once you can see
 *   it leads to a booking button in a chat.
 * - A finished step collapses to its title and a tick.
 * - A locked step shows no body at all. Instructions you cannot follow yet
 *   are noise, and there were four screens of them.
 */

// The journey rail lives in its own file; re-exported so the page keeps
// importing the whole wizard from here.
export { LineJourney, type JourneyStep } from './line-journey';

/** A heading that breaks the seven steps into the three things they achieve. */
export function Phase({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 pt-2">
      <h2 className="text-sm font-semibold">{label}</h2>
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

export function Step({
  n,
  title,
  done,
  locked,
  summary,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  locked?: boolean;
  /** one line under the title: what this step gets the shop */
  summary?: string;
  children: React.ReactNode;
}) {
  const head = (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          done && 'bg-brand text-brand-contrast',
          !done && !locked && 'border border-brand text-brand',
          locked && 'border border-line text-muted',
        )}
      >
        {done ? '✓' : n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        {summary ? <span className="mt-0.5 block text-xs text-muted">{summary}</span> : null}
      </span>
      {done ? <Badge tone="brand">เสร็จแล้ว</Badge> : null}
      {locked ? <Badge>รอขั้นก่อนหน้า</Badge> : null}
    </div>
  );

  // Done: folded away, because the page should show what is left. Still
  // openable — a shop that changed its token comes back here to paste it.
  if (done) {
    return (
      <details className="overflow-hidden rounded-2xl border border-line bg-surface">
        <summary className="cursor-pointer list-none px-4 py-3.5">{head}</summary>
        <div className="flex flex-col gap-2 border-t border-line px-4 py-4 text-sm">{children}</div>
      </details>
    );
  }

  // Locked: the head only. Instructions that cannot be followed yet are what
  // made this page feel like a manual rather than a next thing to do.
  if (locked) {
    return (
      <section className="rounded-2xl border border-line bg-surface px-4 py-3.5 opacity-70">{head}</section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-brand bg-surface ring-1 ring-brand/20">
      <div className="px-4 py-3.5">{head}</div>
      <div className="flex flex-col gap-2 border-t border-line px-4 py-4 text-sm">{children}</div>
    </section>
  );
}

/** Something to copy: a URL, an id, a code. */
export function Copy({ label, value }: { label?: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label ? <p className="text-xs font-medium text-muted">{label}</p> : null}
      <code className="block rounded-lg border border-line bg-surface-muted px-3 py-2 font-mono text-xs break-all select-all">
        {value}
      </code>
    </div>
  );
}

export function NextButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="submit"
      className="ct-press w-fit rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-contrast"
    >
      {children}
    </button>
  );
}

export function GhostButton({ children }: { children: React.ReactNode }) {
  return (
    <button type="submit" className="ct-press w-fit rounded-xl border border-line px-4 py-2 text-xs">
      {children}
    </button>
  );
}

export function Banner({ tone, children }: { tone: 'ok' | 'error'; children: React.ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'bg-brand-soft text-brand'
      : 'bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300';
  return <p className={cn('rounded-xl px-4 py-3 text-sm', cls)}>{children}</p>;
}

/** The numbered instructions inside a step — console clicks, mostly. */
export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm text-muted">{children}</ol>;
}

export function Term({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}
