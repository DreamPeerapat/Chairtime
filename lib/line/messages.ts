/**
 * Flex message templates from docs/logic.md §5.
 *
 * Pure builders: they take plain data and return the JSON LINE expects. No
 * database, no clock — the caller has already resolved everything, which keeps
 * the copy easy to test and easy to change without touching the send path.
 *
 * Customer-facing text is Thai. Times are formatted in the tenant's timezone by
 * the caller passing an already-zoned DateTime.
 */
import type { DateTime } from 'luxon';
import { thaiDateShort, thaiTimeRange } from '@/lib/time/thai';
import type { FlexBubble, FlexComponent, LineFlexMessage, LineTextMessage } from './types';

const BRAND = '#0f766e';
const MUTED = '#64748b';
const WARN = '#b45309';

export interface BookingMessageData {
  shopName: string;
  bookingCode: string;
  startsAt: DateTime;
  endsAt: DateTime;
  serviceNames: string[];
  staffName: string | null;
  total: string;
  /** LIFF or web URL where the customer can manage this booking */
  manageUrl?: string | null;
}

/** Re-exported so the message templates and the screens cannot drift apart. */
export const formatThaiDate = thaiDateShort;
export const formatThaiTimeRange = thaiTimeRange;

function detailRows(data: BookingMessageData): FlexComponent[] {
  const rows: Array<[string, string]> = [
    ['วันที่', formatThaiDate(data.startsAt)],
    ['เวลา', formatThaiTimeRange(data.startsAt, data.endsAt)],
    ['บริการ', data.serviceNames.join(', ')],
  ];
  if (data.staffName) rows.push(['ช่าง', data.staffName]);
  rows.push(['ราคา', `${data.total} บาท`]);
  rows.push(['รหัสจอง', data.bookingCode]);

  return rows.map(([label, value]) => ({
    type: 'box',
    layout: 'baseline',
    spacing: 'sm',
    contents: [
      { type: 'text', text: label, color: MUTED, size: 'sm', flex: 2 },
      { type: 'text', text: value, wrap: true, size: 'sm', flex: 5 },
    ],
  }));
}

