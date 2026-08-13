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

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">เลือกบริการ</h2>

      {grouped.map(([category, items]) => (
        <section key={category ?? 'อื่นๆ'} className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-slate-500">{category ?? 'อื่นๆ'}</h3>
          <ul className="flex flex-col gap-2">
            {items.map((service) => {
              const isSelected = selected.includes(service.id);
              return (
                <li key={service.id}>
                  <button
                    type="button"
                    onClick={() => toggle(service.id)}
                    aria-pressed={isSelected}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition',
                      isSelected
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-800',
                    )}
                  >
                    <span className="flex-1">
                      <span className="block text-sm font-medium">{service.name}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">
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

      <div className="sticky bottom-0 -mx-5 border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mb-2 flex justify-between text-sm">
          <span className="text-slate-500">
            เลือกแล้ว {selected.length} รายการ · {formatDuration(totalMin)}
          </span>
          <span className="font-medium tabular-nums">{formatBaht(totalSatang / 100)}</span>
        </div>
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={onNext}
          className="w-full rounded-xl bg-teal-700 py-3 text-sm font-medium text-white disabled:opacity-40"
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
