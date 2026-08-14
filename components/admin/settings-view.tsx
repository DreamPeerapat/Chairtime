'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { applyShopTemplate } from '@/lib/admin/actions';

interface Props {
  role: string;
  tenant: {
    name: string;
    slug: string;
    businessType: string;
    timezone: string;
    phone: string | null;
    address: string | null;
  };
  policy: {
    slotGranularityMin: number;
    minLeadTimeMin: number;
    maxAdvanceDays: number;
    cancelCutoffMin: number;
    allowCustomerPickStaff: boolean;
  } | null;
  hasServices: boolean;
  templates: Array<{
    businessType: string;
    label: string;
    serviceCount: number;
    defaultSpaces: number;
    spaceLabel: string;
  }>;
  lineConnected: boolean;
  liffId: string | null;
  children?: React.ReactNode;
}

export function SettingsView(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bookingUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/${props.tenant.slug}` : `/${props.tenant.slug}`;

  function apply(businessType: string, spaceCount: number) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await applyShopTemplate({ businessType, spaceCount });
      if (result.ok) {
        setMessage(`เพิ่มบริการมาตรฐาน ${result.created} รายการแล้ว`);
        router.refresh();
      } else {
        setError(result.error ?? 'ใช้เทมเพลตไม่สำเร็จ');
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">ตั้งค่า</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">ลิงก์จองของร้าน</h2>
        <div className="rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
          <code className="break-all text-sm">{bookingUrl}</code>
          <p className="mt-1 text-xs text-slate-500">ส่งลิงก์นี้ให้ลูกค้า หรือใส่ใน LINE Official Account</p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">LINE</h2>
        <div className="rounded-xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-800">
          {props.lineConnected ? (
            <>
              <p className="text-teal-700 dark:text-teal-400">เชื่อมต่อแล้ว</p>
              <p className="mt-1 text-xs text-slate-500">
                {props.liffId ? `LIFF ID: ${props.liffId}` : 'ยังไม่ได้ตั้ง LIFF ID'}
              </p>
            </>
          ) : (
            <>
              <p className="text-slate-600 dark:text-slate-300">ยังไม่ได้เชื่อม LINE Official Account</p>
              <p className="mt-1 text-xs text-slate-500">
                การแจ้งเตือนจะถูกเก็บไว้ในคิวจนกว่าจะเชื่อมต่อ แล้วจะทยอยส่งให้เอง
              </p>
            </>
          )}
          <Link
            href="/dashboard/settings/line"
            className="mt-3 inline-block rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium dark:border-slate-700"
          >
            {props.lineConnected ? 'จัดการการเชื่อมต่อ LINE' : 'เชื่อมต่อ LINE OA'}
          </Link>
        </div>
      </section>

      {props.policy ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">นโยบายการจอง</h2>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Item label="ปล่อยช่องทุก" value={`${props.policy.slotGranularityMin} นาที`} />
            <Item label="จองล่วงหน้าอย่างน้อย" value={`${props.policy.minLeadTimeMin} นาที`} />
            <Item label="จองล่วงหน้าได้ไกลสุด" value={`${props.policy.maxAdvanceDays} วัน`} />
            <Item label="ยกเลิกฟรีก่อน" value={`${props.policy.cancelCutoffMin} นาที`} />
            <Item
              label="ลูกค้าเลือกช่างได้"
              value={props.policy.allowCustomerPickStaff ? 'ได้' : 'ไม่ได้'}
            />
          </dl>
        </section>
      ) : null}

      {props.role === 'owner' ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">
            เทมเพลตตามประเภทร้าน
          </h2>

          {props.hasServices ? (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              ร้านนี้มีบริการอยู่แล้ว เทมเพลตใช้ได้เฉพาะร้านที่ยังไม่มีบริการ
              เพื่อไม่ให้เมนูที่แก้ไว้แล้วซ้ำซ้อน
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              เลือกประเภทร้าน แล้วระบบจะสร้างบริการมาตรฐาน ที่นั่ง และเวลาทำการเริ่มต้นให้ —
              แก้ไขทีหลังได้ทุกอย่าง
            </p>
          )}

          {message ? (
            <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <ul className="flex flex-col gap-2">
            {props.templates.map((template) => (
              <li
                key={template.businessType}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-xl border px-4 py-3',
                  props.hasServices
                    ? 'border-slate-200 opacity-50 dark:border-slate-800'
                    : 'border-slate-200 dark:border-slate-800',
                )}
              >
                <div>
                  <p className="text-sm font-medium">{template.label}</p>
                  <p className="text-xs text-slate-500">
                    {template.serviceCount} บริการ · {template.defaultSpaces} {template.spaceLabel}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={props.hasServices || pending}
                  onClick={() => apply(template.businessType, template.defaultSpaces)}
                  className="rounded-lg bg-teal-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  {pending ? '…' : 'ใช้เทมเพลตนี้'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {props.children}
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
