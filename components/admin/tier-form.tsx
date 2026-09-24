'use client';

import { useState, useTransition } from 'react';
import { MODAL_TITLE_ID, Modal } from '@/components/ui/modal';
import { deleteTier, saveTier } from '@/lib/admin/actions';
import type { AdminTier } from '@/lib/admin/queries';

export function TierForm({
  tier,
  defaultLevel,
  onClose,
  onSaved,
}: {
  tier: AdminTier | null;
  defaultLevel: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveTier({
        id: tier?.id,
        name: formData.get('name'),
        level: formData.get('level'),
        qualifySpend: formData.get('qualifySpend'),
        qualifyVisits: formData.get('qualifyVisits'),
        qualifyWindowMonths: formData.get('qualifyWindowMonths'),
        pointMultiplier: formData.get('pointMultiplier'),
      });
      if (result.ok) onSaved();
      else setError(result.error ?? 'บันทึกไม่สำเร็จ');
    });
  }

  function remove() {
    if (!tier) return;
    if (!window.confirm(`ลบระดับ "${tier.name}" ใช่ไหม`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteTier(tier.id);
      if (result.ok) onSaved();
      else setError(result.error ?? 'ลบไม่สำเร็จ');
    });
  }

  return (
    <Modal onClose={onClose} labelledBy={MODAL_TITLE_ID}>
      {(close) => (
        <form action={submit}>
          <h2 id={MODAL_TITLE_ID} className="text-lg font-semibold">
            {tier ? 'แก้ไขระดับสมาชิก' : 'เพิ่มระดับสมาชิก'}
          </h2>

          <div className="mt-4 flex flex-col gap-3">
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <Field label="ชื่อระดับ">
                <input name="name" required maxLength={40} defaultValue={tier?.name ?? ''} placeholder="เช่น Gold" className={inputClass} />
              </Field>
              <Field label="ลำดับ">
                <input name="level" type="number" min={1} max={20} required defaultValue={tier?.level ?? defaultLevel} className={inputClass} />
              </Field>
            </div>
            <p className="text-xs text-muted">ลำดับยิ่งมากยิ่งสูง ลูกค้าได้ระดับสูงสุดที่ผ่านเกณฑ์</p>

            <div className="grid grid-cols-2 gap-3">
              <Field label="ยอดใช้จ่ายขั้นต่ำ (บาท)">
                <input name="qualifySpend" type="number" min={0} step="0.01" required defaultValue={tier ? Number(tier.qualifySpend) : 0} className={inputClass} />
              </Field>
              <Field label="มาใช้บริการขั้นต่ำ (ครั้ง)">
                <input name="qualifyVisits" type="number" min={0} step={1} required defaultValue={tier?.qualifyVisits ?? 0} className={inputClass} />
              </Field>
              <Field label="นับย้อนหลัง (เดือน)">
                <input name="qualifyWindowMonths" type="number" min={1} max={60} step={1} required defaultValue={tier?.qualifyWindowMonths ?? 12} className={inputClass} />
              </Field>
              <Field label="ตัวคูณแต้ม">
                <input name="pointMultiplier" type="number" min={0.01} max={10} step="0.01" required defaultValue={tier ? Number(tier.pointMultiplier) : 1} className={inputClass} />
              </Field>
            </div>
            <p className="text-xs text-muted">ต้องผ่านทั้งยอดใช้จ่ายและจำนวนครั้ง มีผลตอนระบบคำนวณระดับรอบคืนนี้</p>
          </div>

          {error ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex gap-2">
            {tier ? (
              <button
                type="button"
                onClick={remove}
                disabled={pending || tier.members > 0}
                title={tier.members > 0 ? 'ยังมีลูกค้าอยู่ในระดับนี้' : undefined}
                className="rounded-xl border border-line px-4 py-3 text-sm text-red-700 disabled:opacity-40 dark:text-red-300"
              >
                ลบ
              </button>
            ) : null}
            <button type="button" onClick={close} className="rounded-xl border border-line px-5 py-3 text-sm">
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-brand py-3 text-sm font-medium text-brand-contrast disabled:opacity-40"
            >
              {pending ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const inputClass = 'w-full rounded-lg border border-line px-3 py-2.5 text-sm';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
