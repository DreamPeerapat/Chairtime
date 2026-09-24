'use client';

/**
 * The steps a service is made of, in order.
 *
 * Most services are one step. A colour is three — apply, wait while it
 * develops, rinse — and the middle one frees the stylist for someone else
 * while the chair stays taken. That is the whole point of splitting it, so
 * the kind is named by what it does to the stylist rather than "active" /
 * "passive". Checked again on the server (lib/admin/service-segments.ts).
 */
import { formatDuration } from '@/components/booking/format';
import { MAX_SEGMENTS } from '@/lib/admin/service-segments';

export interface SegmentDraft {
  /** stable across edits, for React only — never saved */
  key: string;
  kind: 'active' | 'passive';
  durationMin: string;
  label: string;
}

let nextKey = 0;
export function newSegmentDraft(partial: Partial<Omit<SegmentDraft, 'key'>> = {}): SegmentDraft {
  nextKey += 1;
  return { key: `seg-${nextKey}`, kind: 'active', durationMin: '30', label: '', ...partial };
}

export function SegmentEditor({
  value,
  onChange,
}: {
  value: SegmentDraft[];
  onChange: (next: SegmentDraft[]) => void;
}) {
  const total = value.reduce((sum, s) => sum + (Number(s.durationMin) || 0), 0);
  const staffMin = value
    .filter((s) => s.kind === 'active')
    .reduce((sum, s) => sum + (Number(s.durationMin) || 0), 0);

  function update(key: string, patch: Partial<SegmentDraft>) {
    onChange(value.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-xs font-medium text-muted">ขั้นตอนและเวลา</legend>

      <ol className="flex flex-col gap-2">
        {value.map((segment, i) => (
          <li key={segment.key} className="grid grid-cols-[1fr_5.5rem_auto] gap-2 rounded-lg bg-surface-muted p-2">
            <label className="col-span-3 flex flex-col gap-1">
              <span className="sr-only">ชื่อขั้นตอนที่ {i + 1}</span>
              <input
                value={segment.label}
                onChange={(e) => update(segment.key, { label: e.target.value })}
                placeholder={`ขั้นตอนที่ ${i + 1} เช่น ลงสี`}
                maxLength={40}
                className={inputClass}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="sr-only">ช่างทำอะไรในขั้นตอนที่ {i + 1}</span>
              <select
                value={segment.kind}
                onChange={(e) => update(segment.key, { kind: e.target.value as SegmentDraft['kind'] })}
                disabled={i === 0}
                className={inputClass}
              >
                <option value="active">ช่างลงมือทำ</option>
                <option value="passive">รอ — ช่างว่างรับคนอื่นได้</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="sr-only">นาทีของขั้นตอนที่ {i + 1}</span>
              <input
                type="number"
                min={5}
                max={600}
                step={5}
                required
                value={segment.durationMin}
                onChange={(e) => update(segment.key, { durationMin: e.target.value })}
                className={inputClass}
              />
            </label>
            <button
              type="button"
              onClick={() => onChange(value.filter((s) => s.key !== segment.key))}
              disabled={value.length === 1}
              aria-label={`ลบขั้นตอนที่ ${i + 1}`}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-muted hover:bg-surface disabled:opacity-30"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onChange([...value, newSegmentDraft({ kind: 'passive' })])}
          disabled={value.length >= MAX_SEGMENTS}
          className="min-h-11 rounded-lg px-2 text-sm font-medium text-brand disabled:opacity-40"
        >
          + เพิ่มขั้นตอน
        </button>
        <span className="text-xs text-muted tabular-nums">
          รวม {formatDuration(total)}
          {staffMin !== total ? ` · ช่างใช้จริง ${formatDuration(staffMin)}` : ''}
        </span>
      </div>

      <p className="text-xs text-muted">
        แก้แล้วมีผลกับคิวที่จองหลังจากนี้เท่านั้น คิวที่จองไว้แล้วใช้เวลาเดิม
      </p>
    </fieldset>
  );
}

const inputClass = 'w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm disabled:opacity-60';
