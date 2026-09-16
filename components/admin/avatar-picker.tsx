'use client';

/**
 * The stylist's own photo, in the staff form.
 *
 * `resource.photo_url` has been in the schema from the start and the customer
 * booking screen reads it, but nothing could write it — a shop could only put
 * a face next to a name by editing the database. This is that missing half.
 *
 * It uploads on pick rather than on save, because the file goes straight from
 * this device to the blob store (Vercel caps a function request body at
 * 4.5 MB, which a phone photo passes without trying) and the form only ever
 * carries the URL that comes back.
 */
import { upload } from '@vercel/blob/client';
import { useRef, useState } from 'react';
import Image from 'next/image';
import { downscaleImage } from '@/lib/portfolio/downscale';
import { ALLOWED_IMAGE_TYPES, staffPhotoPrefix } from '@/lib/portfolio/validation';
import { ErrorText } from './ui';

export function AvatarPicker({
  tenantId,
  name,
  value,
  onChange,
}: {
  tenantId: string;
  /** shown while there is no photo, so the circle is never blank */
  name: string;
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
      const uploaded = await upload(`${staffPhotoPrefix(tenantId)}avatar.webp`, blob, {
        access: 'public',
        handleUploadUrl: '/api/admin/portfolio/upload',
        contentType,
      });
      onChange(uploaded.url);
    } catch {
      setError('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
        รูปช่าง (ลูกค้าเห็นตอนเลือกช่าง)
      </span>

      <div className="flex items-center gap-3">
        <span className="relative size-16 shrink-0 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          {value ? (
            <Image src={value} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-xs text-slate-400">
              ไม่มีรูป
            </span>
          )}
        </span>

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
            className="w-fit rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-40 dark:border-slate-700"
          >
            {busy ? 'กำลังอัปโหลด…' : value ? 'เปลี่ยนรูป' : 'เลือกรูป'}
          </button>
          {value ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange(null)}
              className="w-fit text-xs text-slate-500 underline disabled:opacity-40"
            >
              เอารูปออก
            </button>
          ) : (
            <p className="text-xs text-slate-500">ถ้าไม่ใส่ จะขึ้นเป็นตัวย่อของชื่อ “{name || '—'}”</p>
          )}
        </div>
      </div>

      {error ? <ErrorText>{error}</ErrorText> : null}
    </div>
  );
}
