'use client';

import { useState } from 'react';
import { SlipUploader } from './slip-uploader';

/**
 * "โอนแล้ว" — the shop's half of the confirmation.
 *
 * A client component only because the uploader hands back a URL that has to
 * reach the form. The button stays disabled until a slip is attached when the
 * platform is checking slips: without a key configured the claim goes through
 * on trust as it always has, and demanding a screenshot we would not look at
 * is theatre.
 */
export function SlipConfirmForm({
  tenantId,
  slipRequired,
  onSubmit,
}: {
  tenantId: string;
  /** whether a slip is checked against the bank, which makes it worth insisting on */
  slipRequired: boolean;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const [slipUrl, setSlipUrl] = useState<string | null>(null);

  return (
    <form action={onSubmit} className="flex flex-col gap-3">
      <SlipUploader tenantId={tenantId} value={slipUrl} onChange={setSlipUrl} />
      <input type="hidden" name="slipUrl" value={slipUrl ?? ''} />

      <button
        type="submit"
        disabled={slipRequired && !slipUrl}
        className="ct-press w-full rounded-xl bg-brand py-3  text-sm font-medium text-brand-contrast disabled:opacity-50"
      >
        {slipRequired && !slipUrl ? 'แนบสลิปก่อนจึงจะยืนยันได้' : 'โอนแล้ว ตรวจสอบเลย'}
      </button>

      <p className="text-xs text-muted">
        {slipRequired
          ? 'ระบบจะอ่านสลิปแล้วตรวจยอดกับธนาคารทันที ถ้าไม่ตรงจะยังไม่ต่ออายุให้'
          : 'แนบสลิปไว้ด้วยก็ได้ จะช่วยให้ตรวจสอบย้อนหลังง่ายขึ้น'}
      </p>
    </form>
  );
}
