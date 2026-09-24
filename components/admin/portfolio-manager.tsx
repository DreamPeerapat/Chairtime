'use client';

import Image from 'next/image';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { reorderPortfolioItem } from '@/lib/portfolio/actions';
import type { PortfolioPhoto } from '@/lib/portfolio/queries';
import { PortfolioEditor } from './portfolio-editor';

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
      <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
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
                <span className="absolute left-2 top-2 rounded-md bg-[#14201f]/80 px-1.5 py-0.5 text-[10px] text-white">
                  ซ่อนอยู่
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5 p-2.5">
              <p className="truncate text-xs text-muted">
                {photo.caption ?? 'ไม่มีคำอธิบาย'}
              </p>
              <p className="truncate text-[11px] text-muted">
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
