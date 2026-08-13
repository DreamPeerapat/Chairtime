import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { buildTimeline } from '@/lib/availability/timeline';
import { findSlots } from '@/lib/availability/search';
import type { SegmentSpec } from '@/lib/availability/types';
import {
  ZONE,
  TYPE_CHAIR,
  TYPE_STAFF,
  at,
  busy,
  chair,
  context,
  labels,
  service,
  span,
  staff,
} from '../support/fixtures';

const CUT = 'cut';
const COLOR = 'color';
const MASSAGE = 'massage';

/** The hair-colouring example from docs/logic.md §1 step 2. */
const colorSegments: SegmentSpec[] = [
  { seq: 1, kind: 'active', durationMin: 30, label: 'ลงสี' },
  { seq: 2, kind: 'passive', durationMin: 40, label: 'รอสีติด' },
  { seq: 3, kind: 'active', durationMin: 20, label: 'สระ+เป่า' },
];

// Monday. The fixture shop opens 10:00-20:00 every day.
const DAY = '2026-03-16';

describe('buildTimeline', () => {
  it('lays services end to end and separates active from passive time', () => {
    const cut = service({ id: CUT, bufferBeforeMin: 5, bufferAfterMin: 5 });
    const color = service({ id: COLOR, segments: colorSegments, bufferAfterMin: 10 });

    const timeline = buildTimeline([cut, color], { start: at(DAY, '10:00') });

    // 5 + 60 + 5 + 30 + 40 + 20 + 10 = 170
    expect(timeline.totalMin).toBe(170);
    // buffers are not staff time: 60 + 30 + 20 = 110
    expect(timeline.activeMin).toBe(110);
    expect(timeline.end.toISO()).toBe(at(DAY, '12:50').toISO());
  });

  it('puts the passive stretch outside the active spans', () => {
    const color = service({ id: COLOR, segments: colorSegments });
    const timeline = buildTimeline([color], { start: at(DAY, '10:00') });
    const item = timeline.items[0]!;

    expect(item.activeSpans.map((s) => s.start.toFormat('HH:mm'))).toEqual(['10:00', '11:10']);
    expect(item.activeSpans.map((s) => s.end.toFormat('HH:mm'))).toEqual(['10:30', '11:30']);
  });

  it('scales segment durations by the assigned staff member, but not buffers', () => {
    const cut = service({ id: CUT, bufferBeforeMin: 10, bufferAfterMin: 10 });
    const timeline = buildTimeline([cut], {
      start: at(DAY, '10:00'),
      durationFactor: () => 1.5,
    });

    // 10 + (60 * 1.5) + 10
    expect(timeline.totalMin).toBe(110);
    expect(timeline.activeMin).toBe(90);
  });
});

