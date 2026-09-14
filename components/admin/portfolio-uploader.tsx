'use client';

import { upload } from '@vercel/blob/client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addPortfolioItem } from '@/lib/portfolio/actions';
import { downscaleImage } from '@/lib/portfolio/downscale';
import { ALLOWED_IMAGE_TYPES, portfolioPrefix } from '@/lib/portfolio/validation';

/**
 * The upload button.
 *
 * Several photos at once, because a shop uploading its work has a folder of
 * them, not one. Each is shrunk on this device, sent straight to the blob
 * store, and only then recorded in the database — so a failed upload leaves
 * no row pointing at a file that does not exist.
 */
export function PortfolioUploader({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    setProgress({ done: 0, total: files.length });

    let failed = 0;
    for (const [index, file] of Array.from(files).entries()) {
      try {
        const { blob, contentType } = await downscaleImage(file);
        // Under this shop's prefix — the token route refuses any other path,
        // so this is organisation, not the security boundary.
        const stem = file.name.replace(/\.[^.]+$/, '') || 'photo';
        const uploaded = await upload(`${portfolioPrefix(tenantId)}${stem}.webp`, blob, {
          access: 'public',
          handleUploadUrl: '/api/admin/portfolio/upload',
          contentType,
        });

        const result = await addPortfolioItem({
          imageUrl: uploaded.url,
          blobPathname: uploaded.pathname,
        });
        if (!result.ok) failed += 1;
      } catch {
        failed += 1;
      }
      setProgress({ done: index + 1, total: files.length });
    }

    if (failed > 0) {
      setError(
        failed === files.length
          ? 'อัปโหลดไม่สำเร็จ กรุณาลองใหม่'
          : `อัปโหลดไม่สำเร็จ ${failed} รูป ที่เหลือขึ้นเรียบร้อย`,
      );
    }

    setBusy(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = '';
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_IMAGE_TYPES.join(',')}
        multiple
        hidden
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="ct-press rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-600 active:bg-teal-800 disabled:opacity-50"
      >
        {busy && progress
          ? `กำลังอัปโหลด ${progress.done}/${progress.total}…`
          : '+ เพิ่มรูปผลงาน'}
      </button>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
