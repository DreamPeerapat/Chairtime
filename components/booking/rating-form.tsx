'use client';

import { useState, useTransition } from 'react';
import { cn } from '@/lib/utils';
import { submitFeedback } from '@/lib/feedback/actions';

/**
 * Five stars and an optional line of text.
 *
 * The stars are real radio inputs rather than clickable spans: this is the
 * one control on the page a customer with a screen reader still has to be
 * able to operate, and a group of radios is a thing every assistive
 * technology already knows how to drive. The star is the label.
 *
 * The comment is optional on purpose. Most people will tap a number and
 * leave; demanding a sentence turns a two-second answer into a task, and the
 * number is the part the shop can actually act on.
 */
const LABELS = ['แย่มาก', 'ควรปรับปรุง', 'พอใช้', 'ดี', 'ดีมาก'];

export function RatingForm({
  tenantSlug,
  code,
  existing,
  staffName,
}: {
  tenantSlug: string;
  code: string;
  /** what they said last time, when they are here to change it */
  existing: { score: number; staffScore: number | null; comment: string | null } | null;
  /**
   * Who served them, when the booking named somebody.
   *
   * The question says "ผู้ให้บริการ" whatever the trade — one wording for
   * every shop, so a customer who books a salon and a massage shop is asked
   * the same question both times and the scores mean the same thing. The
   * shop's own word for the job (ช่างผม, หมอนวด) is right on its own
   * screens; here it would make every shop's ratings a slightly different
   * measurement.
   *
   * Null when nobody was assigned — at a shop that books rooms rather than
   * people there is no second question at all, rather than a generic one
   * nobody can answer.
   */
  staffName: string | null;
}) {
  const [score, setScore] = useState(existing?.score ?? 0);
  const [staffScore, setStaffScore] = useState(existing?.staffScore ?? 0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <div className="rounded-2xl border border-brand/30 bg-brand-soft px-5 py-6 text-center">
        <p className="font-medium text-brand-strong">ขอบคุณสำหรับคะแนนค่ะ</p>
        <p className="mt-1 text-sm text-muted">ร้านได้รับความเห็นของคุณแล้ว</p>
      </div>
    );
  }

  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          const result = await submitFeedback(formData);
          if (result.ok) setDone(true);
          else setError(result.error);
        })
      }
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5"
    >
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <input type="hidden" name="code" value={code} />

      <div>
        <h2 className="text-base font-semibold">
          {existing ? 'แก้ไขคะแนนของคุณ' : 'ใช้บริการเป็นอย่างไรบ้าง'}
        </h2>
        <p className="mt-1 text-sm text-muted">ให้คะแนนร้านเพื่อช่วยให้ร้านปรับปรุงได้ตรงจุด</p>
      </div>

      <Stars
        name="score"
        legend="คะแนนความพึงพอใจโดยรวม"
        value={score}
        onPick={setScore}
        required
        showWords
      />

      {staffName ? (
        <Stars
          name="staffScore"
          legend="ให้คะแนนผู้ให้บริการ"
          caption={`ผู้ให้บริการ: ${staffName}`}
          value={staffScore}
          onPick={setStaffScore}
        />
      ) : null}

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-muted">
          อยากบอกอะไรเพิ่มไหม (ไม่บังคับ)
        </span>
        <textarea
          name="comment"
          rows={3}
          maxLength={500}
          defaultValue={existing?.comment ?? ''}
          placeholder="เช่น ช่างใจเย็นมาก อธิบายดี"
          className="w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm"
        />
        <span className="text-xs text-muted">ความเห็นนี้จะแสดงบนหน้าร้านให้ลูกค้าคนอื่นเห็น</span>
      </label>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || score === 0}
        className="ct-press rounded-xl bg-brand py-3 text-sm font-medium text-brand-contrast disabled:opacity-40"
      >
        {pending ? 'กำลังส่ง…' : 'ส่งคะแนน'}
      </button>
    </form>
  );
}

/**
 * One row of five stars.
 *
 * Real radio inputs, not clickable spans: a rating is the only control on
 * this page a customer has to be able to operate with a screen reader, and a
 * radio group is a thing every assistive technology already drives. The star
 * is the label for its own input.
 *
 * The word under each star is only shown on the overall score — repeating
 * แย่มาก…ดีมาก under a second row doubles the reading for no extra meaning.
 */
function Stars({
  name,
  legend,
  caption,
  value,
  onPick,
  required = false,
  showWords = false,
}: {
  name: string;
  legend: string;
  caption?: string;
  value: number;
  onPick: (value: number) => void;
  required?: boolean;
  showWords?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={showWords ? 'sr-only' : 'text-sm font-medium'}>{legend}</legend>
      {caption ? <p className="text-xs text-muted">{caption}</p> : null}
      <div className="flex justify-between gap-1">
        {LABELS.map((label, index) => {
          const starValue = index + 1;
          const active = value >= starValue;
          return (
            <label
              key={starValue}
              className="ct-press flex flex-1 cursor-pointer flex-col items-center gap-1.5 rounded-xl py-2 hover:bg-surface-muted"
            >
              <input
                type="radio"
                name={name}
                value={starValue}
                required={required}
                checked={value === starValue}
                onChange={() => onPick(starValue)}
                className="sr-only"
              />
              <span className="sr-only">{`${starValue} คะแนน — ${label}`}</span>
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className={cn('size-8', active ? 'text-amber-400' : 'text-line')}
                fill={active ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              >
                <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8L3.5 9.7l5.9-.9z" />
              </svg>
              {/* Only the two ends carry a word. All five wrapped at 375px —
                  "ควรปรับปรุง" went to a second line and pushed its star out of
                  line with the rest — and the middle three were never what
                  told anyone what the scale meant anyway. Every star still
                  announces its own word to a screen reader, above. */}
              {showWords && (starValue === 1 || starValue === LABELS.length) ? (
                <span
                  className={cn(
                    'text-[11px] whitespace-nowrap',
                    value === starValue ? 'text-foreground' : 'text-muted',
                  )}
                >
                  {label}
                </span>
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
