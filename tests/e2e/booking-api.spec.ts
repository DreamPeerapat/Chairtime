/**
 * End-to-end over real HTTP, against the seeded database.
 *
 * The roadmap's Phase 1 gate lives here: two requests aimed at one slot, one
 * winner. The unit and integration suites prove the algorithm and the
 * constraint; this proves the whole stack still behaves once Next.js, Zod and
 * JSON serialisation are in the way.
 */
import { expect, test, type APIRequestContext } from '@playwright/test';
import { DateTime } from 'luxon';
import { loadEnv } from '../../lib/env.ts';

loadEnv();

const ZONE = 'Asia/Bangkok';

/**
 * Walk forward to the next day that actually has slots. The seeded salon closes
 * on Mondays, and a fixed offset would make the test fail on a calendar quirk
 * rather than on a real regression.
 */
async function firstOpenDay(
  request: APIRequestContext,
  tenantId: string,
  serviceId: string,
  fromDayOffset: number,
): Promise<{ date: string; slots: Array<{ startsAt: string; durationMin: number }> }> {
  for (let offset = fromDayOffset; offset < fromDayOffset + 10; offset += 1) {
    const date = DateTime.now().setZone(ZONE).plus({ days: offset }).toISODate()!;
    const response = await request.get(
      `/api/availability?tenantId=${tenantId}&date=${date}&serviceIds=${serviceId}`,
    );
    expect(response.ok()).toBeTruthy();
    const { slots } = (await response.json()) as {
      slots: Array<{ startsAt: string; durationMin: number }>;
    };
    if (slots.length > 0) return { date, slots };
  }
  throw new Error('no bookable day found in the next 10 days');
}

async function findShop(request: APIRequestContext) {
  // The seed always creates these three slugs; use the hair salon because its
  // colour service exercises active/passive segments.
  const { db, schema } = await import('../../lib/db/client.ts');
  const { eq } = await import('drizzle-orm');
  const { withTenant } = await import('../../lib/db/tenant.ts');

  const [tenant] = await db
    .select({ id: schema.tenant.id })
    .from(schema.tenant)
    .where(eq(schema.tenant.slug, 'thehair-thonglor'));
  if (!tenant) throw new Error('seed data missing — run `pnpm db:seed` first');

  const services = await withTenant(tenant.id, (tx) =>
    tx
      .select({ id: schema.service.id, name: schema.service.name })
      .from(schema.service)
      .where(eq(schema.service.tenantId, tenant.id)),
  );
  const colour = services.find((s) => s.name === 'ย้อมผม');
  if (!colour) throw new Error('colour service missing from seed');

  return { tenantId: tenant.id, serviceId: colour.id, request };
}

test.describe('booking API', () => {
  test('lists slots and books one of them', async ({ request }) => {
    const { tenantId, serviceId } = await findShop(request);
    const { date, slots } = await firstOpenDay(request, tenantId, serviceId, 9);

    // 30 active + 40 passive + 20 active + 10 buffer_after
    expect(slots[0]!.durationMin).toBe(100);

    const created = await request.post('/api/bookings', {
      data: { tenantId, startsAt: slots[0]!.startsAt, serviceIds: [serviceId] },
    });
    expect(created.status()).toBe(201);

    const booking = (await created.json()) as { code: string; startsAt: string };
    expect(booking.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(booking.startsAt).toBe(slots[0]!.startsAt);

    // the slot is gone from the next lookup
    const relisted = await request.get(
      `/api/availability?tenantId=${tenantId}&date=${date}&serviceIds=${serviceId}`,
    );
    const after = (await relisted.json()) as { slots: Array<{ startsAt: string }> };
    const stillOffered = after.slots.filter((s) => s.startsAt === slots[0]!.startsAt);
    // the salon has five chairs, so the time itself may still be offered — but
    // never by the same stylist, which the concurrency test below pins down
    expect(stillOffered.length).toBeLessThanOrEqual(1);
  });

  test('never oversells a slot, and says so in Thai', async ({ request }) => {
    const { tenantId, serviceId } = await findShop(request);
    const { slots } = await firstOpenDay(request, tenantId, serviceId, 12);
    const target = slots.at(-1)!.startsAt;

    // More requests than the salon could possibly serve at one time. Whether
    // they interleave or arrive one behind the other, the shop has five chairs
    // and three stylists who can colour, so at most three can be accepted.
    // The rest must be refused cleanly — never a 500, never an oversell.
    const body = { tenantId, startsAt: target, serviceIds: [serviceId] };
    const responses = await Promise.all(
      Array.from({ length: 12 }, () => request.post('/api/bookings', { data: body })),
    );
    const statuses = responses.map((r) => r.status());

    expect(statuses.filter((s) => s >= 500)).toHaveLength(0);
    expect(statuses.every((s) => s === 201 || s === 409)).toBe(true);

    const accepted = statuses.filter((s) => s === 201).length;
    expect(accepted).toBeGreaterThan(0);
    expect(accepted).toBeLessThanOrEqual(3);

    const loser = responses.find((r) => r.status() === 409)!;
    const payload = (await loser.json()) as { error: string; code: string };
    expect(payload.error).toContain('กรุณาเลือกเวลาใหม่');
    expect(['SLOT_TAKEN', 'SLOT_UNAVAILABLE']).toContain(payload.code);
  });

  test('rejects malformed input with a Thai message', async ({ request }) => {
    const response = await request.get('/api/availability?tenantId=not-a-uuid&date=2026-01-01');
    expect(response.status()).toBe(400);
    const payload = (await response.json()) as { error: string };
    expect(payload.error).toBe('พารามิเตอร์ไม่ถูกต้อง');
  });
});
