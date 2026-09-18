'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { PageBody, PageHeader } from '@/components/ui/page';
import { applyShopTemplate } from '@/lib/admin/actions';
import { ShopProfileForm } from './shop-profile-form';
import { BookingPolicyForm, type BookingPolicy } from './booking-policy-form';

interface Props {
  role: string;
  tenant: {
    name: string;
    slug: string;
    businessType: string;
    timezone: string;
    phone: string | null;
    address: string | null;
    latitude: string | null;
    longitude: string | null;
  };
  policy: BookingPolicy;
  /**
   * Built on the server from NEXT_PUBLIC_APP_URL. It used to come off
   * `window.location.origin` here — a bare path on the server and a full URL
   * in the browser, so this page threw a hydration mismatch on every load.
   */
  bookingUrl: string;
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
  /** null when the loader could not resolve one — the card is then hidden */
  billing: { label: string; detail: string; lapsed: boolean } | null;
  children?: React.ReactNode;
}

export function SettingsView(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    <PageBody className="gap-6">
      <PageHeader
        title="ตั้งค่า"
        description="ข้อมูลร้านที่ลูกค้าเห็น การเชื่อม LINE ของร้าน และเทมเพลตบริการ"
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">ข้อมูลร้าน</h2>
        <ShopProfileForm
          name={props.tenant.name}
          phone={props.tenant.phone}
          address={props.tenant.address}
          latitude={props.tenant.latitude}
          longitude={props.tenant.longitude}
        />
      </section>

      {props.billing ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">แพ็กเกจ</h2>
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              props.billing.lapsed
                ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
                : 'border-line'
            }`}
          >
            <p className="font-medium">{props.billing.label}</p>
            <p className="mt-0.5 text-xs text-muted">{props.billing.detail}</p>
            <Link
              href="/dashboard/billing"
              className="mt-3 inline-block rounded-lg border border-line px-3 py-1.5 text-xs font-medium"
            >
              ดูแพ็กเกจและต่ออายุ
            </Link>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">ลิงก์จองของร้าน</h2>
        <div className="rounded-xl border border-line px-4 py-3">
          <code className="break-all text-sm select-all">{props.bookingUrl}</code>
          <p className="mt-1 text-xs text-muted">ส่งลิงก์นี้ให้ลูกค้า หรือใส่ใน LINE Official Account</p>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">LINE</h2>
        <div className="rounded-xl border border-line px-4 py-3 text-sm">
          {props.lineConnected ? (
            <>
              <p className="text-brand dark:text-teal-400">เชื่อมต่อแล้ว</p>
              <p className="mt-1 text-xs text-muted">
                {props.liffId ? `LIFF ID: ${props.liffId}` : 'ยังไม่ได้ตั้ง LIFF ID'}
              </p>
            </>
          ) : (
            <>
              <p className="text-muted">ยังไม่ได้เชื่อม LINE Official Account</p>
              <p className="mt-1 text-xs text-muted">
                การแจ้งเตือนจะถูกเก็บไว้ในคิวจนกว่าจะเชื่อมต่อ แล้วจะทยอยส่งให้เอง
              </p>
            </>
          )}
          <Link
            href="/dashboard/settings/line"
            className="mt-3 inline-block rounded-lg border border-line px-3 py-1.5 text-xs font-medium"
          >
            {props.lineConnected ? 'จัดการการเชื่อมต่อ LINE' : 'เชื่อมต่อ LINE OA'}
          </Link>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">นโยบายการจอง</h2>
        <div className="rounded-xl border border-line px-4 py-4">
          <BookingPolicyForm policy={props.policy} />
        </div>
      </section>

      {props.role === 'owner' ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted">
            เทมเพลตตามประเภทร้าน
          </h2>

          {props.hasServices ? (
            <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-muted dark:bg-slate-800">
              ร้านนี้มีบริการอยู่แล้ว เทมเพลตใช้ได้เฉพาะร้านที่ยังไม่มีบริการ
              เพื่อไม่ให้เมนูที่แก้ไว้แล้วซ้ำซ้อน
            </p>
          ) : (
            <p className="text-xs text-muted">
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
                    ? 'border-line opacity-50'
                    : 'border-line',
                )}
              >
                <div>
                  <p className="text-sm font-medium">{template.label}</p>
                  <p className="text-xs text-muted">
                    {template.serviceCount} บริการ · {template.defaultSpaces} {template.spaceLabel}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={props.hasServices || pending}
                  onClick={() => apply(template.businessType, template.defaultSpaces)}
                  className="rounded-lg bg-brand px-3 py-2 text-xs font-medium text-brand-contrast disabled:opacity-40"
                >
                  {pending ? '…' : 'ใช้เทมเพลตนี้'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {props.children}
    </PageBody>
  );
}
