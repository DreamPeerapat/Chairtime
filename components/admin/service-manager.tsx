'use client';

import { useState, useTransition } from 'react';
import { MODAL_TITLE_ID, Modal } from '@/components/ui/modal';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { saveService } from '@/lib/admin/actions';
import { formatBaht, formatDuration } from '@/components/booking/format';
import { Badge, Card, EmptyState, PageBody, PageHeader, Rows } from '@/components/ui/page';

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

  // Ungrouped services land under one heading rather than floating above the
  // cards, so every row on the page sits inside something.
  const grouped = Object.entries(
    services.reduce<Record<string, AdminService[]>>((acc, service) => {
      const key = service.categoryName ?? 'อื่น ๆ';
      (acc[key] ??= []).push(service);
      return acc;
    }, {}),
  );

  return (
    <PageBody>
      <PageHeader
        title="บริการ"
        description="รายการที่ลูกค้าเลือกได้ตอนจอง ราคาและเวลาที่ตั้งไว้ที่นี่คือสิ่งที่ลูกค้าเห็น"
        action={
          <button
            type="button"
            onClick={() => setEditing('new')}
            className="ct-press rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-contrast"
          >
            + เพิ่มบริการ
          </button>
        }
      />

      {/* Grouped by category, because that is how a shop thinks about its own
          price list and how the booking page shows it to a customer. */}
      {services.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title="ยังไม่มีบริการ"
            description="เพิ่มบริการที่ร้านทำ พร้อมราคาและเวลาที่ใช้ ลูกค้าจะเลือกจากรายการนี้ตอนจองคิว"
            action={
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="ct-press rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-contrast"
              >
                + เพิ่มบริการแรก
              </button>
            }
          />
        </Card>
      ) : (
        grouped.map(([category, rows]) => (
          <Card key={category} title={category} padded={false}>
            <Rows>
              {rows.map((service) => (
                <li key={service.id}>
                  <button
                    type="button"
                    onClick={() => setEditing(service)}
                    className={cn(
                      'flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-surface-muted',
                      !service.isActive && 'opacity-55',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{service.name}</span>
                        {!service.isActive ? <Badge>ปิดอยู่</Badge> : null}
                        {service.segments.length > 1 ? (
                          <Badge tone="brand">มีช่วงพัก</Badge>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {formatDuration(service.totalMin)}
                        {service.bufferBeforeMin > 0 ? ` · เตรียม ${service.bufferBeforeMin} น.` : ''}
                        {service.bufferAfterMin > 0 ? ` · เก็บ ${service.bufferAfterMin} น.` : ''}
                        {service.segments.length > 1
                          ? ` · ${service.segments
                              .map((s) => (s.kind === 'passive' ? 'พัก' : 'ทำ'))
                              .join('-')}`
                          : ''}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {formatBaht(service.basePrice)}
                    </span>
                    <span aria-hidden className="shrink-0 text-muted">
                      ›
                    </span>
                  </button>
                </li>
              ))}
            </Rows>
          </Card>
        ))
      )}

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
    </PageBody>
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
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-muted dark:bg-slate-800">
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
            onClick={close}
            className="rounded-xl border border-line px-5 py-3 text-sm"
          >
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

const inputClass =
  'w-full rounded-lg border border-line px-3 py-2.5 text-sm dark:bg-slate-900 disabled:opacity-50';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}
