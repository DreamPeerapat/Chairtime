'use client';

/**
 * Staff, chairs/beds, working hours and time off.
 *
 * Three tabs rather than three pages: a shop setting itself up moves between
 * these constantly, and docs/roadmap.md wants a new shop configured in 15
 * minutes without touching the database.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PageBody, PageHeader } from '@/components/ui/page';
import { HoursTab } from './hours-tab';
import { ResourceForm } from './resource-form';
import { ResourceGroup } from './resource-group';
import { TimeOffTab } from './time-off-tab';

export interface AdminResource {
  id: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  isBookable: boolean;
  isActive: boolean;
  typeId: string;
  typeCode: string;
  typeName: string;
  isHuman: boolean;
  hours: Array<{ weekday: number; openTime: string; closeTime: string }>;
  serviceIds: string[];
}

interface Props {
  timezone: string;
  /** the blob folder a staff photo may be uploaded into */
  tenantId: string;
  resources: AdminResource[];
  resourceTypes: Array<{ id: string; code: string; name: string; isHuman: boolean }>;
  services: Array<{ id: string; name: string }>;
  shopHours: Array<{ id: string; weekday: number; openTime: string; closeTime: string }>;
  timeOff: Array<{ id: string; resourceId: string | null; start: string; end: string; reason: string | null }>;
}

type Tab = 'people' | 'hours' | 'timeoff';

export function ResourceManager(props: Props) {
  const [tab, setTab] = useState<Tab>('people');

  return (
    <PageBody>
      <PageHeader
        title="ช่างและที่นั่ง"
        description="ใครทำงานได้ เก้าอี้มีกี่ตัว ร้านเปิดเวลาไหน และใครลาวันไหน — สามอย่างนี้คือสิ่งที่ระบบใช้คำนวณว่าคิวไหนว่าง"
      />

      <div className="flex gap-1">
        {(
          [
            ['people', 'ช่าง / ที่นั่ง'],
            ['hours', 'เวลาทำการ'],
            ['timeoff', 'วันลา / ปิดร้าน'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm',
              tab === key
                ? 'bg-[#14201f] text-white'
                : 'text-muted hover:bg-surface-muted',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'people' ? <PeopleTab {...props} /> : null}
      {tab === 'hours' ? <HoursTab {...props} /> : null}
      {tab === 'timeoff' ? <TimeOffTab {...props} /> : null}
    </PageBody>
  );
}

function PeopleTab({ tenantId, resources, resourceTypes, services }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminResource | 'new' | null>(null);

  const humans = resources.filter((r) => r.isHuman);
  const spaces = resources.filter((r) => !r.isHuman);

  return (
    <div className="flex flex-col gap-5">
      <ResourceGroup
        title="ช่าง"
        items={humans}
        onEdit={setEditing}
        onAdd={() => setEditing('new')}
      />
      <ResourceGroup title="ที่นั่ง / เตียง / ห้อง" items={spaces} onEdit={setEditing} />

      {editing ? (
        <ResourceForm
          tenantId={tenantId}
          resource={editing === 'new' ? null : editing}
          resourceTypes={resourceTypes}
          services={services}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
