'use client';

import { useState, useTransition } from 'react';
import { MODAL_TITLE_ID, Modal } from '@/components/ui/modal';
import { saveService } from '@/lib/admin/actions';
import { SegmentEditor, newSegmentDraft, type SegmentDraft } from './segment-editor';
import type { AdminService } from './service-manager';

export function ServiceForm({
  service,
  onClose,
  onSaved,
}: {
  service: AdminService | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [segments, setSegments] = useState<SegmentDraft[]>(() =>
    service && service.segments.length > 0
      ? service.segments.map((s) =>
          newSegmentDraft({
            kind: s.kind === 'passive' ? 'passive' : 'active',
            durationMin: String(s.durationMin),
            label: s.label ?? '',
          }),
        )
      : [newSegmentDraft({ durationMin: '60' })],
  );

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveService({
        id: service?.id,
        name: formData.get('name'),
        description: formData.get('description') || null,
        basePrice: formData.get('basePrice'),
        segments: segments.map((s) => ({ kind: s.kind, durationMin: s.durationMin, label: s.label })),
        bufferBeforeMin: formData.get('bufferBeforeMin'),
        bufferAfterMin: formData.get('bufferAfterMin'),
        isActive: formData.get('isActive') === 'on',
      });
      if (result.ok) onSaved();
      else setError(result.error ?? 'บันทึกไม่สำเร็จ');
    });
  }

  return (
    <Modal onClose={onClose} labelledBy={MODAL_TITLE_ID}>
      {(close) => (
        <form action={submit}>
          <h2 id={MODAL_TITLE_ID} className="text-lg font-semibold">
            {service ? 'แก้ไขบริการ' : 'เพิ่มบริการ'}
          </h2>

          <div className="mt-4 flex flex-col gap-3">
            <Field label="ชื่อบริการ">
              <input name="name" required defaultValue={service?.name ?? ''} className={inputClass} />
            </Field>
            <Field label="คำอธิบาย">
              <input name="description" defaultValue={service?.description ?? ''} className={inputClass} />
            </Field>
            <Field label="ราคา (บาท)">
              <input
                name="basePrice"
                type="number"
                min={0}
                step="1"
                required
                defaultValue={service?.basePrice ?? ''}
                className={inputClass}
              />
            </Field>

            <SegmentEditor value={segments} onChange={setSegments} />

            <div className="grid grid-cols-2 gap-3">
              <Field label="เตรียมก่อน (นาที)">
                <input
                  name="bufferBeforeMin"
                  type="number"
                  min={0}
                  step={5}
                  defaultValue={service?.bufferBeforeMin ?? 0}
                  className={inputClass}
                />
              </Field>
              <Field label="เก็บของหลัง (นาที)">
                <input
                  name="bufferAfterMin"
                  type="number"
                  min={0}
                  step={5}
                  defaultValue={service?.bufferAfterMin ?? 0}
                  className={inputClass}
                />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isActive" defaultChecked={service?.isActive ?? true} className="h-4 w-4" />
              เปิดให้จอง
            </label>
          </div>

          {error ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="mt-4 flex gap-2">
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

const inputClass = 'w-full rounded-lg border border-line px-3 py-2.5 text-sm disabled:opacity-50';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
