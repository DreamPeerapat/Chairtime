import type { BillingTerm } from '@/lib/billing/catalog';

/**
 * Monthly or yearly, level with the word "แพ็กเกจ" so it reads as a setting
 * on the prices below it. It carries what the year saves, which is the only
 * reason anybody would touch it.
 */
export function TermSwitch({
  term,
  onSelect,
  saving,
}: {
  term: BillingTerm;
  onSelect: (term: BillingTerm) => void;
  /** percent off the twelve-month price, when there is one */
  saving: number | null;
}) {
  return (
    <div
      role="group"
      aria-label="รอบการชำระ"
      className="flex rounded-full border border-line p-0.5 text-xs"
    >
      <Segment selected={term === 'monthly'} onSelect={() => onSelect('monthly')}>
        รายเดือน
      </Segment>
      <Segment selected={term === 'yearly'} onSelect={() => onSelect('yearly')}>
        รายปี{saving ? ` · ประหยัด ${saving}%` : ''}
      </Segment>
    </div>
  );
}

function Segment({
  selected,
  onSelect,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-full px-3 py-1.5 whitespace-nowrap transition ${
        selected ? 'bg-brand font-medium text-brand-contrast' : 'text-muted'
      }`}
    >
      {children}
    </button>
  );
}
