'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';
import { initialOf } from '@/components/booking/format';
import type { AdminResource } from './resource-manager';

/**
 * One list of resources — the stylists, or the chairs.
 *
 * Lifted out of resource-manager.tsx, which was over twice the 200-line limit
 * CLAUDE.md sets, and is the only place the staff photo now appears outside
 * the form that uploads it.
 *
 * The photo matters here because it is the shop's own check on what the
 * customer sees: `resource.photo_url` has always been read by the booking
 * screen, and until now the only way to confirm a face had uploaded was to
 * reopen the edit form. The circle uses the same fallback initial as that
 * screen (`initialOf`) so a stylist with no photo looks the same in both
 * places rather than inventing a second placeholder.
 *
 * Chairs and rooms get no circle at all. They have no photo to show and a row
 * of identical grey discs down the side of a list of beds is decoration.
 */
export function ResourceGroup({
  title,
  items,
  onEdit,
  onAdd,
}: {
  title: string;
  items: AdminResource[];
  onEdit: (r: AdminResource) => void;
  onAdd?: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted">{title}</h2>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="ct-press rounded-lg px-2 py-1 text-xs font-medium text-brand hover:bg-brand-soft"
          >
            + เพิ่ม
          </button>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {items.map((resource) => (
          <li key={resource.id}>
            <button
              type="button"
              onClick={() => onEdit(resource)}
              className={cn(
                'ct-press flex w-full items-center gap-3 rounded-xl border bg-surface px-4 py-3 text-left hover:bg-surface-muted',
                resource.isActive ? 'border-line' : 'border-dashed border-line opacity-60',
              )}
            >
              {resource.isHuman ? (
                <span
                  aria-hidden
                  className="relative grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-soft text-sm font-medium text-brand-strong"
                >
                  {resource.photoUrl ? (
                    <Image
                      src={resource.photoUrl}
                      alt=""
                      fill
                      sizes="40px"
                      className="object-cover"
                    />
                  ) : (
                    initialOf(resource.name)
                  )}
                </span>
              ) : null}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {resource.name}
                  {!resource.isActive ? (
                    <span className="ml-2 text-xs text-muted">ปิดอยู่</span>
                  ) : null}
                  {resource.isHuman && !resource.isBookable ? (
                    <span className="ml-2 text-xs text-muted">ลูกค้าเลือกไม่ได้</span>
                  ) : null}
                </span>
                {resource.isHuman ? (
                  <span className="mt-0.5 block text-xs text-muted">
                    {resource.serviceIds.length === 0
                      ? 'ยังไม่ได้กำหนดว่าทำบริการอะไรได้ — จะไม่ถูกจัดคิวให้'
                      : `ทำได้ ${resource.serviceIds.length} บริการ`}
                    {resource.hours.length > 0 ? ' · มีเวลาทำงานเฉพาะตัว' : ''}
                  </span>
                ) : null}
              </span>
            </button>
          </li>
        ))}

        {items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            ยังไม่มีข้อมูล
          </li>
        ) : null}
      </ul>
    </section>
  );
}
