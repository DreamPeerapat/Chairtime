'use client';

/**
 * The LIFF rewards page. Same identity model as points-view.tsx: only
 * liff.getAccessToken() is trusted, and the server re-verifies it against
 * LINE before looking anything up.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import liff from '@line/liff';
import { DateTime } from 'luxon';
import { thaiDateFull } from './format';

interface RewardItem {
  id: string;
  name: string;
  rewardType: string;
  pointCost: number;
  valueAmount: string | null;
}

interface IssuedCode {
  code: string;
  rewardName: string;
  expiresAt: string | null;
}

type Status = 'loading' | 'error' | 'ready';

const REWARD_TYPE_LABEL: Record<string, string> = {
  free_service: 'บริการฟรี',
  discount_amount: 'ส่วนลด',
  discount_percent: 'ส่วนลด',
  free_item: 'ของแถม',
};

function rewardDetail(reward: RewardItem): string {
  const label = REWARD_TYPE_LABEL[reward.rewardType] ?? '';
  if (reward.rewardType === 'discount_amount' && reward.valueAmount) return `${label} ${Number(reward.valueAmount)} บาท`;
  if (reward.rewardType === 'discount_percent' && reward.valueAmount) return `${label} ${Number(reward.valueAmount)}%`;
  return label;
}

export function RewardsView({ tenantSlug, liffId }: { tenantSlug: string; liffId: string | null }) {
  const [status, setStatus] = useState<Status>(liffId ? 'loading' : 'error');
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [balance, setBalance] = useState(0);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(liffId ? null : 'ร้านนี้ยังไม่ได้เปิดใช้งานหน้าแลกรางวัล');
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedCode | null>(null);

  async function loadRewards(token: string) {
    const response = await fetch('/api/liff/rewards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tenantSlug, accessToken: token }),
    });
    if (!response.ok) throw new Error(`request failed: ${response.status}`);
    const json = (await response.json()) as { rewards: RewardItem[]; balance: number };
    setRewards(json.rewards);
    setBalance(json.balance);
  }

  useEffect(() => {
    if (!liffId) return;
    let cancelled = false;

    async function run() {
      try {
        await liff.init({ liffId: liffId!, withLoginOnExternalBrowser: true });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const token = liff.getAccessToken();
        if (!token) throw new Error('no access token');
        if (cancelled) return;
        setAccessToken(token);
        await loadRewards(token);
        if (!cancelled) setStatus('ready');
      } catch {
        if (!cancelled) {
          setMessage('โหลดข้อมูลรางวัลไม่สำเร็จ กรุณาลองใหม่');
          setStatus('error');
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liffId, tenantSlug]);

  async function redeem(rewardId: string) {
    if (!accessToken) return;
    setRedeeming(rewardId);
    setRedeemError(null);
    try {
      const response = await fetch('/api/liff/rewards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantSlug, accessToken, rewardId }),
      });
      const json = await response.json();
      if (!response.ok) {
        setRedeemError(json.error ?? 'แลกของรางวัลไม่สำเร็จ');
        return;
      }
      setIssued(json as IssuedCode);
      await loadRewards(accessToken);
    } catch {
      setRedeemError('แลกของรางวัลไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setRedeeming(null);
    }
  }

  if (status === 'loading') {
    return <p className="py-10 text-center text-sm text-slate-500">กำลังโหลด...</p>;
  }
  if (status === 'error') {
    return <p className="py-10 text-center text-sm text-slate-500">{message}</p>;
  }

  if (issued) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 p-6 text-center dark:border-slate-800">
        <p className="text-sm text-slate-500">แลกสำเร็จ</p>
        <p className="text-sm font-medium">{issued.rewardName}</p>
        <p className="rounded-lg bg-teal-50 px-6 py-3 text-3xl font-semibold tracking-widest text-teal-700 dark:bg-teal-950 dark:text-teal-300">
          {issued.code}
        </p>
        {issued.expiresAt ? (
          <p className="text-xs text-slate-500">ใช้ได้ถึง {thaiDateFull(DateTime.fromISO(issued.expiresAt))}</p>
        ) : null}
        <p className="text-xs text-slate-500">แสดงโค้ดนี้ให้พนักงานตอนใช้บริการ</p>
        <button
          type="button"
          onClick={() => setIssued(null)}
          className="mt-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm dark:border-slate-800"
        >
          ดูของรางวัลอื่น
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/${tenantSlug}/points`}
        className="rounded-2xl border border-slate-200 p-4 text-center dark:border-slate-800"
      >
        <p className="text-2xl font-semibold text-teal-700 dark:text-teal-400">{balance}</p>
        <p className="text-xs text-slate-500">แต้มคงเหลือ</p>
      </Link>

      {redeemError ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-center text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {redeemError}
        </p>
      ) : null}

      {rewards.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">ยังไม่มีของรางวัลให้แลกตอนนี้</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rewards.map((reward) => (
            <li
              key={reward.id}
              className="flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
            >
              <span className="flex-1">
                <span className="block text-sm font-medium">{reward.name}</span>
                <span className="block text-xs text-slate-500">{rewardDetail(reward)}</span>
              </span>
              <button
                type="button"
                disabled={redeeming === reward.id || balance < reward.pointCost}
                onClick={() => redeem(reward.id)}
                className="shrink-0 rounded-lg bg-teal-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
              >
                {redeeming === reward.id ? 'กำลังแลก…' : `${reward.pointCost} แต้ม`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
