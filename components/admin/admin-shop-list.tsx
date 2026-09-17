import Link from 'next/link';
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';
import type { ShopSummary } from '@/lib/admin/platform';

const TYPE_LABELS: Record<string, string> = {
  nail: 'ร้านเล็บ',
  hair: 'ร้านผม',
  massage: 'นวด/สปา',
  clinic: 'คลินิก',
  other: 'อื่นๆ',
};

/**
 * The operator's list of shops.
 *
 * Ordered newest first and built to answer one question per row: is this shop
 * alive? A shop with services and no bookings in thirty days is one that
 * signed up and gave up, which is the only thing worth acting on at this
 * scale — so the counts are there and the money is not.
 */
export function AdminShopList({
  shops,
  currentTenantId,
}: {
  shops: ShopSummary[];
  currentTenantId: string;
}) {
  const live = shops.filter((s) => s.status === 'active').length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold">แอดมินระบบ</h1>
        <p className="mt-0.5 text-xs text-muted">
          ทุกร้านในระบบ {shops.length} ร้าน · ใช้งานอยู่ {live} ร้าน
        </p>
      </div>

      <p className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs text-muted dark:bg-slate-800">
        หน้านี้ไม่แสดงข้อมูลการชำระเงินของร้าน และเข้าหน้าแพ็กเกจของร้านอื่นไม่ได้
      </p>

      {shops.length === 0 ? (
        <p className="rounded-xl border border-line px-4 py-6 text-center text-sm text-muted">
          ยังไม่มีร้านในระบบ
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shops.map((shop) => (
            <li key={shop.tenantId}>
              <Link
                href={`/admin/${shop.tenantId}`}
                className="ct-press block rounded-xl border border-line px-4 py-3 hover:border-line dark:hover:border-slate-700"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">{shop.name}</span>
                    {shop.tenantId === currentTenantId ? (
                      <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-muted dark:bg-slate-700">
                        ร้านของคุณ
                      </span>
                    ) : null}
                  </span>
                  <StatusChip status={shop.status} onboarded={shop.onboardedAt !== null} />
                </div>

                <p className="mt-0.5 font-mono text-[11px] text-muted">/{shop.slug}</p>

                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                  <Fact label="ประเภท" value={TYPE_LABELS[shop.businessType] ?? shop.businessType} />
                  <Fact label="ช่าง" value={String(shop.staffCount)} />
                  <Fact label="บริการ" value={String(shop.serviceCount)} />
                  <Fact label="ลูกค้า" value={String(shop.customerCount)} />
                  <Fact
                    label="คิว 30 วัน"
                    value={String(shop.bookingsLast30)}
                    warn={shop.bookingsLast30 === 0 && shop.serviceCount > 0}
                  />
                  <Fact label="LINE" value={shop.lineConnected ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม'} />
                </dl>

                <p className="mt-1.5 text-[11px] text-slate-400">
                  สมัคร {short(shop.createdAt)}
                  {shop.lastBookingAt ? ` · จองล่าสุด ${short(shop.lastBookingAt)}` : ' · ยังไม่เคยมีคิว'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Fact({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <span className="flex gap-1">
      <dt>{label}</dt>
      <dd className={cn('font-medium', warn ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700')}>
        {value}
      </dd>
    </span>
  );
}

function StatusChip({ status, onboarded }: { status: string; onboarded: boolean }) {
  // A shop that never finished the wizard is a different problem from one
  // whose subscription lapsed, and both look like "not working" from outside.
  const label = !onboarded
    ? 'ยังตั้งค่าไม่เสร็จ'
    : status === 'active'
      ? 'ใช้งานอยู่'
      : status === 'suspended'
        ? 'หมดอายุ'
        : status === 'pending_payment'
          ? 'รอชำระเงิน'
          : 'ปิดใช้งาน';

  const good = onboarded && status === 'active';
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
        good
          ? 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-200'
          : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
      )}
    >
      {label}
    </span>
  );
}

function short(iso: string): string {
  return DateTime.fromISO(iso).setZone('Asia/Bangkok').toFormat('d LLL yy', { locale: 'th' });
}
