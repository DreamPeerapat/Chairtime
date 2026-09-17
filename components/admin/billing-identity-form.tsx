import type { BillingIdentityInput } from '@/lib/billing/identity';

const field = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm';

/**
 * What to print on the shop's receipts and invoices.
 *
 * A plain form that posts, with no state of its own: every field is optional
 * and the placeholders say what happens when one is left empty, which is the
 * whole explanation a one-person salon needs before skipping the section.
 *
 * It sits on the billing page rather than in settings because the only time
 * anybody thinks about this is the moment they are about to pay and realise
 * their accountant will ask.
 */
export function BillingIdentityForm({
  values,
  shopName,
  fallbackEmail,
  saved,
  error,
  onSubmit,
}: {
  values: BillingIdentityInput;
  /** printed as the placeholder, so the fallback is visible rather than implied */
  shopName: string;
  fallbackEmail: string;
  saved?: boolean;
  error?: string | null;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  // Open on the way back from saving too: a confirmation inside a collapsed
  // panel is a confirmation nobody sees.
  return (
    <details className="rounded-xl border border-line bg-surface" open={Boolean(error || saved)}>
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">
        ข้อมูลสำหรับออกใบเสร็จ / ใบแจ้งหนี้
        <span className="ml-2 text-xs font-normal text-muted">
          {values.taxId ? `เลขผู้เสียภาษี ${values.taxId}` : 'ยังไม่ได้กรอก — จะใช้ชื่อร้านแทน'}
        </span>
      </summary>

      <form action={onSubmit} className="flex flex-col gap-3 border-t border-line px-4 py-4">
        {saved ? (
          <p className="rounded-lg bg-brand-soft px-3 py-2 text-sm text-brand">บันทึกแล้ว</p>
        ) : null}
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        ) : null}

        <label className="flex flex-col gap-1 text-sm">
          ชื่อผู้เสียภาษี / ชื่อบริษัท
          <input
            name="billingName"
            defaultValue={values.billingName}
            maxLength={200}
            placeholder={shopName}
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          เลขประจำตัวผู้เสียภาษี (13 หลัก)
          <input
            name="taxId"
            defaultValue={values.taxId}
            inputMode="numeric"
            maxLength={20}
            placeholder="ไม่มีก็เว้นว่างได้"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          ที่อยู่สำหรับออกเอกสาร
          <textarea
            name="billingAddress"
            defaultValue={values.billingAddress}
            maxLength={400}
            rows={2}
            placeholder="เว้นว่างเพื่อใช้ที่อยู่ร้าน"
            className={field}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          อีเมลรับเอกสาร
          <input
            name="billingEmail"
            type="email"
            defaultValue={values.billingEmail}
            maxLength={200}
            placeholder={fallbackEmail || 'เว้นว่างเพื่อส่งเข้าอีเมลของเจ้าของร้าน'}
            className={field}
          />
        </label>

        <button
          type="submit"
          className="ct-press w-fit rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-brand-contrast"
        >
          บันทึกข้อมูล
        </button>

        <p className="text-xs text-muted">
          ใช้กับเอกสารที่ออกหลังจากนี้เท่านั้น — ใบที่ออกไปแล้วเก็บชื่อและที่อยู่ ณ
          ตอนที่ออกไว้ และจะไม่เปลี่ยนตาม
        </p>
      </form>
    </details>
  );
}
