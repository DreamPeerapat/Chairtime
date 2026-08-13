'use client';

/**
 * Staff, chairs/beds, working hours and time off.
 *
 * Three tabs rather than three pages: a shop setting itself up moves between
 * these constantly, and docs/roadmap.md wants a new shop configured in 15
 * minutes without touching the database.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import { createTimeOff, deleteTimeOff, saveHours, saveResource } from '@/lib/admin/actions';
import { thaiDayMonth } from '@/components/booking/format';

const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export interface AdminResource {
  id: string;
  name: string;
  bio: string | null;
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
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">ช่างและที่นั่ง</h1>

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
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'people' ? <PeopleTab {...props} /> : null}
      {tab === 'hours' ? <HoursTab {...props} /> : null}
      {tab === 'timeoff' ? <TimeOffTab {...props} /> : null}
    </div>
  );
}

function PeopleTab({ resources, resourceTypes, services }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminResource | 'new' | null>(null);

  const humans = resources.filter((r) => r.isHuman);
  const spaces = resources.filter((r) => !r.isHuman);

  return (
    <div className="flex flex-col gap-5">
      <Group
        title="ช่าง"
        items={humans}
        services={services}
        onEdit={setEditing}
        onAdd={() => setEditing('new')}
      />
      <Group title="ที่นั่ง / เตียง / ห้อง" items={spaces} services={services} onEdit={setEditing} />

      {editing ? (
        <ResourceForm
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

function Group({
  title,
  items,
  services,
  onEdit,
  onAdd,
}: {
  title: string;
  items: AdminResource[];
  services: Array<{ id: string; name: string }>;
  onEdit: (r: AdminResource) => void;
  onAdd?: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">{title}</h2>
        {onAdd ? (
          <button type="button" onClick={onAdd} className="text-xs text-teal-700 dark:text-teal-400">
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
                'w-full rounded-xl border px-4 py-3 text-left',
                resource.isActive
                  ? 'border-slate-200 dark:border-slate-800'
                  : 'border-dashed border-slate-300 opacity-60 dark:border-slate-700',
              )}
            >
              <span className="block text-sm font-medium">
                {resource.name}
                {!resource.isActive ? <span className="ml-2 text-xs text-slate-400">ปิดอยู่</span> : null}
                {resource.isHuman && !resource.isBookable ? (
                  <span className="ml-2 text-xs text-slate-400">ลูกค้าเลือกไม่ได้</span>
                ) : null}
              </span>
              {resource.isHuman ? (
                <span className="mt-0.5 block text-xs text-slate-500">
                  {resource.serviceIds.length === 0
                    ? 'ยังไม่ได้กำหนดว่าทำบริการอะไรได้ — จะไม่ถูกจัดคิวให้'
                    : `ทำได้ ${resource.serviceIds.length} บริการ`}
                  {resource.hours.length > 0 ? ` · มีเวลาทำงานเฉพาะตัว` : ''}
                </span>
              ) : null}
            </button>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
            ยังไม่มีข้อมูล
          </li>
        ) : null}
      </ul>
      {services.length === 0 ? null : null}
    </section>
  );
}

function ResourceForm({
  resource,
  resourceTypes,
  services,
  onClose,
  onSaved,
}: {
  resource: AdminResource | null;
  resourceTypes: Props['resourceTypes'];
  services: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [typeId, setTypeId] = useState(resource?.typeId ?? resourceTypes[0]?.id ?? '');
  const [selectedServices, setSelectedServices] = useState<string[]>(resource?.serviceIds ?? []);

  const isHuman = resourceTypes.find((t) => t.id === typeId)?.isHuman ?? false;

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await saveResource({
        id: resource?.id,
        resourceTypeId: typeId,
        name: formData.get('name'),
        bio: formData.get('bio') || null,
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
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">ประเภท</span>
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
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">ชื่อ</span>
          <input name="name" required defaultValue={resource?.name ?? ''} className={inputClass} />
        </label>

        {isHuman ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              แนะนำตัว (ลูกค้าเห็น)
            </span>
            <input name="bio" defaultValue={resource?.bio ?? ''} className={inputClass} />
          </label>
        ) : null}

        {isHuman ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
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
                        ? 'border-teal-600 bg-teal-700 text-white'
                        : 'border-slate-200 dark:border-slate-700',
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

function HoursTab({ resources, shopHours }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState<string | null>(null); // null = whole shop
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const current =
    target === null
      ? shopHours.map((h) => ({ weekday: h.weekday, openTime: h.openTime, closeTime: h.closeTime }))
      : (resources.find((r) => r.id === target)?.hours ?? []);

  const [rows, setRows] = useState(() => toEditable(current));

  function switchTarget(next: string | null) {
    setTarget(next);
    const hours =
      next === null
        ? shopHours.map((h) => ({ weekday: h.weekday, openTime: h.openTime, closeTime: h.closeTime }))
        : (resources.find((r) => r.id === next)?.hours ?? []);
    setRows(toEditable(hours));
    setError(null);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const payload = rows
        .filter((r) => r.open)
        .map((r) => ({ weekday: r.weekday, openTime: r.openTime, closeTime: r.closeTime }));
      const result = await saveHours({ resourceId: target, rows: payload });
      if (result.ok) router.refresh();
      else setError(result.error ?? 'บันทึกไม่สำเร็จ');
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => switchTarget(null)}
          className={cn('rounded-lg border px-3 py-1.5 text-xs', target === null ? activeChip : idleChip)}
        >
          ทั้งร้าน
        </button>
        {resources
          .filter((r) => r.isHuman && r.isActive)
          .map((person) => (
            <button
              key={person.id}
              type="button"
              onClick={() => switchTarget(person.id)}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-xs',
                target === person.id ? activeChip : idleChip,
              )}
            >
              {person.name}
            </button>
          ))}
      </div>

      <p className="text-xs text-slate-500">
        {target === null
          ? 'เวลาเปิด-ปิดของร้าน ใช้กับทุกคนที่ไม่ได้ตั้งเวลาเฉพาะตัว'
          : 'ถ้าไม่ติ๊กวันไหนเลย คนนี้จะใช้เวลาของร้านแทน'}
      </p>

      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <li key={row.weekday} className="flex items-center gap-2">
            <label className="flex w-28 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={row.open}
                onChange={(e) =>
                  setRows((prev) =>
                    prev.map((r, i) => (i === index ? { ...r, open: e.target.checked } : r)),
                  )
                }
                className="h-4 w-4"
              />
              {WEEKDAYS[row.weekday]}
            </label>
            <input
              type="time"
              value={row.openTime}
              disabled={!row.open}
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((r, i) => (i === index ? { ...r, openTime: e.target.value } : r)),
                )
              }
              className={cn(inputClass, 'w-28')}
            />
            <span className="text-slate-400">–</span>
            <input
              type="time"
              value={row.closeTime}
              disabled={!row.open}
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((r, i) => (i === index ? { ...r, closeTime: e.target.value } : r)),
                )
              }
              className={cn(inputClass, 'w-28')}
            />
          </li>
        ))}
      </ul>

      <p className="text-xs text-slate-400">
        พักเที่ยงให้ตั้งเวลาปิดตอนเที่ยง แล้วเพิ่มช่วงบ่ายผ่านผู้ดูแลระบบ — หน้านี้รองรับหนึ่งช่วงต่อวัน
      </p>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <button type="button" onClick={save} disabled={pending} className={primaryButton}>
        {pending ? 'กำลังบันทึก…' : 'บันทึกเวลาทำการ'}
      </button>
    </div>
  );
}

function toEditable(hours: Array<{ weekday: number; openTime: string; closeTime: string }>) {
  return Array.from({ length: 7 }, (_, weekday) => {
    const match = hours.find((h) => h.weekday === weekday);
    return {
      weekday,
      open: !!match,
      openTime: match?.openTime.slice(0, 5) ?? '10:00',
      closeTime: match?.closeTime.slice(0, 5) ?? '20:00',
    };
  });
}

function TimeOffTab({ resources, timeOff, timezone }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function add(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const resourceId = String(formData.get('resourceId') ?? '');
      const startDate = String(formData.get('startDate') ?? '');
      const endDate = String(formData.get('endDate') ?? '');
      if (!startDate || !endDate) {
        setError('กรุณาเลือกวันที่');
        return;
      }

      // Whole days, in the shop's timezone: the end is exclusive, so a one-day
      // leave runs to the start of the next day.
      const start = DateTime.fromISO(startDate, { zone: timezone }).startOf('day');
      const end = DateTime.fromISO(endDate, { zone: timezone }).startOf('day').plus({ days: 1 });

      const result = await createTimeOff({
        resourceId: resourceId || null,
        start: start.toISO(),
        end: end.toISO(),
        reason: formData.get('reason') || null,
      });
      if (result.ok) router.refresh();
      else setError(result.error ?? 'บันทึกไม่สำเร็จ');
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteTimeOff({ id });
      router.refresh();
    });
  }

  const today = DateTime.now().setZone(timezone).toISODate()!;

  return (
    <div className="flex flex-col gap-5">
      <form action={add} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <h2 className="text-sm font-medium">เพิ่มวันลา / ปิดร้าน</h2>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">ใคร</span>
          <select name="resourceId" className={inputClass}>
            <option value="">ปิดทั้งร้าน</option>
            {resources
              .filter((r) => r.isHuman && r.isActive)
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">ตั้งแต่</span>
            <input type="date" name="startDate" required defaultValue={today} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">ถึง</span>
            <input type="date" name="endDate" required defaultValue={today} className={inputClass} />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">เหตุผล</span>
          <input name="reason" placeholder="เช่น ลาพักร้อน, ปิดปรับปรุงร้าน" className={inputClass} />
        </label>

        {error ? <ErrorText>{error}</ErrorText> : null}

        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? 'กำลังบันทึก…' : 'เพิ่ม'}
        </button>
      </form>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400">ที่กำหนดไว้</h2>
        {timeOff.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
            ยังไม่มีวันลา
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {timeOff.map((off) => {
              const person = resources.find((r) => r.id === off.resourceId);
              const start = DateTime.fromISO(off.start).setZone(timezone);
              const end = DateTime.fromISO(off.end).setZone(timezone).minus({ minutes: 1 });
              return (
                <li
                  key={off.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800"
                >
                  <div>
                    <p className="text-sm font-medium">{person?.name ?? 'ปิดทั้งร้าน'}</p>
                    <p className="text-xs text-slate-500">
                      {thaiDayMonth(start)}
                      {start.hasSame(end, 'day') ? '' : ` – ${thaiDayMonth(end)}`}
                      {off.reason ? ` · ${off.reason}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(off.id)}
                    disabled={pending}
                    className="text-xs text-red-600 disabled:opacity-50"
                  >
                    ลบ
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 dark:bg-slate-900 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {children}
    </p>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900 disabled:opacity-50';
const primaryButton =
  'flex-1 rounded-xl bg-teal-700 py-3 text-sm font-medium text-white disabled:opacity-40';
const secondaryButton =
  'rounded-xl border border-slate-200 px-5 py-3 text-sm dark:border-slate-800';
const activeChip = 'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900';
const idleChip = 'border-slate-200 dark:border-slate-700';