describe('findSlots — opening hours', () => {
  const cut = service({ id: CUT });
  const base = () =>
    context({
      services: [cut],
      resources: [staff('s1', [CUT]), chair('c1')],
    });

  it('offers slots on the granularity grid inside opening hours', () => {
    const slots = findSlots(base(), { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') });
    expect(labels(slots)[0]).toBe('10:00');
    // last start that still finishes by 20:00
    expect(labels(slots).at(-1)).toBe('19:00');
    expect(labels(slots)).toContain('10:15');
  });

  it('respects a lunch break expressed as two opening-hour rows', () => {
    const ctx = base();
    ctx.shopHours.set(1, [
      { openTime: '10:00:00', closeTime: '12:00:00' },
      { openTime: '13:00:00', closeTime: '20:00:00' },
    ]);

    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') });

    expect(labels(slots)).toContain('11:00');
    expect(labels(slots)).not.toContain('11:15'); // would run past 12:00
    expect(labels(slots)).toContain('13:00');
  });

  it('returns nothing on a day the shop is closed', () => {
    const ctx = base();
    ctx.shopHours.delete(1);
    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') });
    expect(slots).toEqual([]);
  });

  it('honours a whole-shop closure', () => {
    const ctx = base();
    ctx.shopClosures.push(span(DAY, '10:00', '15:00'));
    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') });
    expect(labels(slots)[0]).toBe('15:00');
  });

  it('allows a booking that starts before midnight and ends after it', () => {
    const ctx = base();
    for (let weekday = 0; weekday < 7; weekday += 1) {
      ctx.shopHours.set(weekday, [{ openTime: '18:00:00', closeTime: '02:00:00' }]);
    }
    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') });

    // Candidate starts stay on the requested day; the visit itself may run into
    // the next one, as long as it finishes before the shop closes at 02:00.
    const last = slots.at(-1)!;
    expect(last.start.setZone(ZONE).toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-16 23:45');
    expect(last.end.setZone(ZONE).toFormat('yyyy-MM-dd HH:mm')).toBe('2026-03-17 00:45');

    // The early hours of the requested day belong to the *previous* night's
    // window, so they are offered too, up to the last start that ends by 02:00.
    expect(labels(slots).slice(0, 2)).toEqual(['00:00', '00:15']);
    expect(labels(slots)).toContain('01:00');
    expect(labels(slots)).not.toContain('01:15');
    expect(labels(slots)).toContain('18:00');
  });
});

describe('findSlots — resources', () => {
  const cut = service({ id: CUT });

  it('skips staff who do not have the skill', () => {
    const ctx = context({
      services: [cut],
      resources: [staff('s1', []), chair('c1')],
    });
    expect(findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') })).toEqual([]);
  });

  it('returns nothing when a required resource type has no resource at all', () => {
    const ctx = context({ services: [cut], resources: [staff('s1', [CUT])] });
    expect(findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') })).toEqual([]);
  });

  it('gives up a slot only when every staff member is busy', () => {
    const ctx = context({
      services: [cut],
      resources: [staff('s1', [CUT]), staff('s2', [CUT]), chair('c1'), chair('c2')],
      busy: [busy('s1', DAY, '10:00', '11:00')],
    });
    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') });
    expect(labels(slots)).toContain('10:00'); // s2 is free
    expect(slots.find((s) => s.start.equals(at(DAY, '10:00')))!.staffResourceId).toBe('s2');
  });

  it('runs out of chairs before it runs out of staff', () => {
    const ctx = context({
      services: [cut],
      resources: [staff('s1', [CUT]), staff('s2', [CUT]), chair('c1')],
      busy: [busy('c1', DAY, '10:00', '11:00')],
    });
    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') });
    expect(labels(slots)).not.toContain('10:00');
    expect(labels(slots)).not.toContain('10:30');
    expect(labels(slots)).toContain('11:00');
  });

  it('keeps a staff member off the board while they are on leave', () => {
    const ctx = context({
      services: [cut],
      resources: [staff('s1', [CUT]), chair('c1')],
      busy: [busy('s1', DAY, '10:00', '14:00')], // half-day leave
    });
    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') });
    expect(labels(slots)[0]).toBe('14:00');
  });

  it('applies a resource-specific working day', () => {
    const partTime = staff('s1', [CUT], {
      hours: new Map([[1, [{ openTime: '10:00:00', closeTime: '13:00:00' }]]]),
    });
    const ctx = context({ services: [cut], resources: [partTime, chair('c1')] });
    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') });
    expect(labels(slots).at(-1)).toBe('12:00');
  });

  it('filters to the requested staff member', () => {
    const ctx = context({
      services: [cut],
      resources: [staff('s1', [CUT]), staff('s2', [CUT]), chair('c1'), chair('c2')],
      busy: [busy('s2', DAY, '10:00', '20:00')],
    });
    const slots = findSlots(ctx, {
      date: DAY,
      serviceIds: [CUT],
      preferredResourceId: 's2',
      now: at(DAY, '00:00'),
    });
    expect(slots).toEqual([]);
  });
});

describe('findSlots — buffers', () => {
  it('leaves room for the cleaning buffer between two customers', () => {
    const massage = service({
      id: MASSAGE,
      bufferAfterMin: 15,
      requirements: [
        { resourceTypeId: TYPE_STAFF, quantity: 1, holdScope: 'active_only' },
        { resourceTypeId: TYPE_CHAIR, quantity: 1, holdScope: 'whole' },
      ],
    });
    const ctx = context({
      services: [massage],
      resources: [staff('s1', [MASSAGE]), chair('bed1')],
      // an existing booking already holds the bed until 11:15 (60 + 15 cleaning)
      busy: [busy('bed1', DAY, '10:00', '11:15')],
    });

    const slots = findSlots(ctx, { date: DAY, serviceIds: [MASSAGE], now: at(DAY, '00:00') });

    // Intervals are half-open, so the next customer may start exactly at 11:15.
    expect(labels(slots)).not.toContain('11:00');
    expect(labels(slots)[0]).toBe('11:15');

    // and their own bed hold carries the cleaning buffer on the end
    const first = slots[0]!;
    const bed = first.holds.find((h) => h.resourceTypeId === TYPE_CHAIR)!;
    expect(bed.end.diff(bed.start, 'minutes').minutes).toBe(75);
  });
});

describe('findSlots — active/passive segments', () => {
  it('frees the stylist during the colour-development stretch', () => {
    const color = service({ id: COLOR, segments: colorSegments });
    const ctx = context({
      services: [color],
      resources: [staff('s1', [COLOR]), chair('c1'), chair('c2')],
    });

    const slots = findSlots(ctx, { date: DAY, serviceIds: [COLOR], now: at(DAY, '00:00') });
    const ten = slots.find((s) => s.start.equals(at(DAY, '10:00')))!;

    const staffHolds = ten.holds.filter((h) => h.resourceTypeId === TYPE_STAFF);
    const chairHolds = ten.holds.filter((h) => h.resourceTypeId === TYPE_CHAIR);

    // the stylist is held twice, the chair once for the whole 90 minutes
    expect(staffHolds).toHaveLength(2);
    expect(chairHolds).toHaveLength(1);
    expect(chairHolds[0]!.end.diff(chairHolds[0]!.start, 'minutes').minutes).toBe(90);
  });

  it('lets the stylist start another customer inside the passive stretch', () => {
    const color = service({ id: COLOR, segments: colorSegments });
    const cut = service({ id: CUT, segments: [{ seq: 1, kind: 'active', durationMin: 30, label: null }] });
    const ctx = context({
      services: [color, cut],
      resources: [staff('s1', [COLOR, CUT]), chair('c1'), chair('c2')],
      // s1 is mid-colour: active 10:00-10:30 and 11:10-11:30, free 10:30-11:10
      busy: [busy('s1', DAY, '10:00', '10:30'), busy('s1', DAY, '11:10', '11:30'), busy('c1', DAY, '10:00', '11:30')],
    });

    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') });

    expect(labels(slots)).toContain('10:30'); // 30-minute cut fits in the gap
    expect(labels(slots)).not.toContain('10:45'); // would run into the 11:10 active span
  });
});

describe('findSlots — several services in one visit', () => {
  it('assigns the same staff member to both services', () => {
    const cut = service({ id: CUT, segments: [{ seq: 1, kind: 'active', durationMin: 30, label: null }] });
    const color = service({ id: COLOR, segments: colorSegments });
    const ctx = context({
      services: [cut, color],
      resources: [staff('s1', [CUT, COLOR]), staff('s2', [CUT]), chair('c1')],
    });

    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT, COLOR], now: at(DAY, '00:00') });
    const first = slots[0]!;

    expect(first.staffResourceId).toBe('s1'); // s2 cannot colour
    const staffIds = new Set(
      first.holds.filter((h) => h.resourceTypeId === TYPE_STAFF).map((h) => h.resourceId),
    );
    expect([...staffIds]).toEqual(['s1']);
  });

  it('books the two services back to back with no gap', () => {
    const cut = service({ id: CUT, segments: [{ seq: 1, kind: 'active', durationMin: 30, label: null }] });
    const color = service({ id: COLOR, segments: colorSegments });
    const ctx = context({
      services: [cut, color],
      resources: [staff('s1', [CUT, COLOR]), chair('c1')],
    });

    const first = findSlots(ctx, { date: DAY, serviceIds: [CUT, COLOR], now: at(DAY, '00:00') })[0]!;
    expect(first.start.toFormat('HH:mm')).toBe('10:00');
    expect(first.end.toFormat('HH:mm')).toBe('12:00'); // 30 + 90
  });
});

describe('findSlots — booking policy', () => {
  const cut = service({ id: CUT });
  const base = () => context({ services: [cut], resources: [staff('s1', [CUT]), chair('c1')] });

  it('drops slots inside the minimum lead time', () => {
    const ctx = base();
    ctx.policy.minLeadTimeMin = 120;
    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '10:00') });
    expect(labels(slots)[0]).toBe('12:00');
  });

  it('drops slots beyond the advance-booking horizon', () => {
    const ctx = base();
    ctx.policy.maxAdvanceDays = 3;
    const slots = findSlots(ctx, {
      date: DAY,
      serviceIds: [CUT],
      now: at('2026-03-01', '10:00'),
    });
    expect(slots).toEqual([]);
  });

  it('extends the horizon by the tier priority window', () => {
    const ctx = base();
    ctx.policy.maxAdvanceDays = 3;
    const slots = findSlots(ctx, {
      date: DAY,
      serviceIds: [CUT],
      priorityBookingDays: 30,
      now: at('2026-03-01', '10:00'),
    });
    expect(slots.length).toBeGreaterThan(0);
  });

  it('uses the configured slot granularity', () => {
    const ctx = base();
    ctx.policy.slotGranularityMin = 30;
    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') });
    expect(labels(slots).slice(0, 3)).toEqual(['10:00', '10:30', '11:00']);
  });

  it('anchors the grid to local midnight, not to the opening time', () => {
    const ctx = base();
    for (let weekday = 0; weekday < 7; weekday += 1) {
      ctx.shopHours.set(weekday, [{ openTime: '10:10:00', closeTime: '20:00:00' }]);
    }
    const slots = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') });
    expect(labels(slots)[0]).toBe('10:15');
  });

  it('rejects an unknown service id', () => {
    expect(() =>
      findSlots(base(), { date: DAY, serviceIds: ['nope'], now: at(DAY, '00:00') }),
    ).toThrow(/unknown service/i);
  });
});

