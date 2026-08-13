/**
 * Finishing the onboarding wizard — docs/roadmap.md Phase 2.5: "ชื่อร้าน,
 * เวลาทำการ, แก้ราคาจาก template". Setting `onboarded_at` is what iron rule
 * #7 checks before letting a session into the dashboard.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';

export interface CompleteSetupInput {
  tenantId: string;
  openTime: string; // "HH:MM", applied to every weekday — per-day hours are a dashboard/settings edit
  closeTime: string;
  servicePrices: Array<{ serviceId: string; price: number }>;
}

export async function completeOnboarding(input: CompleteSetupInput): Promise<void> {
  await withTenant(input.tenantId, async (tx) => {
    await tx
      .delete(schema.businessHour)
      .where(and(eq(schema.businessHour.tenantId, input.tenantId), isNull(schema.businessHour.resourceId)));

    await tx.insert(schema.businessHour).values(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        tenantId: input.tenantId,
        resourceId: null,
        weekday,
        openTime: `${input.openTime}:00`,
        closeTime: `${input.closeTime}:00`,
      })),
    );

    for (const svc of input.servicePrices) {
      await tx
        .update(schema.service)
        .set({ basePrice: svc.price.toFixed(2) })
        .where(and(eq(schema.service.tenantId, input.tenantId), eq(schema.service.id, svc.serviceId)));
    }

    await tx.update(schema.tenant).set({ onboardedAt: new Date() }).where(eq(schema.tenant.id, input.tenantId));
  });
}
