/**
 * Make the plan rows say what lib/billing/catalog.ts says.
 *
 * The catalogue is what the pricing page shows; these rows are what charges
 * money. They have to agree, and the way they stop agreeing is somebody
 * editing one of them. So the catalogue is written down, this copies it, and
 * nobody edits prices in a database client again.
 *
 *   tsx scripts/sync-plans.ts          # show what would change
 *   tsx scripts/sync-plans.ts --apply  # change it
 *
 * Runs against whatever DATABASE_URL points at. Prices only ever move
 * forwards: a shop that already paid keeps the period it bought, because
 * `tenant_payment` records the amount it actually paid and nothing here
 * touches it.
 */
import { loadEnv } from '@/lib/env';

loadEnv();

async function main() {
  const [{ db, schema }, { eq }, { PLANS }] = await Promise.all([
    import('@/lib/db/client'),
    import('drizzle-orm'),
    import('@/lib/billing/catalog'),
  ]);

  const apply = process.argv.includes('--apply');
  let changed = 0;

  for (const plan of PLANS) {
    const [existing] = await db
      .select({
        id: schema.subscriptionPlan.id,
        name: schema.subscriptionPlan.name,
        priceMonthly: schema.subscriptionPlan.priceMonthly,
        priceYearly: schema.subscriptionPlan.priceYearly,
        trialDays: schema.subscriptionPlan.trialDays,
        isActive: schema.subscriptionPlan.isActive,
      })
      .from(schema.subscriptionPlan)
      .where(eq(schema.subscriptionPlan.code, plan.code));

    const wanted = {
      name: plan.name,
      priceMonthly: plan.priceMonthly,
      priceYearly: plan.priceYearly,
      trialDays: plan.trialDays,
      isActive: true,
    };

    if (!existing) {
      console.log(`+ ${plan.code}: create at ฿${plan.priceMonthly}/เดือน`);
      changed += 1;
      if (apply) await db.insert(schema.subscriptionPlan).values({ code: plan.code, ...wanted });
      continue;
    }

    const differences = [
      existing.name !== wanted.name ? `name ${existing.name} -> ${wanted.name}` : null,
      existing.priceMonthly !== wanted.priceMonthly
        ? `monthly ${existing.priceMonthly} -> ${wanted.priceMonthly}`
        : null,
      existing.priceYearly !== wanted.priceYearly
        ? `yearly ${existing.priceYearly ?? '-'} -> ${wanted.priceYearly ?? '-'}`
        : null,
      existing.trialDays !== wanted.trialDays
        ? `trial ${existing.trialDays} -> ${wanted.trialDays}`
        : null,
      existing.isActive !== wanted.isActive ? `active ${existing.isActive} -> true` : null,
    ].filter(Boolean);

    if (differences.length === 0) {
      console.log(`= ${plan.code}: already matches`);
      continue;
    }

    console.log(`~ ${plan.code}: ${differences.join(', ')}`);
    changed += 1;
    if (apply) {
      await db
        .update(schema.subscriptionPlan)
        .set(wanted)
        .where(eq(schema.subscriptionPlan.code, plan.code));
    }
  }

  // Anything priced that the catalogue no longer lists is left alone but
  // named: a plan a shop is still on must not vanish because a file changed.
  const strays = await db
    .select({ code: schema.subscriptionPlan.code, isActive: schema.subscriptionPlan.isActive })
    .from(schema.subscriptionPlan);
  for (const row of strays) {
    if (!PLANS.some((plan) => plan.code === row.code) && row.isActive) {
      console.log(`! ${row.code}: active but not in the catalogue — left as it is`);
    }
  }

  console.log(
    changed === 0
      ? 'nothing to do'
      : apply
        ? `${changed} plan(s) updated`
        : `${changed} plan(s) would change — re-run with --apply`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
