'use client';

/**
 * Adding or editing one member of staff, chair, bed or room.
 *
 * The staff-only fields (photo, bio, which services) appear only when the
 * chosen type is a person; a chair has nothing to introduce itself with.
 */
import { useState, useTransition } from 'react';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { saveResource } from '@/lib/admin/actions';
import { AvatarPicker } from './avatar-picker';
import type { AdminResource } from './resource-manager';
import { ErrorText, inputClass, primaryButton, secondaryButton } from './ui';

export function ResourceForm({
  tenantId,
  resource,
  resourceTypes,
  services,
  onClose,
  onSaved,
}: {
  tenantId: string;
  resource: AdminResource | null;
  resourceTypes: Array<{ id: string; code: string; name: string; isHuman: boolean }>;
  services: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [typeId, setTypeId] = useState(resource?.typeId ?? resourceTypes[0]?.id ?? '');
  const [selectedServices, setSelectedServices] = useState<string[]>(resource?.serviceIds ?? []);
  // Held in state rather than a form field: the file is uploaded the moment
  // it is picked, and only the URL it returns travels with the form.
  const [photoUrl, setPhotoUrl] = useState<string | null>(resource?.photoUrl ?? null);
  const [name, setName] = useState(resource?.name ?? '');

  const isHuman = resourceTypes.find((t) => t.id === typeId)?.isHuman ?? false;

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveResource({
        id: resource?.id,
        resourceTypeId: typeId,
        name: formData.get('name'),
        bio: formData.get('bio') || null,
        photoUrl: isHuman ? photoUrl : null,
        isBookable: formData.get('isBookable') === 'on',
        isActive: formData.get('isActive') === 'on',
        serviceIds: isHuman ? selectedServices : [],
      });
      if (result.ok) onSaved();
      else setError(result.error ?? 'บันทึกไม่สำเร็จ');
    });
  }

  return (
    <Modal onClose={onClose}>
      <form action={submit} className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{resource ? 'แก้ไข' : 'เพิ่ม'}</h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">ประเภท</span>
          <select
            value={typeId}
            onChange={(e) => setTypeId(e.target.value)}
            disabled={!!resource}
            className={inputClass}
          >
            {resourceTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">ชื่อ</span>
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
          />
        </label>

        {isHuman ? (
          <AvatarPicker tenantId={tenantId} name={name} value={photoUrl} onChange={setPhotoUrl} />
        ) : null}

        {isHuman ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">
              แนะนำตัว (ลูกค้าเห็น)
            </span>
            <input name="bio" defaultValue={resource?.bio ?? ''} className={inputClass} />
          </label>
        ) : null}

        {isHuman ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted">
              ทำบริการอะไรได้บ้าง
            </span>
            <div className="flex flex-wrap gap-1.5">
              {services.map((service) => {
                const on = selectedServices.includes(service.id);
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() =>
                      setSelectedServices((prev) =>
                        on ? prev.filter((id) => id !== service.id) : [...prev, service.id],
                      )
                    }
                    className={cn(
                      'rounded-lg border px-2.5 py-1.5 text-xs',
                      on
                        ? 'border-brand bg-brand text-brand-contrast'
                        : 'border-line',
                    )}
                  >
                    {service.name}
                  </button>
                );
              })}
            </div>
            {selectedServices.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                ถ้าไม่เลือกอะไรเลย ระบบจะไม่จัดคิวให้คนนี้
              </p>
            ) : null}
          </div>
        ) : null}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isBookable"
            defaultChecked={resource?.isBookable ?? isHuman}
            className="h-4 w-4"
          />
          ลูกค้าเลือกเจาะจงได้
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={resource?.isActive ?? true}
            className="h-4 w-4"
          />
          ใช้งานอยู่
        </label>

        {error ? <ErrorText>{error}</ErrorText> : null}

        <div className="mt-1 flex gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            ยกเลิก
          </button>
          <button type="submit" disabled={pending} className={primaryButton}>
            {pending ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
