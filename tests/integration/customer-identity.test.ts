/**
 * Resolving one person to one customer record, against the real unique indexes.
 *
 * `customer` is unique on (tenant_id, phone) and on (tenant_id, line_user_id),
 * and one person routinely ends up with two rows: they book by phone once,
 * then add the shop's LINE OA, whose follow event creates a second row. The
 * booking after that carries both identifiers and matches both rows.
 *
 * That is not a corner case — it is every existing customer of a shop that
 * has just switched its regulars over to LINE. On production it surfaced as
 * "จองไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" with no booking made, because the
 * backfill hit the unique index and the 23505 escaped as a 500.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { resolveCustomer } from '@/lib/customer/upsert';
import { createSimpleShop, resetDatabase } from '../support/db';

afterAll(async () => {
  await sqlClient.end();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

beforeEach(async () => {
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'identity-shop', staffCount: 1, chairCount: 1 });
});

const PHONE = '0906749156';
const LINE_ID = 'U_identity_test';

describe('resolveCustomer', () => {
  it('links a phone-only record to LINE when nothing else holds that id', async () => {
    const first = await withTenant(shop.tenantId, (tx) =>
      resolveCustomer(tx, { tenantId: shop.tenantId, name: 'คุณดรีม', phone: PHONE }),
    );

    const second = await withTenant(shop.tenantId, (tx) =>
      resolveCustomer(tx, {
        tenantId: shop.tenantId,
        name: 'คุณดรีม',
        phone: PHONE,
        lineUserId: LINE_ID,
      }),
    );

    expect(second).toBe(first);

    const [row] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.customer).where(eq(schema.customer.id, first!)),
    );
    expect(row!.lineUserId).toBe(LINE_ID);
  });

  it('books successfully when the phone and the LINE id sit on different records', async () => {
    // The shop knows them by phone already...
    const byPhone = await withTenant(shop.tenantId, (tx) =>
      resolveCustomer(tx, { tenantId: shop.tenantId, name: 'คุณดรีม', phone: PHONE }),
    );
    // ...and then they add the OA, which creates a LINE-only row.
    const byLine = await withTenant(shop.tenantId, (tx) =>
      resolveCustomer(tx, { tenantId: shop.tenantId, name: 'ลูกค้า LINE', lineUserId: LINE_ID }),
    );
    expect(byLine).not.toBe(byPhone);

    // The booking that carries both must not throw.
    const resolved = await withTenant(shop.tenantId, (tx) =>
      resolveCustomer(tx, {
        tenantId: shop.tenantId,
        name: 'คุณดรีม',
        phone: PHONE,
        lineUserId: LINE_ID,
      }),
    );

    // It attaches to the LINE record, so the confirmation has somewhere to go.
    expect(resolved).toBe(byLine);

    // Neither record lost an identifier, and nothing was merged behind the
    // shop's back: merging moves point balances, and a shared family phone
    // number would fold two real people into one.
    const rows = await withTenant(shop.tenantId, (tx) => tx.select().from(schema.customer));
    const phoneRow = rows.find((r) => r.id === byPhone)!;
    const lineRow = rows.find((r) => r.id === byLine)!;

    expect(phoneRow.phone).toBe(PHONE);
    expect(phoneRow.lineUserId).toBeNull();
    expect(lineRow.lineUserId).toBe(LINE_ID);
    expect(lineRow.phone).toBeNull();
  });

  it('keeps a returning customer as one record now that following creates none', async () => {
    // The shape production actually hit: booked by phone on the web, added the
    // OA the next day, then booked through LIFF. The follow event no longer
    // writes a row, so the second booking lands on the record that already
    // exists — with the name the shop knows and the phone it can ring.
    const first = await withTenant(shop.tenantId, (tx) =>
      resolveCustomer(tx, { tenantId: shop.tenantId, name: 'คุณดรีม', phone: PHONE }),
    );

    const second = await withTenant(shop.tenantId, (tx) =>
      resolveCustomer(tx, {
        tenantId: shop.tenantId,
        name: 'ดรีม (LINE)',
        phone: PHONE,
        lineUserId: LINE_ID,
      }),
    );

    expect(second).toBe(first);

    const rows = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.customer).where(eq(schema.customer.phone, PHONE)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lineUserId).toBe(LINE_ID);
    expect(rows[0]!.name).toBe('คุณดรีม'); // a real name is not overwritten
  });

  it('names a placeholder row as soon as a real name arrives', async () => {
    // Rows reading "ลูกค้า LINE" are still in production from when the follow
    // handler made them. The next booking has to be able to name them.
    const placeholder = await withTenant(shop.tenantId, (tx) =>
      resolveCustomer(tx, { tenantId: shop.tenantId, name: 'ลูกค้า LINE', lineUserId: LINE_ID }),
    );

    await withTenant(shop.tenantId, (tx) =>
      resolveCustomer(tx, { tenantId: shop.tenantId, name: 'คุณดรีม', lineUserId: LINE_ID }),
    );

    const [row] = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.customer).where(eq(schema.customer.id, placeholder!)),
    );
    expect(row!.name).toBe('คุณดรีม');
  });

  it('still creates one record when the person is new', async () => {
    const id = await withTenant(shop.tenantId, (tx) =>
      resolveCustomer(tx, {
        tenantId: shop.tenantId,
        name: 'คุณใหม่',
        phone: '0811111111',
        lineUserId: 'U_brand_new',
      }),
    );

    // The seeded shop comes with a customer of its own, so count the rows that
    // carry this number rather than the whole table.
    const rows = await withTenant(shop.tenantId, (tx) =>
      tx.select().from(schema.customer).where(eq(schema.customer.phone, '0811111111')),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(id);
    expect(rows[0]!.lineUserId).toBe('U_brand_new');
  });
});