function bubble(
  title: string,
  headerColor: string,
  data: BookingMessageData,
  footerNote?: string,
): FlexBubble {
  const footer: FlexComponent[] = [];
  if (data.manageUrl) {
    footer.push({
      type: 'button',
      style: 'primary',
      height: 'sm',
      color: BRAND,
      action: { type: 'uri', label: 'ดู / เลื่อน / ยกเลิกคิว', uri: data.manageUrl },
    });
  }
  if (footerNote) {
    footer.push({ type: 'text', text: footerNote, size: 'xs', color: MUTED, wrap: true, margin: 'md' });
  }

  return {
    type: 'bubble',
    header: {
      type: 'box',
      layout: 'vertical',
      paddingAll: '16px',
      backgroundColor: headerColor,
      contents: [
        { type: 'text', text: title, color: '#ffffff', weight: 'bold', size: 'lg' },
        { type: 'text', text: data.shopName, color: '#e2e8f0', size: 'sm', margin: 'xs' },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'md',
      paddingAll: '16px',
      contents: detailRows(data),
    },
    ...(footer.length > 0
      ? { footer: { type: 'box' as const, layout: 'vertical' as const, paddingAll: '16px', contents: footer } }
      : {}),
  };
}

export function bookingConfirmedMessage(data: BookingMessageData): LineFlexMessage {
  return {
    type: 'flex',
    altText: `ยืนยันการจอง ${data.bookingCode} — ${formatThaiDate(data.startsAt)} ${data.startsAt.toFormat('HH:mm')} น.`,
    contents: bubble('จองสำเร็จแล้ว', BRAND, data, 'กรุณามาก่อนเวลานัด 5-10 นาที'),
  };
}

export function reminder24hMessage(data: BookingMessageData): LineFlexMessage {
  return {
    type: 'flex',
    altText: `พรุ่งนี้มีนัดที่ ${data.shopName} เวลา ${data.startsAt.toFormat('HH:mm')} น.`,
    contents: bubble('พรุ่งนี้มีนัดนะคะ', BRAND, data, 'ถ้ามาไม่ได้ รบกวนแจ้งล่วงหน้าด้วยนะคะ'),
  };
}

export function reminder2hMessage(data: BookingMessageData): LineFlexMessage {
  return {
    type: 'flex',
    altText: `อีก 2 ชั่วโมงถึงคิวของคุณที่ ${data.shopName}`,
    contents: bubble('อีก 2 ชั่วโมงถึงคิวค่ะ', WARN, data, 'เจอกันเร็วๆ นี้ค่ะ'),
  };
}

export function bookingCancelledMessage(data: BookingMessageData): LineFlexMessage {
  return {
    type: 'flex',
    altText: `ยกเลิกการจอง ${data.bookingCode} แล้ว`,
    contents: bubble('ยกเลิกคิวแล้ว', MUTED, data, 'จองใหม่ได้ตลอดเวลาค่ะ'),
  };
}

/** The reply to "คิวของฉัน". A reply message, so it costs no quota. */
export function myBookingsMessage(
  shopName: string,
  bookings: BookingMessageData[],
  bookingUrl?: string | null,
): LineFlexMessage | LineTextMessage {
  if (bookings.length === 0) {
    return {
      type: 'text',
      text: `ตอนนี้คุณยังไม่มีคิวที่ ${shopName} ค่ะ`,
      ...(bookingUrl
        ? {
            quickReply: {
              items: [
                { type: 'action', action: { type: 'uri', label: 'จองคิว', uri: bookingUrl } },
              ],
            },
          }
        : {}),
    };
  }

  const next = bookings[0]!;
  const laterCount = bookings.length - 1;
  return {
    type: 'flex',
    altText: `คิวถัดไปของคุณ: ${formatThaiDate(next.startsAt)} ${next.startsAt.toFormat('HH:mm')} น.`,
    contents: bubble(
      'คิวถัดไปของคุณ',
      BRAND,
      next,
      laterCount > 0 ? `และมีอีก ${laterCount} คิวหลังจากนี้` : undefined,
    ),
  };
}

export function helpMessage(shopName: string, bookingUrl?: string | null): LineTextMessage {
  return {
    type: 'text',
    text: [
      `สวัสดีค่ะ นี่คือ ${shopName}`,
      '',
      'พิมพ์ข้อความเหล่านี้ได้เลยค่ะ',
      '• "คิวของฉัน" — ดูคิวที่จองไว้',
      '• "จองคิว" — เปิดหน้าจอง',
      '• "แต้มของฉัน" — ดูแต้มสะสม',
      '• "ติดต่อ" — ข้อมูลติดต่อร้าน',
    ].join('\n'),
    ...(bookingUrl
      ? {
          quickReply: {
            items: [
              { type: 'action', action: { type: 'message', label: 'คิวของฉัน', text: 'คิวของฉัน' } },
              { type: 'action', action: { type: 'uri', label: 'จองคิว', uri: bookingUrl } },
            ],
          },
        }
      : {}),
  };
}

export function contactMessage(shopName: string, phone: string | null, address: string | null): LineTextMessage {
  const lines = [shopName];
  if (phone) lines.push(`โทร ${phone}`);
  if (address) lines.push(address);
  return { type: 'text', text: lines.join('\n') };
}

/** docs/logic.md §5 "points_earned" — "หลังจบงาน บอกแต้มคงเหลือด้วย". */
export function pointsEarnedMessage(data: { shopName: string; points: number; balance: number }): LineTextMessage {
  return {
    type: 'text',
    text: [
      `ได้รับ ${data.points} แต้มจาก ${data.shopName} ค่ะ`,
      `แต้มคงเหลือ ${data.balance} แต้ม`,
    ].join('\n'),
  };
}

/** Reply to "แต้มของฉัน", with an optional link to the full LIFF points page. */
export function myPointsMessage(data: {
  shopName: string;
  balance: number;
  nextExpiry: { points: number; expiresAt: DateTime } | null;
  pointsUrl?: string | null;
}): LineTextMessage {
  const lines = [`แต้มของคุณที่ ${data.shopName}`, `คงเหลือ ${data.balance} แต้ม`];
  if (data.nextExpiry) {
    lines.push(`${data.nextExpiry.points} แต้มจะหมดอายุ ${formatThaiDate(data.nextExpiry.expiresAt)}`);
  }
  return {
    type: 'text',
    text: lines.join('\n'),
    ...(data.pointsUrl
      ? {
          quickReply: {
            items: [{ type: 'action', action: { type: 'uri', label: 'ดูหน้าแต้ม', uri: data.pointsUrl } }],
          },
        }
      : {}),
  };
}

/** docs/logic.md §5 "points_expiring" — sent once, 30 days before a lot expires. */
export function pointsExpiringMessage(data: { shopName: string; points: number; expiresAt: DateTime }): LineTextMessage {
  return {
    type: 'text',
    text: [
      `แต้ม ${data.points} แต้มจาก ${data.shopName} กำลังจะหมดอายุ`,
      `วันที่ ${formatThaiDate(data.expiresAt)}`,
      'ใช้ก่อนหมดอายุนะคะ',
    ].join('\n'),
  };
}

/** docs/logic.md §3.5 — "เลื่อนขึ้น → ทำทันที + ส่ง LINE แสดงความยินดี". */
export function tierUpMessage(data: { shopName: string; tierName: string }): LineTextMessage {
  return {
    type: 'text',
    text: [`ยินดีด้วยค่ะ! คุณได้เลื่อนขั้นเป็นระดับ ${data.tierName}`, `ที่ ${data.shopName}`].join('\n'),
  };
}

/** docs/logic.md §3.5 — the 30-day grace-period warning before a demotion actually happens. */
export function tierAtRiskMessage(data: { shopName: string; tierName: string; deadline: DateTime }): LineTextMessage {
  return {
    type: 'text',
    text: [
      `ระดับสมาชิก ${data.tierName} ของคุณที่ ${data.shopName} กำลังจะหมดสิทธิ์`,
      `กลับมาใช้บริการก่อน ${formatThaiDate(data.deadline)} เพื่อรักษาระดับไว้นะคะ`,
    ].join('\n'),
  };
}

/** docs/roadmap.md Phase 6 "โบนัสวันเกิด". */
export function birthdayMessage(data: { shopName: string; points: number }): LineTextMessage {
  return {
    type: 'text',
    text: [`สุขสันต์วันเกิดค่ะ 🎂`, `${data.shopName} มอบ ${data.points} แต้มให้เป็นของขวัญ`].join('\n'),
  };
}
