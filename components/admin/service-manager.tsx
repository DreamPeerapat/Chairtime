'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { formatBaht, formatDuration } from '@/components/booking/format';
import { Badge, Card, EmptyState, PageBody, PageHeader, Rows } from '@/components/ui/page';
import { ServiceForm } from './service-form';

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
