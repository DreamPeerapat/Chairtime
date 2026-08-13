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

const THAI_MONTHS = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];
const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

/** "จันทร์ 16 มี.ค. 2569" — Thai day, month abbreviation and Buddhist year. */
export function formatThaiDate(dt: DateTime): string {
  const day = THAI_DAYS[dt.weekday % 7];
  const month = THAI_MONTHS[dt.month - 1];
  return `${day} ${dt.day} ${month} ${dt.year + 543}`;
}

export function formatThaiTimeRange(start: DateTime, end: DateTime): string {
  return `${start.toFormat('HH:mm')} - ${end.toFormat('HH:mm')} น.`;
}

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
