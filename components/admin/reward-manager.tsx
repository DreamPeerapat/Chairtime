'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { RewardForm } from './reward-form';

export interface AdminReward {
  id: string;
  name: string;
  rewardType: string;
  pointCost: number;
  serviceId: string | null;
  serviceName: string | null;
  valueAmount: string | null;
  minTierLevel: number;
  stock: number | null;
  stockUsed: number;
  validFrom: string | null;
  validUntil: string | null;
  isActive: boolean;
}

const REWARD_TYPE_LABEL: Record<string, string> = {
  free_service: 'บริการฟรี',
  discount_amount: 'ส่วนลด (บาท)',
  discount_percent: 'ส่วนลด (%)',
  free_item: 'ของแถม',
};

function rewardSubtitle(reward: AdminReward): string {
  const parts = [REWARD_TYPE_LABEL[reward.rewardType] ?? reward.rewardType];
  if (reward.rewardType === 'free_service' && reward.serviceName) parts.push(reward.serviceName);
  if (reward.rewardType === 'discount_amount' && reward.valueAmount) parts.push(`${Number(reward.valueAmount)} บาท`);
  if (reward.rewardType === 'discount_percent' && reward.valueAmount) parts.push(`${Number(reward.valueAmount)}%`);
  if (reward.minTierLevel > 0) parts.push(`ระดับ ${reward.minTierLevel}+`);
  parts.push(reward.stock === null ? 'ไม่จำกัดสต็อก' : `เหลือ ${reward.stock - reward.stockUsed}/${reward.stock}`);
  return parts.join(' · ');
}

export function RewardManager({ rewards, services }: { rewards: AdminReward[]; services: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminReward | 'new' | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">รางวัลแลกแต้ม</h1>
        <button
          type="button"
          onClick={() => setEditing('new')}
          className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white"
        >
          + เพิ่มของรางวัล
        </button>
      </div>

      {rewards.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-700">
          ยังไม่มีของรางวัลในระบบ
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {rewards.map((reward) => (
          <li key={reward.id}>
            <button
              type="button"
              onClick={() => setEditing(reward)}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left',
                reward.isActive
                  ? 'border-slate-200 dark:border-slate-800'
                  : 'border-dashed border-slate-300 opacity-60 dark:border-slate-700',
              )}
            >
              <span className="flex-1">
                <span className="block text-sm font-medium">
                  {reward.name}
                  {!reward.isActive ? <span className="ml-2 text-xs text-slate-400">ปิดอยู่</span> : null}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">{rewardSubtitle(reward)}</span>
              </span>
              <span className="shrink-0 text-sm font-medium tabular-nums">{reward.pointCost} แต้ม</span>
            </button>
          </li>
        ))}
      </ul>

      {editing ? (
        <RewardForm
          reward={editing === 'new' ? null : editing}
          services={services}
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
