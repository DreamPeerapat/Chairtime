'use client';

import { cn } from '@/lib/utils';
import type { ServiceListItem } from '@/lib/booking/queries';
import { formatBaht, formatDuration } from './format';

export function ServiceStep({
  services,
  selected,
  onChange,
  onNext,
}: {
  services: ServiceListItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  onNext: () => void;
}) {
  const grouped = groupByCategory(services);
  const totalMin = services
    .filter((s) => selected.includes(s.id))
    .reduce((sum, s) => sum + s.durationMin, 0);
  const totalSatang = services
    .filter((s) => selected.includes(s.id))
    .reduce((sum, s) => sum + Math.round(Number(s.price) * 100), 0);

  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  // A single unnamed group needs no heading — "อื่นๆ" above the only list on
  // the screen labels nothing and reads like a category the shop forgot to fill in.
  const showCategoryHeadings = grouped.length > 1 || grouped[0]?.[0] != null;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h2 className="text-base font-semibold">เลือกบริการ</h2>

      {grouped.map(([category, items]) => (
        <section key={category ?? 'อื่นๆ'} className="flex flex-col gap-2">
          {showCategoryHeadings ? (
            <h3 className="text-xs font-medium text-muted">{category ?? 'อื่นๆ'}</h3>
          ) : null}
          <ul className="flex flex-col gap-2">
            {items.map((service) => {
              const isSelected = selected.includes(service.id);
              return (
                <li key={service.id}>
                  <button
                    type="button"
                    role="checkbox"
                    onClick={() => toggle(service.id)}
                    aria-checked={isSelected}
                    className={cn(
                      'ct-press flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left',
                      isSelected
                        ? 'border-brand bg-teal-50 dark:border-teal-500 dark:bg-teal-950/40'
                        : 'border-line hover:border-line hover:bg-slate-50 dark:hover:border-slate-700 dark:hover:bg-slate-900',
                    )}
                  >
                    {/* A tick, not just a tinted border: on a dark screen the
                        border alone is easy to miss, and picking services is
                        the one step where getting it wrong is silent. */}
                    <span
                      aria-hidden
                      className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition',
                        isSelected
                          ? 'border-brand bg-teal-600 text-white dark:border-teal-500 dark:bg-teal-500'
                          : 'border-line dark:border-slate-600',
                      )}
                    >
                      {isSelected ? (
                        <svg viewBox="0 0 20 20" fill="none" className="size-3.5">
                          <path
                            d="m4.5 10.5 3.5 3.5 7.5-8"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{service.name}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {formatDuration(service.durationMin)}
                        {service.hasPassiveSegment ? ' · มีช่วงพักระหว่างทำ' : ''}
                      </span>
                      {service.description ? (
                        <span className="mt-1 block text-xs text-slate-400">{service.description}</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {formatBaht(service.price)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="sticky bottom-0 -mx-5 mt-auto border-t border-line bg-white/95 px-5 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur dark:bg-slate-950/95">
        {/* "เลือกแล้ว 0 รายการ · 0 นาที ฿0" is three noughts telling the
            customer nothing. Before the first pick, say what to do instead. */}
        <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
          {selected.length === 0 ? (
            <span className="text-slate-400">เลือกบริการที่ต้องการ เลือกได้มากกว่าหนึ่งอย่าง</span>
          ) : (
            <>
              <span className="text-muted">
                {selected.length} รายการ · {formatDuration(totalMin)}
              </span>
              <span className="text-base font-semibold tabular-nums">
                {formatBaht(totalSatang / 100)}
              </span>
            </>
          )}
        </div>
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={onNext}
          className="w-full ct-press rounded-xl bg-brand py-3 text-sm font-medium text-brand-contrast hover:bg-brand-strong active:bg-brand-strong disabled:opacity-40"
        >
          ถัดไป
        </button>
      </div>
    </div>
  );
}

function groupByCategory(services: ServiceListItem[]): Array<[string | null, ServiceListItem[]]> {
  const map = new Map<string | null, ServiceListItem[]>();
  for (const service of services) {
    const list = map.get(service.categoryName);
    if (list) list.push(service);
    else map.set(service.categoryName, [service]);
  }
  return [...map.entries()].sort(
    (a, b) => (a[1][0]?.categoryOrder ?? 0) - (b[1][0]?.categoryOrder ?? 0),
  );
}
