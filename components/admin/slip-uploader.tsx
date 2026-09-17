'use client';

/**
 * Attaching the transfer slip.
 *
 * The same client upload the gallery and the stylist photo use — straight
 * from the phone to the blob store, so a screenshot from a banking app never
 * has to fit inside a serverless request body. It lands under the shop's slip
 * folder, which the token route is what actually enforces.
 *
 * One slip, replaceable until the form is sent: a shop that picks the wrong
 * screenshot should be able to pick again without reloading the page.
 */
import { upload } from '@vercel/blob/client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { downscaleImage } from '@/lib/portfolio/downscale';
import { ALLOWED_IMAGE_TYPES, slipPrefix } from '@/lib/portfolio/validation';
import { ErrorText } from './ui';

export function SlipUploader({
  tenantId,
  value,
  onChange,
}: {
  tenantId: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | null | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, contentType } = await downscaleImage(file);
      const uploaded = await upload(`${slipPrefix(tenantId)}slip.webp`, blob, {
        access: 'public',
        handleUploadUrl: '/api/admin/portfolio/upload',
        contentType,
      });
      onChange(uploaded.url);
    } catch {
      setError('แนบสลิปไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm">สลิปโอนเงิน</span>

      <div className="flex items-center gap-3">
        {value ? (
          <span className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
            <Image src={value} alt="สลิปที่แนบไว้" fill sizes="64px" className="object-cover" />
          </span>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_IMAGE_TYPES.join(',')}
            hidden
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="w-fit rounded-lg border border-line px-3 py-1.5 text-xs disabled:opacity-40"
          >
            {busy ? 'กำลังแนบ…' : value ? 'เปลี่ยนสลิป' : 'แนบสลิป'}
          </button>
          {value ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange(null)}
              className="w-fit text-xs text-muted underline disabled:opacity-40"
            >
              เอาสลิปออก
            </button>
          ) : null}
        </div>
      </div>

      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  );
}
