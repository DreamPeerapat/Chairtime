import Link from 'next/link';
import { Badge, Card, PageBody, PageHeader } from '@/components/ui/page';
import { ShopProfileForm } from './shop-profile-form';
import { BookingPolicyForm, type BookingPolicy } from './booking-policy-form';
import { CopyField } from './copy-field';
import { TemplatePicker, type ShopTemplate } from './template-picker';

interface Props {
  role: string;
  tenant: {
    name: string;
    slug: string;
    businessType: string;
    timezone: string;
    phone: string | null;
    address: string | null;
    latitude: string | null;
    longitude: string | null;
  };
  policy: BookingPolicy;
  /**
   * Built on the server from NEXT_PUBLIC_APP_URL. It used to come off
   * `window.location.origin` here — a bare path on the server and a full URL
   * in the browser, so this page threw a hydration mismatch on every load.
   */
  bookingUrl: string;
  hasServices: boolean;
  templates: ShopTemplate[];
  lineConnected: boolean;
  liffId: string | null;
  /** null when the loader could not resolve one — the card is then hidden */
  billing: { label: string; detail: string; lapsed: boolean } | null;
  children?: React.ReactNode;
}

/**
 * Everything about the shop that is not a booking.
 *
 * Reorganised around what a shop comes here to do. The two questions asked
 * most — "is my LINE connected" and "what am I paying" — were four and two
 * scrolls down a single ribbon of identical bordered boxes; they are now a
 * pair of status cards at the top that answer in one word each, with the
 * link to the page that changes them. The booking link, which is the thing a
 * shop is here to *fetch* rather than read, comes next and has a copy button
 * instead of select-all text. The long forms follow, in the order a shop
 * fills them.
 *
 * No longer a client component: the state it used to own went with the
 * template picker, and everything left is a form or a link.
 */
export function SettingsView(props: Props) {
  return (
    <PageBody className="gap-5">
      <PageHeader
        title="ตั้งค่า"
        description="ข้อมูลร้านที่ลูกค้าเห็น การเชื่อม LINE ของร้าน และเทมเพลตบริการ"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card title="LINE ของร้าน">
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={props.lineConnected ? 'brand' : 'warn'}>
                {props.lineConnected ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อม'}
              </Badge>
              {props.lineConnected && props.liffId ? (
                <span className="truncate text-xs text-muted">LIFF ID: {props.liffId}</span>
              ) : null}
            </div>

            <p className="text-xs leading-relaxed text-muted">
              {props.lineConnected
                ? props.liffId
                  ? 'ลูกค้าจองผ่าน LINE ของร้านได้แล้ว'
                  : 'เชื่อมแล้วแต่ยังไม่ได้ตั้ง LIFF ID'
                : 'การแจ้งเตือนจะถูกเก็บไว้ในคิวจนกว่าจะเชื่อมต่อ แล้วจะทยอยส่งให้เอง'}
            </p>

            <Link
              href="/dashboard/settings/line"
              className="ct-press inline-flex h-11 w-fit items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-muted"
            >
              {props.lineConnected ? 'จัดการการเชื่อมต่อ' : 'เชื่อมต่อ LINE OA'}
            </Link>
          </div>
        </Card>

        {props.billing ? (
          <Card
            title="แพ็กเกจ"
            className={props.billing.lapsed ? 'border-red-300 dark:border-red-900' : undefined}
          >
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={props.billing.lapsed ? 'danger' : 'brand'}>
                  {props.billing.label}
                </Badge>
              </div>

              <p className="text-xs leading-relaxed text-muted">{props.billing.detail}</p>

              <Link
                href="/dashboard/billing"
                className="ct-press inline-flex h-11 w-fit items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface-muted"
              >
                ดูแพ็กเกจและต่ออายุ
              </Link>
            </div>
          </Card>
        ) : null}
      </div>

      <Card
        title="ลิงก์จองของร้าน"
        description="ส่งลิงก์นี้ให้ลูกค้า หรือใส่ในเมนู LINE Official Account"
      >
        <CopyField value={props.bookingUrl} label="ลิงก์จอง" />
      </Card>

      <Card title="ข้อมูลร้าน" description="ชื่อ เบอร์ และที่อยู่ที่ลูกค้าเห็นบนหน้าจอง">
        <ShopProfileForm
          name={props.tenant.name}
          phone={props.tenant.phone}
          address={props.tenant.address}
          latitude={props.tenant.latitude}
          longitude={props.tenant.longitude}
        />
      </Card>

      <Card title="นโยบายการจอง" description="ลูกค้าจองล่วงหน้าได้แค่ไหน และยกเลิกได้ถึงเมื่อไร">
        <BookingPolicyForm policy={props.policy} />
      </Card>

      {props.role === 'owner' ? (
        <TemplatePicker templates={props.templates} hasServices={props.hasServices} />
      ) : null}

      {props.children}
    </PageBody>
  );
}
