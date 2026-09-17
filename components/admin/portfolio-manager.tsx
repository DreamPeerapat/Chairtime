'use client';

import Image from 'next/image';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { MODAL_TITLE_ID, Modal } from '@/components/ui/modal';
import {
  deletePortfolioItem,
  reorderPortfolioItem,
  updatePortfolioItem,
} from '@/lib/portfolio/actions';
import type { PortfolioPhoto } from '@/lib/portfolio/queries';

export interface PortfolioOption {
  id: string;
  name: string;
}

export function PortfolioManager({
  photos,
  staff,
  services,
}: {
  photos: PortfolioPhoto[];
  staff: PortfolioOption[];
  services: PortfolioOption[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<PortfolioPhoto | null>(null);
  const [pending, startTransition] = useTransition();

  function move(id: string, direction: 'up' | 'down') {
    startTransition(async () => {
      await reorderPortfolioItem({ id, direction });
      router.refresh();
    });
  }

  if (photos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-slate-400">
        ยังไม่มีรูปผลงาน — กดปุ่มด้านบนเพื่อเพิ่มรูปแรก
      </p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {photos.map((photo, index) => (
          <li
            key={photo.id}
            className={cn(
              'ct-enter overflow-hidden rounded-xl border border-line',
              !photo.isPublished && 'opacity-60',
            )}
          >
            <div className="relative aspect-square bg-surface-muted">
              <Image
                src={photo.imageUrl}
                alt={photo.caption ?? 'ผลงานของร้าน'}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                className="object-cover"
              />
              {!photo.isPublished ? (
                <span className="absolute left-2 top-2 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[10px] text-white">
                  ซ่อนอยู่
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5 p-2.5">
              <p className="truncate text-xs text-muted">
                {photo.caption ?? 'ไม่มีคำอธิบาย'}
              </p>
              <p className="truncate text-[11px] text-slate-400">
                {[photo.resourceName, photo.serviceName].filter(Boolean).join(' · ') || 'ยังไม่ระบุ'}
              </p>

              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  disabled={pending || index === 0}
                  onClick={() => move(photo.id, 'up')}
                  aria-label="เลื่อนขึ้น"
                  className="ct-press rounded-md border border-line px-2 py-1 text-xs disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={pending || index === photos.length - 1}
                  onClick={() => move(photo.id, 'down')}
                  aria-label="เลื่อนลง"
                  className="ct-press rounded-md border border-line px-2 py-1 text-xs disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(photo)}
                  className="ct-press ml-auto rounded-md border border-line px-2.5 py-1 text-xs"
                >
                  แก้ไข
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {editing ? (
        <PortfolioEditor
          photo={editing}
          staff={staff}
          services={services}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

function PortfolioEditor({
  photo,
  staff,
  services,
  onClose,
  onSaved,
}: {
  photo: PortfolioPhoto;
  staff: PortfolioOption[];
  services: PortfolioOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [caption, setCaption] = useState(photo.caption ?? '');
  const [resourceId, setResourceId] = useState(photo.resourceId ?? '');
  const [serviceId, setServiceId] = useState(photo.serviceId ?? '');
  const [isPublished, setIsPublished] = useState(photo.isPublished);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updatePortfolioItem({ id: photo.id, caption, resourceId, serviceId, isPublished });
      onSaved();
    });
  }

  function remove() {
    startTransition(async () => {
      await deletePortfolioItem({ id: photo.id });
      onSaved();
    });
  }

  const field =
    'w-full rounded-lg border border-line px-3 py-2 text-sm dark:bg-slate-900';

  return (
    <Modal onClose={onClose} labelledBy={MODAL_TITLE_ID}>
      {(close) => (
        <>
          <h2 id={MODAL_TITLE_ID} className="text-lg font-semibold">
            แก้ไขรูปผลงาน
          </h2>

          <div className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              คำอธิบาย
              <input
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={200}
                placeholder="เช่น เล็บเจลลายดอกไม้"
                className={field}
              />
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              ช่างที่ทำ
              <select value={resourceId} onChange={(e) => setResourceId(e.target.value)} className={field}>
                <option value="">ไม่ระบุ</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs text-muted">
              บริการ
              <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={field}>
                <option value="">ไม่ระบุ</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="size-4"
              />
              แสดงให้ลูกค้าเห็น
            </label>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="ct-press rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending}
              className="ct-press flex-1 rounded-xl bg-brand py-2.5 text-sm font-medium text-brand-contrast hover:bg-brand-strong disabled:opacity-50"
            >
              {pending ? 'กำลังบันทึก…' : 'บันทึก'}
            </button>
          </div>

          {/* Two taps to delete: the photo and its file are both gone for good. */}
          <button
            type="button"
            onClick={() => (confirmingDelete ? remove() : setConfirmingDelete(true))}
            disabled={pending}
            className="ct-press mt-3 w-full rounded-xl border border-red-300 py-2.5 text-sm text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-400"
          >
            {confirmingDelete ? 'กดอีกครั้งเพื่อลบถาวร' : 'ลบรูปนี้'}
          </button>
        </>
      )}
    </Modal>
  );
}
