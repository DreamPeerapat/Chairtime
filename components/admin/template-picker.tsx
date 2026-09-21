'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { applyShopTemplate } from '@/lib/admin/actions';
import { Card, Rows, Row } from '@/components/ui/page';

export interface ShopTemplate {
  businessType: string;
  label: string;
  serviceCount: number;
  defaultSpaces: number;
  spaceLabel: string;
}

/**
 * Standard services for a kind of shop, applied in one press.
 *
 * Split out of settings-view.tsx because it is the only part of that page
 * that owns state, and because the page was over the 200-line limit with it
 * inline. Owner-only: the caller decides whether to render it at all.
 *
 * A shop that already has services cannot use these — applying a template on
 * top of an edited menu is how a shop ends up with two of everything. The
 * rows are still shown rather than hidden, because "this exists and is not
 * for you now" is more use than a section that silently is not there.
 */
export function TemplatePicker({
  templates,
  hasServices,
}: {
  templates: ShopTemplate[];
  hasServices: boolean;
}) {
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
    <Card
      title="เทมเพลตตามประเภทร้าน"
      description={
        hasServices
          ? 'ร้านนี้มีบริการอยู่แล้ว เทมเพลตใช้ได้เฉพาะร้านที่ยังไม่มีบริการ เพื่อไม่ให้เมนูที่แก้ไว้แล้วซ้ำซ้อน'
          : 'เลือกประเภทร้าน แล้วระบบจะสร้างบริการมาตรฐาน ที่นั่ง และเวลาทำการเริ่มต้นให้ — แก้ไขทีหลังได้ทุกอย่าง'
      }
      padded={false}
    >
      {message ? (
        <p className="border-b border-line bg-brand-soft px-4 py-3 text-sm text-brand-strong">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="border-b border-line bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <Rows>
        {templates.map((template) => (
          <Row
            key={template.businessType}
            title={template.label}
            meta={`${template.serviceCount} บริการ · ${template.defaultSpaces} ${template.spaceLabel}`}
            onClickAction={
              <button
                type="button"
                disabled={hasServices || pending}
                onClick={() => apply(template.businessType, template.defaultSpaces)}
                className="ct-press h-11 shrink-0 rounded-xl bg-brand px-4 text-xs font-medium text-brand-contrast hover:bg-brand-strong disabled:opacity-40"
              >
                {pending ? '…' : 'ใช้เทมเพลตนี้'}
              </button>
            }
          />
        ))}
      </Rows>
    </Card>
  );
}
