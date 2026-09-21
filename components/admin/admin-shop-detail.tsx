import Link from 'next/link';
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import type { ShopDetail } from '@/lib/admin/platform';
import { statusLabel } from '@/components/booking/format';

/**
 * One shop, read-only, plus the way into its dashboard.
 *
 * Everything here is a summary rather than an editor. The editors already
 * exist — they are the shop's own screens — so the button below sends the
 * operator into them instead of growing a second set that would drift.
 */
export function AdminShopDetail({
  shop,
  onOpen,
}: {
  shop: ShopDetail;
  onOpen: () => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin" className="text-xs text-muted underline">
          ← กลับไปรายชื่อร้าน
        </Link>
        <h1 className="mt-2 text-lg font-semibold">{shop.name}</h1>
        <p className="font-mono text-xs text-muted">/{shop.slug}</p>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="ช่าง" value={String(shop.staffCount)} />
        <Stat label="บริการ" value={String(shop.serviceCount)} />
        <Stat label="ลูกค้า" value={String(shop.customerCount)} />
        <Stat label="คิว 30 วัน" value={String(shop.bookingsLast30)} />
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">ข้อมูลร้าน</h2>
        <dl className="flex flex-col gap-1.5 rounded-xl border border-line px-4 py-3 text-sm">
          <Row label="สถานะ" value={shop.status} />
          <Row label="ตั้งค่าเสร็จแล้ว" value={shop.onboardedAt ? 'ใช่' : 'ยังไม่เสร็จ'} />
          <Row label="LINE OA" value={shop.lineConnected ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม'} />
          <Row label="โซนเวลา" value={shop.timezone} />
          <Row label="เบอร์โทร" value={shop.phone ?? '—'} />
          <Row label="ที่อยู่" value={shop.address ?? '—'} />
          <Row label="สมัครเมื่อ" value={full(shop.createdAt)} />
        </dl>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">
          ช่าง ({shop.staff.length})
        </h2>
        {shop.staff.length === 0 ? (
          <Empty>ยังไม่มีช่าง</Empty>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shop.staff.map((person) => (
              <li
                key={person.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5 text-sm"
              >
                <span className="truncate">{person.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  {person.serviceCount} บริการ
                  {person.isActive ? '' : ' · ปิดอยู่'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">
          บริการ ({shop.services.length})
        </h2>
        {shop.services.length === 0 ? (
          <Empty>ยังไม่มีบริการ — ร้านนี้ยังใช้งานจริงไม่ได้</Empty>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shop.services.map((service) => (
              <li
                key={service.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5 text-sm"
              >
                <span className="truncate">{service.name}</span>
                <span className="shrink-0 text-xs text-muted">
                  ฿{Number(service.price).toLocaleString('th-TH', { maximumFractionDigits: 0 })}
                  {service.isActive ? '' : ' · ปิดอยู่'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted">คิวล่าสุด</h2>
        {shop.recentBookings.length === 0 ? (
          <Empty>ยังไม่เคยมีคิว</Empty>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {shop.recentBookings.map((booking) => {
              const status = statusLabel(booking.status);
              return (
                <li
                  key={booking.code}
                  className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-2.5 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{booking.customerName ?? 'ไม่มีชื่อ'}</span>
                    <span className="font-mono text-[11px] text-muted">{booking.code}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px]', status.tone)}>
                      {status.label}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {full(booking.startsAt, shop.timezone)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 border-t border-line pt-4">
        <h2 className="text-sm font-medium text-muted">
          เข้าไปจัดการร้านนี้
        </h2>
        <p className="text-xs text-muted">
          เปิดหลังบ้านของร้านนี้ด้วยหน้าจอเดียวกับที่ร้านใช้ — แก้บริการ ช่าง เวลาทำการ และคิวได้
          ยกเว้นหน้าแพ็กเกจซึ่งเข้าไม่ได้ ระหว่างนั้นจะมีแถบบอกอยู่ตลอดว่ากำลังดูร้านไหน
        </p>
        <form action={onOpen}>
          <button
            type="submit"
            className="ct-press w-fit rounded-xl bg-[#1b2827] px-5 py-2.5 text-sm font-medium text-white"
          >
            เปิดหลังบ้านของ {shop.name}
          </button>
        </form>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-line px-4 py-3 text-sm text-muted">
      {children}
    </p>
  );
}

function full(iso: string, zone = 'Asia/Bangkok'): string {
  return DateTime.fromISO(iso).setZone(zone).toFormat('d LLL yy HH:mm', { locale: 'th' });
}
