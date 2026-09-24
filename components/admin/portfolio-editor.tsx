'use client';

/**
 * Editing one portfolio photo: its caption, who did it, which service, and
 * whether customers see it — plus deleting it for good.
 */
import { useState, useTransition } from 'react';
import { MODAL_TITLE_ID, Modal } from '@/components/ui/modal';
import { deletePortfolioItem, updatePortfolioItem } from '@/lib/portfolio/actions';
import type { PortfolioPhoto } from '@/lib/portfolio/queries';
import type { PortfolioOption } from './portfolio-manager';

export function PortfolioEditor({
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
    'w-full rounded-lg border border-line px-3 py-2 text-sm';

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
              className="ct-press rounded-xl border border-line px-4 py-2.5 text-sm hover:bg-surface-muted disabled:opacity-50"
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
