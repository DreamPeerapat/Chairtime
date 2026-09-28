import Image from 'next/image';
import { cn } from '@/lib/utils';
import { initialOf } from './format';

/**
 * One person: the tap target and their work, in the same box.
 *
 * The photos used to sit under the card, edge to edge, which read as a strip
 * belonging to nobody — or worse, to the person listed below. They belong
 * inside, but a button cannot contain another button: the browser drops the
 * inner one. So the selection button stretches its own hit area across the
 * whole card with `after:inset-0`, and the thumbnails sit above it on z-10.
 *
 * `ct-press` goes on the card rather than the button because its :active
 * transform would make the button the containing block, shrinking the
 * stretched overlay away from under the finger mid-press.
 */
export function Card({
  active,
  onSelect,
  label,
  children,
  below,
}: {
  active: boolean;
  onSelect: () => void;
  label?: string;
  children: React.ReactNode;
  below?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'ct-press relative overflow-hidden rounded-2xl border',
        active
          ? 'border-brand bg-brand-soft'
          : 'border-line hover:border-line',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        aria-label={label}
        className="flex w-full items-center gap-3 px-4 py-3 text-left after:absolute after:inset-0"
      >
        {children}
      </button>
      {below}
    </div>
  );
}

/** Their face if the shop uploaded one, their initial if not. */
export function Avatar({
  name,
  photoUrl,
  anyone,
}: {
  name: string;
  photoUrl: string | null;
  anyone?: boolean;
}) {
  if (photoUrl) {
    return (
      <span className="relative size-11 shrink-0 overflow-hidden rounded-full bg-surface-muted">
        <Image src={photoUrl} alt="" fill sizes="44px" className="object-cover" />
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full text-sm font-medium',
        anyone
          ? 'bg-surface-muted text-muted'
          : 'bg-brand-soft text-brand-strong',
      )}
    >
      {anyone ? '✨' : initialOf(name)}
    </span>
  );
}

export function Text({ name, hint }: { name: string; hint: string | null }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm font-medium">{name}</span>
      {hint ? <span className="mt-0.5 block text-xs text-muted">{hint}</span> : null}
    </span>
  );
}

export function Tick({ shown }: { shown: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-full border text-[11px] leading-none',
        shown
          ? 'border-brand bg-brand text-brand-contrast'
          : 'border-line text-transparent',
      )}
    >
      ✓
    </span>
  );
}
