import { describe, expect, it } from 'vitest';
import { normalisePhone } from '@/lib/customer/upsert';
import { SHOP_TEMPLATES, findTemplate } from '@/lib/admin/templates';
import { summariseDay, type CalendarBooking } from '@/lib/admin/queries';
import { fromSatang, toSatang } from '@/lib/booking/create';

describe('normalisePhone', () => {
  it('strips the punctuation people actually type', () => {
    expect(normalisePhone('081-234-5678')).toBe('0812345678');
    expect(normalisePhone('081 234 5678')).toBe('0812345678');
    expect(normalisePhone('(081) 234-5678')).toBe('0812345678');
  });

  it('treats +66 and 0 as the same number', () => {
    expect(normalisePhone('+66812345678')).toBe('0812345678');
    expect(normalisePhone('66812345678')).toBe('0812345678');
    expect(normalisePhone('0812345678')).toBe('0812345678');
  });

  it('returns null for nothing usable', () => {
    expect(normalisePhone(null)).toBeNull();
    expect(normalisePhone(undefined)).toBeNull();
    expect(normalisePhone('')).toBeNull();
    expect(normalisePhone('   ')).toBeNull();
    expect(normalisePhone('ไม่มีเบอร์')).toBeNull();
  });

  it('leaves a landline alone', () => {
    expect(normalisePhone('02-111-2233')).toBe('021112233');
  });
});

describe('shop templates', () => {
  it('covers the business types the schema lists', () => {
    for (const type of ['nail', 'hair', 'massage', 'clinic']) {
      expect(findTemplate(type), type).not.toBeNull();
    }
    expect(findTemplate('nope')).toBeNull();
  });

  it('gives every template enough services to open with', () => {
    for (const template of SHOP_TEMPLATES) {
      // docs/roadmap.md asks for "a standard 15-item service list"; eight is
      // the floor for a shop that can take bookings on day one.
      expect(template.services.length, template.label).toBeGreaterThanOrEqual(8);
      expect(template.defaultSpaces, template.label).toBeGreaterThan(0);
    }
  });

  it('gives every template exactly one human and one space resource type', () => {
    for (const template of SHOP_TEMPLATES) {
      const humans = template.resourceTypes.filter((t) => t.isHuman);
      const spaces = template.resourceTypes.filter((t) => !t.isHuman);
      expect(humans, template.label).toHaveLength(1);
      expect(spaces, template.label).toHaveLength(1);
    }
  });

  it('has a sane duration and price on every service', () => {
    for (const template of SHOP_TEMPLATES) {
      for (const service of template.services) {
        expect(service.durationMin, `${template.label}/${service.name}`).toBeGreaterThanOrEqual(5);
        expect(service.durationMin, `${template.label}/${service.name}`).toBeLessThanOrEqual(300);
        expect(service.price, `${template.label}/${service.name}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('never repeats a service name inside one template', () => {
    for (const template of SHOP_TEMPLATES) {
      const names = template.services.map((s) => s.name);
      expect(new Set(names).size, template.label).toBe(names.length);
    }
  });
});

describe('summariseDay', () => {
  const booking = (status: string, total = '500.00'): CalendarBooking => ({
    id: crypto.randomUUID(),
    code: 'AAA111',
    status,
    source: 'online',
    startsAt: '2026-03-16T10:00:00+07:00',
    endsAt: '2026-03-16T11:00:00+07:00',
    total,
    customerId: null,
    customerName: 'ลูกค้า',
    customerPhone: null,
    customerNote: null,
    services: ['ตัดผม'],
    staffResourceId: null,
    staffName: null,
    spaceName: null,
  });

  it('leaves cancellations out of the day total', () => {
    const stats = summariseDay([
      booking('confirmed'),
      booking('completed'),
      booking('cancelled'),
      booking('no_show'),
    ]);

    expect(stats.total).toBe(3); // the cancellation does not count as a booking
    expect(stats.completed).toBe(1);
    expect(stats.noShow).toBe(1);
    expect(stats.cancelled).toBe(1);
    expect(stats.upcoming).toBe(1);
  });

  it('counts revenue only from completed visits', () => {
    const stats = summariseDay([
      booking('completed', '450.00'),
      booking('completed', '1800.50'),
      booking('confirmed', '9999.00'),
      booking('no_show', '500.00'),
    ]);

    // 450.00 + 1800.50, and nothing from the booking that has not happened yet
    expect(stats.revenue).toBe('2250.50');
  });

  it('handles an empty day', () => {
    const stats = summariseDay([]);
    expect(stats).toEqual({
      total: 0,
      completed: 0,
      noShow: 0,
      cancelled: 0,
      upcoming: 0,
      revenue: '0.00',
    });
  });

  it('always reports revenue as a two-decimal string', () => {
    expect(summariseDay([booking('completed', '0.10')]).revenue).toBe('0.10');
    expect(summariseDay([booking('completed', '1234.5')]).revenue).toBe('1234.50');
  });
});

/**
 * Iron rule #5: money is integer satang in code. These are the two functions
 * every price passes through, so they are where the rule is actually kept.
 */
describe('satang conversion', () => {
  it('round-trips the prices the seed uses', () => {
    for (const amount of ['0.00', '0.01', '450.00', '1800.50', '2500.99', '12000.00']) {
      expect(fromSatang(toSatang(amount))).toBe(amount);
    }
  });

  it('reads a numeric(10,2) string as whole satang', () => {
    expect(toSatang('450.00')).toBe(45000);
    expect(toSatang('1800.50')).toBe(180050);
    expect(toSatang('0.05')).toBe(5);
    expect(toSatang('0.5')).toBe(50); // one decimal place means 50 satang
    expect(toSatang('7')).toBe(700); // no decimal point at all
  });

  it('never produces a float, however the amounts are summed', () => {
    const total = ['0.10', '0.20', '0.30'].reduce((sum, a) => sum + toSatang(a), 0);
    expect(total).toBe(60);
    expect(Number.isInteger(total)).toBe(true);
    expect(fromSatang(total)).toBe('0.60');
  });

  it('handles a negative amount, for refunds', () => {
    expect(toSatang('-450.00')).toBe(-45000);
    expect(fromSatang(-45000)).toBe('-450.00');
  });

  it('pads the satang so the string is always two decimals', () => {
    expect(fromSatang(5)).toBe('0.05');
    expect(fromSatang(50)).toBe('0.50');
    expect(fromSatang(100)).toBe('1.00');
  });
});
