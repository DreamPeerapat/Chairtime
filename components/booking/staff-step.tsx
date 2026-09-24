'use client';

import { useState } from 'react';
import type { PortfolioPhoto } from '@/lib/portfolio/queries';
import type { StaffListItem } from '@/lib/booking/queries';
import { PhotoViewer } from './photo-viewer';
import { PortfolioStrip } from './portfolio-strip';
import { Avatar, Card, Text, Tick } from './staff-card';

export function StaffStep({
  staff,
  hiddenCount = 0,
  portfolio,
  selected,
  onChange,
  onBack,
  onNext,
}: {
  staff: StaffListItem[];
  /** stylists left out because they do not do everything in the basket */
  hiddenCount?: number;
  /** published photos by resource id — the work each person has done */
  portfolio: Record<string, PortfolioPhoto[]>;
  selected: string | null;
  onChange: (id: string | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [viewing, setViewing] = useState<{
    photos: PortfolioPhoto[];
    index: number;
    staffName: string;
  } | null>(null);

  return (
    <div className="flex flex-1 flex-col gap-4">
      <h2 className="text-base font-semibold">เลือกช่าง</h2>

      {/* Said out loud rather than left to be noticed. A shorter list with no
          explanation reads as stylists being away today. */}
      {hiddenCount > 0 ? (
        <p className="rounded-lg bg-surface-muted px-3 py-2 text-xs text-muted">
          แสดงเฉพาะช่างที่ทำบริการที่คุณเลือกได้ — ช่างอีก {hiddenCount} คนไม่ได้ทำบริการนี้
        </p>
      ) : null}

      {staff.length === 0 ? (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          ตอนนี้ยังไม่มีช่างที่ทำบริการที่เลือกไว้ได้ทั้งหมด
          ลองย้อนกลับไปเลือกบริการให้น้อยลง แล้วจองแยกเป็นสองคิว
        </p>
      ) : null}

      <ul className="flex flex-col gap-2.5">
        <li>
          <Card active={selected === null} onSelect={() => onChange(null)}>
            <Avatar name="ช่างคนไหนก็ได้" photoUrl={null} anyone />
            <Text
              name="ช่างคนไหนก็ได้"
              hint="ระบบจะจัดช่างที่ว่างให้ — มักได้เวลาที่ต้องการมากกว่า"
            />
            <Tick shown={selected === null} />
          </Card>
        </li>

        {staff.map((person) => {
          const photos = portfolio[person.id] ?? [];
          return (
            <li key={person.id}>
              <Card
                active={selected === person.id}
                onSelect={() => onChange(person.id)}
                label={person.name}
                below={
                  photos.length > 0 ? (
                    <PortfolioStrip
                      photos={photos}
                      staffName={person.name}
                      onOpen={(index) => setViewing({ photos, index, staffName: person.name })}
                    />
                  ) : null
                }
              >
                <Avatar name={person.name} photoUrl={person.photoUrl} />
                <Text name={person.name} hint={person.bio} />
                <Tick shown={selected === person.id} />
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-5 mt-auto flex gap-2 border-t border-line bg-surface/95 px-5 pb-[env(safe-area-inset-bottom)] pt-3 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          className="ct-press rounded-xl border border-line px-5 py-3 text-sm hover:bg-surface-muted"
        >
          ย้อนกลับ
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 ct-press rounded-xl bg-brand py-3 text-sm font-medium text-brand-contrast hover:bg-brand-strong active:bg-brand-strong"
        >
          ถัดไป
        </button>
      </div>

      {viewing ? (
        <PhotoViewer
          photos={viewing.photos}
          index={viewing.index}
          staffName={viewing.staffName}
          onIndexChange={(index) => setViewing({ ...viewing, index })}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </div>
  );
}