describe('findSlots — timezone', () => {
  it('reports slots as absolute instants in the tenant timezone', () => {
    const cut = service({ id: CUT });
    const ctx = context({ services: [cut], resources: [staff('s1', [CUT]), chair('c1')] });
    const first = findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') })[0]!;

    // 10:00 Bangkok is 03:00 UTC
    expect(first.start.toUTC().toISO()).toBe(
      DateTime.fromISO('2026-03-16T03:00:00Z').toUTC().toISO(),
    );
  });
});

describe('findSlots — staff override', () => {
  const cut = service({ id: CUT });
  const base = () => context({ services: [cut], resources: [staff('s1', [CUT]), chair('c1')] });

  /**
   * Regression: the counter used to waive the lead time by pretending "now" was
   * a year ago, which silently pushed every day past the advance horizon and
   * returned no slots at all. The waiver is an explicit flag now.
   */
  it('ignores the lead time without also tripping the advance horizon', () => {
    const ctx = base();
    ctx.policy.minLeadTimeMin = 120;
    ctx.policy.maxAdvanceDays = 60;

    const atCounter = { date: DAY, serviceIds: [CUT], now: at(DAY, '10:00') };

    // Online, the next two hours are closed off.
    expect(labels(findSlots(ctx, atCounter))[0]).toBe('12:00');

    // At the counter, the customer can be seated now.
    const staffView = findSlots(ctx, { ...atCounter, ignorePolicyWindow: true });
    expect(labels(staffView)[0]).toBe('10:00');
  });

  it('lets staff work on a day beyond the public horizon', () => {
    const ctx = base();
    ctx.policy.maxAdvanceDays = 3;
    const query = { date: DAY, serviceIds: [CUT], now: at('2026-03-01', '10:00') };

    expect(findSlots(ctx, query)).toEqual([]);
    expect(findSlots(ctx, { ...query, ignorePolicyWindow: true }).length).toBeGreaterThan(0);
  });

  it('lets staff work on a day that has already passed', () => {
    const ctx = base();
    const query = { date: DAY, serviceIds: [CUT], now: at('2026-03-20', '10:00') };

    // The public page offers nothing in the past...
    expect(findSlots(ctx, query)).toEqual([]);
    // ...but the shop still needs to record what happened.
    expect(findSlots(ctx, { ...query, ignorePolicyWindow: true }).length).toBeGreaterThan(0);
  });

  it('still respects opening hours and existing bookings', () => {
    const ctx = context({
      services: [cut],
      resources: [staff('s1', [CUT]), chair('c1')],
      busy: [busy('s1', DAY, '10:00', '12:00')],
    });
    const slots = findSlots(ctx, {
      date: DAY,
      serviceIds: [CUT],
      now: at(DAY, '00:00'),
      ignorePolicyWindow: true,
    });

    // The waiver is about policy, not about physics.
    expect(labels(slots)[0]).toBe('12:00');
    expect(labels(slots).at(-1)).toBe('19:00');
  });
});
