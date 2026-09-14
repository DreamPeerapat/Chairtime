/**
 * Finishing the onboarding wizard — docs/roadmap.md Phase 2.5: "ชื่อร้าน,
 * เวลาทำการ, แก้ราคาจาก template". Setting `onboarded_at` is what iron rule
 * #7 checks before letting a session into the dashboard.
 */
import { and, eq, isNull } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';

export interface CompleteSetupInput {
  tenantId: string;
  openTime: string; // "HH:MM", applied to every weekday — per-day hours are a dashboard/settings edit
  closeTime: string;
  servicePrices: Array<{ serviceId: string; price: number }>;
  /** how many people work here, and how many chairs/beds/tables they work at */
  staffCount: number;
  seatCount: number;
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

    await provisionResources(tx, input);

    await tx.update(schema.tenant).set({ onboardedAt: new Date() }).where(eq(schema.tenant.id, input.tenantId));
  });
}

/**
 * Give the shop the staff and seats its services require.
 *
 * `copy_business_template` creates resource *types* — "ช่างทำเล็บ", "โต๊ะทำเล็บ"
 * — and points every service at them, but never puts anything in them. A shop
 * that finished the wizard therefore had services nobody could perform, and
 * the booking page answered every date with "ไม่มีเวลาว่าง" forever. The names
 * are placeholders the owner renames in the dashboard; what matters is that
 * the shop is bookable the moment the wizard closes.
 */
async function provisionResources(
  tx: TenantTx,
  input: CompleteSetupInput,
): Promise<void> {
  const types = await tx
    .select()
    .from(schema.resourceType)
    .where(eq(schema.resourceType.tenantId, input.tenantId));
  if (types.length === 0) return;

  const existing = await tx
    .select({ id: schema.resource.id })
    .from(schema.resource)
    .where(eq(schema.resource.tenantId, input.tenantId));
  // Re-running the wizard must not double the roster.
  if (existing.length > 0) return;

  const humanType = types.find((t) => t.isHuman);
  const seatType = types.find((t) => !t.isHuman);

  const staffIds: string[] = [];
  if (humanType) {
    for (let i = 0; i < input.staffCount; i += 1) {
      const [row] = await tx
        .insert(schema.resource)
        .values({
          tenantId: input.tenantId,
          resourceTypeId: humanType.id,
          name: `${humanType.name} ${i + 1}`,
          displayOrder: i,
        })
        .returning({ id: schema.resource.id });
      staffIds.push(row!.id);
    }
  }

  if (seatType) {
    for (let i = 0; i < input.seatCount; i += 1) {
      await tx.insert(schema.resource).values({
        tenantId: input.tenantId,
        resourceTypeId: seatType.id,
        name: `${seatType.name} ${i + 1}`,
        displayOrder: i,
        // A seat is not something the customer picks; it is assigned.
        isBookable: false,
      });
    }
  }

  // Iron rule of the search (lib/availability/search.ts): one person must hold
  // the skill for every service in the basket, so a staff member with no skill
  // rows is invisible to availability. Start everyone able to do everything —
  // narrowing is a deliberate edit in the dashboard, and a far less costly
  // mistake than a shop that silently cannot be booked.
  const services = await tx
    .select({ id: schema.service.id })
    .from(schema.service)
    .where(eq(schema.service.tenantId, input.tenantId));

  if (staffIds.length > 0 && services.length > 0) {
    await tx.insert(schema.resourceServiceSkill).values(
      staffIds.flatMap((resourceId) =>
        services.map((svc) => ({ resourceId, serviceId: svc.id })),
      ),
    );
  }
}
