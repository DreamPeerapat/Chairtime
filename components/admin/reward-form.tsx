'use client';

import { useState, useTransition } from 'react';
import { saveReward } from '@/lib/admin/actions';
import type { AdminReward } from './reward-manager';

export function RewardForm({
  reward,
  services,
  onClose,
  onSaved,
}: {
  reward: AdminReward | null;
  services: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rewardType, setRewardType] = useState(reward?.rewardType ?? 'discount_amount');

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveReward({
        id: reward?.id,
        name: formData.get('name'),
        rewardType: formData.get('rewardType'),
        pointCost: formData.get('pointCost'),
        serviceId: formData.get('serviceId') ?? '',
        valueAmount: formData.get('valueAmount') ?? '',
        minTierLevel: formData.get('minTierLevel'),
        stock: formData.get('stock') ?? '',
        validFrom: formData.get('validFrom') ?? '',
        validUntil: formData.get('validUntil') ?? '',
        isActive: formData.get('isActive') === 'on',
      });
      if (result.ok) onSaved();
      else setError(result.error ?? 'บันทึกไม่สำเร็จ');
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <form
        action={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-slate-900 sm:rounded-2xl"
      >
        <h2 className="text-lg font-semibold">{reward ? 'แก้ไขของรางวัล' : 'เพิ่มของรางวัล'}</h2>

        <div className="mt-4 flex flex-col gap-3">
          <Field label="ชื่อของรางวัล">
            <input name="name" required defaultValue={reward?.name ?? ''} className={inputClass} />
          </Field>

          <Field label="ประเภท">
            <select
              name="rewardType"
              defaultValue={rewardType}
              onChange={(e) => setRewardType(e.target.value)}
              className={inputClass}
            >
              <option value="free_service">บริการฟรี</option>
              <option value="discount_amount">ส่วนลด (บาท)</option>
              <option value="discount_percent">ส่วนลด (%)</option>
              <option value="free_item">ของแถม</option>
            </select>
          </Field>

          {rewardType === 'free_service' ? (
            <Field label="บริการที่แลกได้">
              <select name="serviceId" defaultValue={reward?.serviceId ?? ''} className={inputClass}>
                <option value="">เลือกบริการ</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {rewardType === 'discount_amount' || rewardType === 'discount_percent' ? (
            <Field label={rewardType === 'discount_percent' ? 'ส่วนลด (%)' : 'ส่วนลด (บาท)'}>
              <input
                name="valueAmount"
                type="number"
                min={0}
                max={rewardType === 'discount_percent' ? 100 : undefined}
                step="any"
                defaultValue={reward?.valueAmount ?? ''}
                className={inputClass}
              />
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label="ใช้กี่แต้ม">
              <input
                name="pointCost"
                type="number"
                min={1}
                required
                defaultValue={reward?.pointCost ?? ''}
                className={inputClass}
              />
            </Field>
            <Field label="ระดับสมาชิกขั้นต่ำ">
              <input
                name="minTierLevel"
                type="number"
                min={0}
                defaultValue={reward?.minTierLevel ?? 0}
                className={inputClass}
              />
            </Field>
          </div>

          <Field label="สต็อก (เว้นว่าง = ไม่จำกัด)">
            <input name="stock" type="number" min={1} defaultValue={reward?.stock ?? ''} className={inputClass} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="เริ่มแลกได้ตั้งแต่">
              <input name="validFrom" type="date" defaultValue={reward?.validFrom ?? ''} className={inputClass} />
            </Field>
            <Field label="หมดเขตแลก">
              <input name="validUntil" type="date" defaultValue={reward?.validUntil ?? ''} className={inputClass} />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isActive" defaultChecked={reward?.isActive ?? true} className="h-4 w-4" />
            เปิดให้แลก
          </label>
        </div>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm dark:border-slate-800"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-xl bg-teal-700 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            {pending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900 disabled:opacity-50';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      {children}
    </label>
  );
}
