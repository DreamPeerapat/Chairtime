'use client';

/**
 * The shop's membership tiers, lowest first.
 *
 * Customers are not moved when a tier is saved: the nightly run in
 * lib/loyalty/tier.ts does that, highest level first, so the page says so
 * rather than leaving a shop to wonder why nobody changed.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AdminTier } from '@/lib/admin/queries';
import { formatBaht } from '@/components/booking/format';
import { Badge, Card, EmptyState, PageBody, PageHeader, Rows } from '@/components/ui/page';
import { TierForm } from './tier-form';

export function TierManager({ tiers, canEdit }: { tiers: AdminTier[]; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminTier | 'new' | null>(null);
  const nextLevel = tiers.reduce((max, t) => Math.max(max, t.level), 0) + 1;

  const addButton = canEdit ? (
    <button
      type="button"
      onClick={() => setEditing('new')}
      className="ct-press rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-contrast"
    >
      + เพิ่มระดับ
    </button>
  ) : null;

  return (
    <PageBody>
      <PageHeader
        title="ระดับสมาชิก"
        description="ลูกค้าเลื่อนขั้นอัตโนมัติทุกคืนตามยอดใช้จ่ายและจำนวนครั้งที่มา ตกชั้นได้หลังผ่านไป 30 วันที่ไม่ถึงเกณฑ์"
        action={addButton}
      />

      {tiers.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            title="ยังไม่มีระดับสมาชิก"
            description="ตั้งระดับเช่น Silver / Gold ให้ลูกค้าประจำได้แต้มมากขึ้น"
            action={addButton}
          />
        </Card>
      ) : (
        <Card padded={false}>
          <Rows>
            {tiers.map((tier) => (
              <li key={tier.id}>
                <button
                  type="button"
                  onClick={() => canEdit && setEditing(tier)}
                  disabled={!canEdit}
                  className="flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-surface-muted disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{tier.name}</span>
                      <Badge>ลำดับ {tier.level}</Badge>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {criteria(tier)} · แต้ม ×{Number(tier.pointMultiplier)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">{tier.members} คน</span>
                  {canEdit ? (
                    <span aria-hidden className="shrink-0 text-muted">
                      ›
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </Rows>
        </Card>
      )}

      {!canEdit ? <p className="text-xs text-muted">เฉพาะเจ้าของร้านแก้ไขระดับสมาชิกได้</p> : null}

      {editing ? (
        <TierForm
          tier={editing === 'new' ? null : editing}
          defaultLevel={nextLevel}
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

function criteria(tier: AdminTier): string {
  const spend = Number(tier.qualifySpend);
  // tier.ts compares with >=, so a tier with no bar is every customer's.
  if (spend === 0 && tier.qualifyVisits === 0) return 'ลูกค้าทุกคน';
  const parts = [
    spend > 0 ? `ใช้จ่าย ${formatBaht(tier.qualifySpend)}` : null,
    tier.qualifyVisits > 0 ? `มา ${tier.qualifyVisits} ครั้ง` : null,
  ].filter(Boolean);
  return `${parts.join(' และ ')} ใน ${tier.qualifyWindowMonths} เดือน`;
}
