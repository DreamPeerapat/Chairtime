import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { signBody, verifySignature } from '@/lib/line/signature';
import {
  bookingConfirmedMessage,
  contactMessage,
  formatThaiDate,
  formatThaiTimeRange,
  helpMessage,
  myBookingsMessage,
  reminder24hMessage,
  reminder2hMessage,
} from '@/lib/line/messages';
import { dedupeKey, REMINDER_OFFSETS } from '@/lib/notifications/templates';
import type { BookingMessageData } from '@/lib/line/messages';

const ZONE = 'Asia/Bangkok';
const SECRET = 'test-channel-secret';

function bookingData(overrides: Partial<BookingMessageData> = {}): BookingMessageData {
  return {
    shopName: 'The Hair ทองหล่อ',
    bookingCode: 'A7K2Q9',
    startsAt: DateTime.fromISO('2026-03-16T10:00', { zone: ZONE }),
    endsAt: DateTime.fromISO('2026-03-16T11:40', { zone: ZONE }),
    serviceNames: ['ย้อมผม'],
    staffName: 'ช่างโอ๊ต',
    total: '1800.00',
    manageUrl: 'https://example.test/thehair/booking/A7K2Q9',
    ...overrides,
  };
}

describe('webhook signature', () => {
  it('accepts a body signed with the channel secret', () => {
    const body = JSON.stringify({ events: [] });
    expect(verifySignature(body, signBody(body, SECRET), SECRET)).toBe(true);
  });

  it('rejects a body that was altered after signing', () => {
    const body = JSON.stringify({ events: [] });
    const signature = signBody(body, SECRET);
    expect(verifySignature(`${body} `, signature, SECRET)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    const body = 'hello';
    expect(verifySignature(body, signBody(body, 'other-secret'), SECRET)).toBe(false);
  });

  it('rejects a missing or malformed signature header', () => {
    expect(verifySignature('hello', null, SECRET)).toBe(false);
    expect(verifySignature('hello', 'not-base64!!', SECRET)).toBe(false);
  });

  it('is sensitive to the exact bytes, not the parsed JSON', () => {
    // LINE sends pretty-printed JSON; re-serialising drops the whitespace and
    // the signature must break, which is why the route signs request.text().
    const original = '{\n  "destination": "U1",\n  "events": []\n}';
    const reserialised = JSON.stringify(JSON.parse(original));
    const signature = signBody(original, SECRET);
    expect(verifySignature(original, signature, SECRET)).toBe(true);
    expect(reserialised).not.toBe(original);
    expect(verifySignature(reserialised, signature, SECRET)).toBe(false);
  });
});

describe('Thai date formatting', () => {
  it('uses Thai day names, month abbreviations and the Buddhist year', () => {
    const monday = DateTime.fromISO('2026-03-16T10:00', { zone: ZONE });
    expect(formatThaiDate(monday)).toBe('จันทร์ 16 มี.ค. 2569');
  });

  it('formats a time range with the Thai time particle', () => {
    const data = bookingData();
    expect(formatThaiTimeRange(data.startsAt, data.endsAt)).toBe('10:00 - 11:40 น.');
  });

  it('formats in the tenant timezone, not the server one', () => {
    const utc = DateTime.fromISO('2026-03-16T22:00Z');
    expect(formatThaiDate(utc.setZone(ZONE))).toBe('อังคาร 17 มี.ค. 2569');
  });
});

describe('Flex message builders', () => {
  it('puts every booking detail in the confirmation', () => {
    const message = bookingConfirmedMessage(bookingData());
    const json = JSON.stringify(message);

    expect(message.type).toBe('flex');
    expect(message.altText).toContain('A7K2Q9');
    for (const expected of ['A7K2Q9', 'ย้อมผม', 'ช่างโอ๊ต', '1800.00', 'จันทร์ 16 มี.ค. 2569', '10:00 - 11:40']) {
      expect(json).toContain(expected);
    }
  });

  it('offers a manage button only when there is a URL', () => {
    expect(JSON.stringify(bookingConfirmedMessage(bookingData()))).toContain('ยกเลิกคิว');
    const withoutUrl = bookingConfirmedMessage(bookingData({ manageUrl: null }));
    expect(JSON.stringify(withoutUrl)).not.toContain('ยกเลิกคิว');
  });

  it('omits the stylist line when nobody is assigned', () => {
    const json = JSON.stringify(bookingConfirmedMessage(bookingData({ staffName: null })));
    expect(json).not.toContain('ช่าง"');
  });

  it('gives each reminder its own alt text, so the push preview is useful', () => {
    const data = bookingData();
    expect(reminder24hMessage(data).altText).toContain('พรุ่งนี้');
    expect(reminder2hMessage(data).altText).toContain('2 ชั่วโมง');
  });
});

describe('"คิวของฉัน" reply', () => {
  it('shows the next booking and counts the rest', () => {
    const reply = myBookingsMessage('The Hair ทองหล่อ', [bookingData(), bookingData(), bookingData()]);
    expect(reply.type).toBe('flex');
    expect(JSON.stringify(reply)).toContain('และมีอีก 2 คิว');
  });

  it('falls back to plain text when there is nothing booked', () => {
    const reply = myBookingsMessage('The Hair ทองหล่อ', [], 'https://example.test/book');
    expect(reply.type).toBe('text');
    expect(JSON.stringify(reply)).toContain('ยังไม่มีคิว');
    expect(JSON.stringify(reply)).toContain('quickReply');
  });
});

describe('help and contact replies', () => {
  it('lists the commands the webhook understands', () => {
    const text = helpMessage('ร้านทดสอบ', 'https://example.test/book').text;
    expect(text).toContain('คิวของฉัน');
    expect(text).toContain('จองคิว');
    expect(text).toContain('ติดต่อ');
  });

  it('leaves out lines the shop has not filled in', () => {
    expect(contactMessage('ร้านทดสอบ', null, null).text).toBe('ร้านทดสอบ');
    expect(contactMessage('ร้านทดสอบ', '02-111-2233', null).text).toContain('โทร 02-111-2233');
  });
});

describe('notification scheduling', () => {
  it('uses the offsets from docs/logic.md §5', () => {
    expect(REMINDER_OFFSETS.reminder_24h?.minutesBefore).toBe(1440);
    expect(REMINDER_OFFSETS.reminder_2h?.minutesBefore).toBe(120);
  });

  it('builds a dedupe key that is stable for the same booking and template', () => {
    expect(dedupeKey('reminder_24h', 'booking', 'abc')).toBe('reminder_24h:booking:abc');
    expect(dedupeKey('reminder_24h', 'booking', 'abc')).toBe(dedupeKey('reminder_24h', 'booking', 'abc'));
    expect(dedupeKey('reminder_2h', 'booking', 'abc')).not.toBe(dedupeKey('reminder_24h', 'booking', 'abc'));
  });
});
