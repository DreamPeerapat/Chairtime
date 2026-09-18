'use client';

/**
 * The pieces the booking-policy form is drawn from, and the two functions
 * that turn its numbers into Thai. Split out of booking-policy-form.tsx for
 * the 200-line rule in CLAUDE.md.
 */

/** One rule: its name, the choices, and what the chosen one means. */
export function Field({
  label,
  explain,
  children,
}: {
  label: string;
  explain: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="flex flex-col gap-2 py-4 first:pt-0">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
      <p className="text-xs text-muted">{explain}</p>
    </fieldset>
  );
}

/**
 * The chips for one rule.
 *
 * A value the shop already has is always among them, even when it is not one
 * of the offered ones: the seeded shops run on 45 days, and a row of chips
 * with nothing selected reads as "unsaved" rather than "45, which we did not
 * think to offer".
 */
export function Choices({
  options,
  value,
  onSelect,
  say,
}: {
  options: number[];
  value: number;
  onSelect: (n: number) => void;
  say: (n: number) => string;
}) {
  const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);

  return (
    <>
      {all.map((n) => (
        <Chip key={n} selected={value === n} onSelect={() => onSelect(n)} label={say(n)} />
      ))}
    </>
  );
}

export function Chip({
  label,
  selected,
  onSelect,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
        selected
          ? 'border-brand bg-brand-soft font-medium text-brand'
          : 'border-line text-muted hover:bg-surface-muted'
      }`}
    >
      {label}
    </button>
  );
}

/** Minutes, said the way a shop says them out loud. */
export function saySpan(min: number): string {
  if (min === 0) return 'ทันที';
  if (min < 60) return `${min} นาที`;
  if (min % 1440 === 0) return `${min / 1440} วัน`;
  if (min % 60 === 0) return `${min / 60} ชั่วโมง`;
  return `${Math.floor(min / 60)} ชม. ${min % 60} นาที`;
}

/** The first three start times of a 10:00 opening, so the step is visible. */
export function slotExample(step: number): string {
  return [0, 1, 2]
    .map((i) => {
      const min = 10 * 60 + step * i;
      return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
    })
    .join(', ');
}
