'use client';

/**
 * "Show the shop what you want."
 *
 * A salon customer arrives with a screenshot already saved on their phone.
 * Making them describe it in a note instead — "ตัดสั้นแบบเกาหลี" — is how a
 * stylist ends up guessing, and the first five minutes of the appointment go
 * on finding the picture anyway.
 *
 * The file goes from the phone straight to the blob store, like the gallery
 * uploader, so it never passes through a function with a 4.5 MB body limit.
 * The form then carries only the URL that comes back.
 */
import { upload } from '@vercel/blob/client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { downscaleImage } from '@/lib/portfolio/downscale';
import {
  ALLOWED_IMAGE_TYPES,
  MAX_REFERENCE_IMAGES,
  referencePrefix,
} from '@/lib/portfolio/validation';

export interface ReferenceImage {
  url: string;
  pathname: string;
}

export function ReferenceUploader({
  tenantId,
  tenantSlug,
  images,
  onChange,
}: {
  tenantId: string;
  tenantSlug: string;
  images: ReferenceImage[];
  onChange: (next: ReferenceImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const full = images.length >= MAX_REFERENCE_IMAGES;

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);

    const room = MAX_REFERENCE_IMAGES - images.length;
    const picked = Array.from(files).slice(0, room);
    const added: ReferenceImage[] = [];

    for (const file of picked) {
      try {
        const { blob, contentType } = await downscaleImage(file);
        const stem = file.name.replace(/\.[^.]+$/, '') || 'reference';
        const uploaded = await upload(`${referencePrefix(tenantId)}${stem}.webp`, blob, {
          access: 'public',
          // The shop is named in the query string; the route resolves it and
          // refuses a token for any other shop's folder.
          handleUploadUrl: `/api/bookings/upload?shop=${encodeURIComponent(tenantSlug)}`,
          contentType,
        });
        added.push({ url: uploaded.url, pathname: uploaded.pathname });
      } catch {
        setError('อัปโหลดรูปไม่สำเร็จ ลองใหม่อีกครั้ง');
      }
    }

    if (added.length > 0) onChange([...images, ...added]);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted">
        รูปตัวอย่างที่อยากได้ (ไม่ใส่ก็ได้)
      </span>

      <div className="flex flex-wrap items-center gap-2">
        {images.map((image) => (
          <span
            key={image.pathname}
            className="relative size-20 overflow-hidden rounded-xl bg-surface-muted"
          >
            <Image src={image.url} alt="" fill sizes="80px" className="object-cover" />
            <button
              type="button"
              onClick={() => onChange(images.filter((i) => i.pathname !== image.pathname))}
              aria-label="เอารูปนี้ออก"
              className="absolute top-1 right-1 grid size-6 place-items-center rounded-full bg-slate-900/70 text-xs text-white"
            >
              ✕
            </button>
          </span>
        ))}

        {full ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="ct-press grid size-20 place-items-center rounded-xl border border-dashed border-line text-xs text-muted disabled:opacity-40"
          >
            {busy ? '…' : '+ เพิ่มรูป'}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        multiple
        hidden
        onChange={(event) => void add(event.target.files)}
      />

      <p className="text-xs text-muted">
        แนบได้สูงสุด {MAX_REFERENCE_IMAGES} รูป ช่างจะเห็นตอนเตรียมงานให้คุณ
      </p>

      {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
