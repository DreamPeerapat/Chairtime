/**
 * copy_business_template — docs/logic.md ข้อ 1.5: a new shop's resource types
 * and services are copied from `business_type_template` so an owner is
 * editing a starting point (prices, names) instead of typing everything from
 * a blank screen.
 */
import { eq } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';

export async function copyBusinessTemplate(
  tx: TenantTx,
  tenantId: string,
  businessType: string,
): Promise<void> {
  const [template] =
    (await tx
      .select()
      .from(schema.businessTypeTemplate)
      .where(eq(schema.businessTypeTemplate.businessType, businessType))) ??
    [];

  const resolved =
    template ??
    (
      await tx
        .select()
        .from(schema.businessTypeTemplate)
        .where(eq(schema.businessTypeTemplate.businessType, 'other'))
    )[0];

  if (!resolved) return; // no templates seeded — leave the shop empty rather than fail signup

  const resourceTypeIds = new Map<string, string>();
  for (const rt of resolved.resourceTypesJson) {
    const [row] = await tx
      .insert(schema.resourceType)
      .values({ tenantId, code: rt.code, name: rt.name, isHuman: rt.is_human })
      .returning({ id: schema.resourceType.id });
    resourceTypeIds.set(rt.code, row!.id);
  }

  for (const [index, svc] of resolved.servicesJson.entries()) {
    const [service] = await tx
      .insert(schema.service)
      .values({
        tenantId,
        name: svc.name,
        basePrice: svc.price.toFixed(2),
        displayOrder: index,
      })
      .returning({ id: schema.service.id });
    const serviceId = service!.id;

    await tx.insert(schema.serviceSegment).values({
      serviceId,
      seq: 1,
      kind: 'active',
      durationMin: svc.duration_min,
    });

    if (resourceTypeIds.size > 0) {
      await tx.insert(schema.serviceResourceRequirement).values(
        resolved.resourceTypesJson.map((rt) => ({
          serviceId,
          resourceTypeId: resourceTypeIds.get(rt.code)!,
          quantity: 1,
          // the human resource is only held while actively working the
          // service; a chair/bed/table is held for the whole booking.
          holdScope: rt.is_human ? ('active_only' as const) : ('whole' as const),
        })),
      );
    }
  }
}
