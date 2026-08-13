/**
 * Phase 1's definition of done: fire 50 bookings at one slot, land exactly one.
 *
 * If this ever goes green with more than one winner, the EXCLUDE constraint is
 * not doing its job and every other guarantee in the system is void.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { sqlClient } from '@/lib/db/client';
import { createBooking } from '@/lib/booking';
import { SlotTakenError, SlotUnavailableError, isExclusionViolation } from '@/lib/booking/errors';
import { getAvailability } from '@/lib/availability';
import { countAllocations, countBookings, createSimpleShop, resetDatabase } from '../support/db';

const ZONE = 'Asia/Bangkok';

afterAll(async () => {
  await sqlClient.end();
});

describe('concurrent bookings on the same slot', () => {
  let shop: Awaited<ReturnType<typeof createSimpleShop>>;
  let slotStart: DateTime;

  beforeAll(async () => {
    await resetDatabase();
    shop = await createSimpleShop({ slug: 'race-test', staffCount: 1, chairCount: 1 });

    const date = DateTime.now().setZone(ZONE).plus({ days: 3 }).toISODate()!;
    const slots = await getAvailability({ tenantId: shop.tenantId, date, serviceIds: [shop.serviceId] });
    expect(slots.length).toBeGreaterThan(0);
    slotStart = slots[0]!.start;
  });

  it('lets exactly one of 50 simultaneous requests win', async () => {
    const attempts = Array.from({ length: 50 }, () =>
      createBooking({
        tenantId: shop.tenantId,
        customerId: shop.customerId,
        startsAt: slotStart,
        serviceIds: [shop.serviceId],
      }).then(
        (booking) => ({ ok: true as const, booking }),
        (error: unknown) => ({ ok: false as const, error }),
      ),
    );

    const results = await Promise.all(attempts);
    const winners = results.filter((r) => r.ok);
    const losers = results.filter((r) => !r.ok);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(49);

    // Every loser must be a slot conflict, not a crash. Either the constraint
    // rejected the INSERT (23P01, surfaced as SlotTakenError) or the re-plan
    // that runs first already saw the slot gone.
    for (const loser of losers) {
      const error = (loser as { error: unknown }).error;
      const recognised =
        error instanceof SlotTakenError ||
        error instanceof SlotUnavailableError ||
        isExclusionViolation(error);
      if (!recognised) throw error;
    }

    // And the database agrees: one booking, two allocations (stylist + chair).
    expect(await countBookings(shop.tenantId)).toBe(1);
    expect(await countAllocations(shop.tenantId)).toBe(2);
  });

  it('reports the conflict in Thai, so the message can go straight to the customer', () => {
    expect(new SlotTakenError().message).toContain('กรุณาเลือกเวลาใหม่');
  });
});

describe('capacity', () => {
  it('fills every chair before it turns anyone away', async () => {
    await resetDatabase();
    const shop = await createSimpleShop({ slug: 'capacity-test', staffCount: 4, chairCount: 3 });

    const date = DateTime.now().setZone(ZONE).plus({ days: 3 }).toISODate()!;
    const slots = await getAvailability({
      tenantId: shop.tenantId,
      date,
      serviceIds: [shop.serviceId],
    });
    const start = slots[0]!.start;

    // Bookings arriving one after another, as they do in a real shop.
    const outcomes: boolean[] = [];
    for (let i = 0; i < 6; i += 1) {
      outcomes.push(
        await createBooking({
          tenantId: shop.tenantId,
          customerId: shop.customerId,
          startsAt: start,
          serviceIds: [shop.serviceId],
        }).then(
          () => true,
          (error: unknown) => {
            if (error instanceof SlotUnavailableError || error instanceof SlotTakenError) return false;
            throw error;
          },
        ),
      );
    }

    // Three chairs for four stylists: the fourth stylist has nowhere to work.
    expect(outcomes).toEqual([true, true, true, false, false, false]);
    expect(await countBookings(shop.tenantId)).toBe(3);
  });

  it('collapses simultaneous identical requests to one winner, even with spare chairs', async () => {
    await resetDatabase();
    const shop = await createSimpleShop({ slug: 'capacity-race', staffCount: 4, chairCount: 3 });

    const date = DateTime.now().setZone(ZONE).plus({ days: 3 }).toISODate()!;
    const slots = await getAvailability({
      tenantId: shop.tenantId,
      date,
      serviceIds: [shop.serviceId],
    });
    const start = slots[0]!.start;

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        createBooking({
          tenantId: shop.tenantId,
          customerId: shop.customerId,
          startsAt: start,
          serviceIds: [shop.serviceId],
        }).then(
          () => true,
          () => false,
        ),
      ),
    );

    // Everyone plans against the same empty schedule and picks the same
    // stylist and chair, so the constraint rejects all but one. docs/logic.md
    // §2 is explicit that we do not silently retry: the losers are told to
    // choose again rather than being moved to a different chair behind their
    // back. Capacity is still reachable — see the sequential case above.
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
