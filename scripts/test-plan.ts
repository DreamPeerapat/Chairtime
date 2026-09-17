/**
 * Turn the one-baht test plan on and off.
 *
 * Paying a real baht into the real account is the only way to find out whether
 * a banking app scans our QR, reads the amount, and whether the slip that
 * comes back passes verification. Nothing short of that proves it: a QR that
 * decodes in a test harness can still be refused by a phone.
 *
 * It exists as a script rather than a row typed in by hand because the row has
 * to come back out again. `purchasablePlans()` shows every active priced plan
 * to every shop, so a forgotten test plan is a month of service for one baht,
 * offered to real customers. On, test, off — in one command each way.
 *
 *   tsx scripts/test-plan.ts on     # create or re-activate it
 *   tsx scripts/test-plan.ts off    # hide it again (the row stays)
 *   tsx scripts/test-plan.ts status
 *
 * Runs against whatever DATABASE_URL points at, so check that first.
 */
import { loadEnv } from '@/lib/env';

loadEnv();

const CODE = 'test-1baht';

async function main() {
  const [{ db, schema }, { eq }] = await Promise.all([
    import('@/lib/db/client'),
    import('drizzle-orm'),
  ]);

  const command = process.argv[2] ?? 'status';
  const [existing] = await db
    .select({
      id: schema.subscriptionPlan.id,
      name: schema.subscriptionPlan.name,
      price: schema.subscriptionPlan.priceMonthly,
      isActive: schema.subscriptionPlan.isActive,
    })
    .from(schema.subscriptionPlan)
    .where(eq(schema.subscriptionPlan.code, CODE));

  if (command === 'status') {
    console.log(existing ? existing : 'no test plan in this database');
    return;
  }

  if (command === 'off') {
    if (!existing) {
      console.log('nothing to hide — no test plan here');
      return;
    }
    await db
      .update(schema.subscriptionPlan)
      .set({ isActive: false })
      .where(eq(schema.subscriptionPlan.code, CODE));
    console.log('test plan hidden — it no longer appears on any billing page');
    return;
  }

  if (command !== 'on') {
    console.error('usage: tsx scripts/test-plan.ts on|off|status');
    process.exit(1);
  }

  if (existing) {
    await db
      .update(schema.subscriptionPlan)
      .set({ isActive: true })
      .where(eq(schema.subscriptionPlan.code, CODE));
    console.log('test plan re-activated');
  } else {
    await db.insert(schema.subscriptionPlan).values({
      code: CODE,
      // Named so that nobody, on any screen, could mistake it for something
      // they are meant to buy.
      name: 'ทดสอบระบบ — ห้ามเลือก',
      priceMonthly: '1.00',
      trialDays: 0,
      isActive: true,
    });
    console.log('test plan created at ฿1.00/month');
  }

  console.log('remember: tsx scripts/test-plan.ts off  — as soon as the test is done');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
