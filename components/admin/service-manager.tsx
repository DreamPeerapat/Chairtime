'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { saveService } from '@/lib/admin/actions';
import { formatBaht, formatDuration } from '@/components/booking/format';

export interface AdminService {
  id: string;
  name: string;
  description: string | null;
  basePrice: string;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  isActive: boolean;
  categoryName: string | null;
  totalMin: number;
  segments: Array<{ seq: number; kind: string; durationMin: number; label: string | null }>;
}

export function ServiceManager({ services }: { services: AdminService[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminService | 'new' | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">บริการ</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white"
        >
          + เพิ่มบริการ
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {services.map((service) => (
          <li key={service.id}>
            <button
              type="button"
              onClick={() => setEditing(service)}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left',
                service.isActive
                  ? 'border-slate-200 dark:border-slate-800'
                  : 'border-dashed border-slate-300 opacity-60 dark:border-slate-700',
              )}
            >
              <span className="flex-1">
                <span className="block text-sm font-medium">
                  {service.name}
                  {!service.isActive ? (
                    <span className="ml-2 text-xs text-slate-400">ปิดอยู่</span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  {formatDuration(service.totalMin)}
                  {service.bufferBeforeMin > 0 ? ` · เตรียม ${service.bufferBeforeMin} น.` : ''}
                  {service.bufferAfterMin > 0 ? ` · เก็บ ${service.bufferAfterMin} น.` : ''}
                  {service.segments.length > 1
                    ? ` · ${service.segments.length} ช่วง (${service.segments
                        .map((s) => (s.kind === 'passive' ? 'พัก' : 'ทำ'))
                        .join('-')})`
                    : ''}
                </span>
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {formatBaht(service.basePrice)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {editing ? (
        <ServiceForm
          service={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function ServiceForm({
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
  const multiSegment = (service?.segments.length ?? 1) > 1;

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveService({
        id: service?.id,
        name: formData.get('name'),
        description: formData.get('description') || null,
        basePrice: formData.get('basePrice'),
        durationMin: formData.get('durationMin'),
        bufferBeforeMin: formData.get('bufferBeforeMin'),
        bufferAfterMin: formData.get('bufferAfterMin'),
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
        <h2 className="text-lg font-semibold">{service ? 'แก้ไขบริการ' : 'เพิ่มบริการ'}</h2>

        <div className="mt-4 flex flex-col gap-3">
          <Field label="ชื่อบริการ">
            <input name="name" required defaultValue={service?.name ?? ''} className={inputClass} />
          </Field>
          <Field label="คำอธิบาย">
            <input
              name="description"
              defaultValue={service?.description ?? ''}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
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
            <Field label="ใช้เวลา (นาที)">
              <input
                name="durationMin"
                type="number"
                min={5}
                step={5}
                required
                disabled={multiSegment}
                defaultValue={service?.totalMin ?? 60}
                className={inputClass}
              />
            </Field>
          </div>

          {multiSegment ? (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              บริการนี้แบ่งเป็น {service!.segments.length} ช่วง (เช่น ลงสี → รอสีติด → สระ)
              แก้เวลาแต่ละช่วงต้องทำผ่านผู้ดูแลระบบ เพื่อไม่ให้ตารางช่างเพี้ยน
            </p>
          ) : null}

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
            <input
              type="checkbox"
              name="isActive"
              defaultChecked={service?.isActive ?? true}
              className="h-4 w-4"
            />
            เปิดให้จอง
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
