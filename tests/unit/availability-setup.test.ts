/**
 * `diagnoseSetup` — telling "nobody is free today" apart from "this shop can
 * never be booked".
 *
 * `findSlots` returns an empty array for both, and the booking page used to
 * answer both with "ลองเลือกวันอื่น" — advice that sends the customer round a
 * loop that has no exit, while the owner is told nothing at all. A brand-new
 * shop lands in exactly that state: the onboarding wizard creates resource
 * *types* from the business template but no actual staff or seats.
 */
import { describe, expect, it } from 'vitest';
import { diagnoseSetup } from '@/lib/availability/diagnose';
import { findSlots } from '@/lib/availability/search';
import { TYPE_CHAIR, TYPE_STAFF, at, chair, context, service, staff } from '../support/fixtures';

const CUT = 'cut';
const COLOR = 'color';
const DAY = '2026-03-16'; // a Monday

const cut = service({ id: CUT, name: 'ตัดผม' });
const color = service({ id: COLOR, name: 'ย้อมสีผม' });

describe('diagnoseSetup — a shop that can take bookings', () => {
  it('reports nothing when a skilled staff member and a seat both exist', () => {
    const ctx = context({ services: [cut], resources: [staff('s1', [CUT]), chair('c1')] });
    expect(diagnoseSetup(ctx, [CUT])).toEqual([]);
  });

  it('reports nothing just because the day happens to be full', () => {
    const ctx = context({
      services: [cut],
      resources: [staff('s1', [CUT]), chair('c1')],
      busy: [{ resourceId: 's1', ...{ start: at(DAY, '00:00'), end: at(DAY, '23:59') } }],
    });

    // No slots today, but the shop itself is configured correctly.
    expect(findSlots(ctx, { date: DAY, serviceIds: [CUT], now: at(DAY, '00:00') })).toEqual([]);
    expect(diagnoseSetup(ctx, [CUT])).toEqual([]);
  });
});

describe('diagnoseSetup — configuration gaps', () => {
  it('flags a shop with no resources at all', () => {
    const ctx = context({ services: [cut], resources: [] });
    const problems = diagnoseSetup(ctx, [CUT]);

    expect(problems.map((p) => p.code)).toEqual(['no_resources']);
  });

  it('does not also list every empty type when there are no resources at all', () => {
    const ctx = context({ services: [cut], resources: [] });
    expect(diagnoseSetup(ctx, [CUT])).toHaveLength(1);
  });

  it('names the resource type that is empty', () => {
    // A stylist, but not a single chair to sit them in.
    const ctx = context({ services: [cut], resources: [staff('s1', [CUT])] });
    const problems = diagnoseSetup(ctx, [CUT]);

    expect(problems.map((p) => p.code)).toEqual(['missing_resource_type']);
    expect(problems[0]!.names).toEqual(['เก้าอี้']);
  });

  it('flags staff who exist but cannot do the requested service', () => {
    const ctx = context({
      services: [cut, color],
      resources: [staff('s1', [CUT]), chair('c1')],
    });
    const problems = diagnoseSetup(ctx, [CUT, COLOR]);

    expect(problems.map((p) => p.code)).toEqual(['no_skilled_staff']);
    expect(problems[0]!.names).toEqual(['ย้อมสีผม']);
  });

  it('accepts one staff member who covers the whole basket', () => {
    const ctx = context({
      services: [cut, color],
      resources: [staff('s1', [CUT, COLOR]), chair('c1')],
    });
    expect(diagnoseSetup(ctx, [CUT, COLOR])).toEqual([]);
  });

  it('rejects a basket split across two people, matching findSlots', () => {
    // eligibleStaff requires one person for the whole visit; the diagnosis
    // must agree, or the banner would claim the shop is fine while the
    // customer sees no times.
    const ctx = context({
      services: [cut, color],
      resources: [staff('s1', [CUT]), staff('s2', [COLOR]), chair('c1')],
    });

    expect(findSlots(ctx, { date: DAY, serviceIds: [CUT, COLOR], now: at(DAY, '00:00') })).toEqual([]);
    expect(diagnoseSetup(ctx, [CUT, COLOR]).map((p) => p.code)).toEqual(['no_skilled_staff']);
  });

  it('flags a shop with no opening hours on any day', () => {
    const ctx = context({
      services: [cut],
      resources: [staff('s1', [CUT]), chair('c1')],
      shopHours: new Map(),
    });

    expect(diagnoseSetup(ctx, [CUT]).map((p) => p.code)).toEqual(['no_business_hours']);
  });

  it('lists every gap at once, so the owner fixes them in one trip', () => {
    const ctx = context({ services: [cut], resources: [], shopHours: new Map() });

    expect(diagnoseSetup(ctx, [CUT]).map((p) => p.code)).toEqual([
      'no_business_hours',
      'no_resources',
    ]);
  });

  it('ignores resource types the requested services do not need', () => {
    // A room type with nothing in it must not block a service that never
    // asks for a room.
    const TYPE_ROOM = '44444444-4444-4444-4444-444444444444';
    const ctx = context({
      services: [cut],
      resourceTypes: [
        { id: TYPE_STAFF, name: 'ช่าง', isHuman: true },
        { id: TYPE_CHAIR, name: 'เก้าอี้', isHuman: false },
        { id: TYPE_ROOM, name: 'ห้องส่วนตัว', isHuman: false },
      ],
      resources: [staff('s1', [CUT]), chair('c1')],
    });

    expect(diagnoseSetup(ctx, [CUT])).toEqual([]);
  });

  it('flags a shop with no services at all', () => {
    // The dashboard banner asks about the whole shop, so it can legitimately
    // arrive here with an empty basket; findSlots would throw on that.
    const ctx = context({ services: [], resources: [staff('s1', []), chair('c1')] });

    expect(diagnoseSetup(ctx, []).map((p) => p.code)).toEqual(['no_services']);
  });

  it('gives every problem Thai copy for the owner', () => {
    const ctx = context({ services: [cut], resources: [] });
    for (const problem of diagnoseSetup(ctx, [CUT])) {
      expect(problem.message).toMatch(/[ก-๙]/);
    }
  });
});
