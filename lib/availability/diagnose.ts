/**
 * Why a shop has no slots — the configuration half of the answer.
 *
 * `findSlots` returns `[]` both when today is simply full and when the shop
 * could never be booked at all, and the two need opposite responses: "try
 * another day" for the first, "the shop has not finished setting up" for the
 * second. This module answers only the second question, and like `search.ts`
 * it is pure — same `AvailabilityContext` in, no database, no clock.
 *
 * The checks deliberately mirror what `findSlots` actually enforces. If they
 * ever drift, the dashboard would tell an owner everything is fine while
 * customers see an empty calendar — which is the failure this exists to stop.
 */
import type { AvailabilityContext, ServiceSpec } from './types';

export type SetupProblemCode =
  | 'no_business_hours'
  | 'no_services'
  | 'no_resources'
  | 'missing_resource_type'
  | 'no_skilled_staff';

export interface SetupProblem {
  code: SetupProblemCode;
  /** Thai, shown to the shop owner. Customers get one generic line instead. */
  message: string;
  /** what is missing — resource type names, or the services nobody can do */
  names: string[];
}

/**
 * Every reason this shop cannot serve `serviceIds`, most fundamental first.
 * An empty array means the setup is sound; any slot shortage is then genuinely
 * about the day being full.
 */
export function diagnoseSetup(ctx: AvailabilityContext, serviceIds: string[]): SetupProblem[] {
  const problems: SetupProblem[] = [];
  const services = serviceIds
    .map((id) => ctx.services.find((s) => s.id === id))
    .filter((s): s is ServiceSpec => s !== undefined);

  if (!hasAnyOpenDay(ctx)) {
    problems.push({
      code: 'no_business_hours',
      message: 'ยังไม่ได้ตั้งเวลาทำการ ลูกค้าจะไม่เห็นเวลาว่างเลย',
      names: [],
    });
  }

  // The shop-wide check passes every active service, so an empty basket here
  // means the shop has none — a question findSlots refuses to be asked.
  if (services.length === 0) {
    problems.push({
      code: 'no_services',
      message: 'ยังไม่มีบริการที่เปิดให้จอง',
      names: [],
    });
  }

  // With nothing at all, naming each empty type is noise — the owner has one
  // job, and it is the same job for every type.
  if (ctx.resources.length === 0) {
    problems.push({
      code: 'no_resources',
      message: 'ยังไม่ได้เพิ่มช่างหรืออุปกรณ์ ทุกบริการต้องใช้อย่างน้อยอย่างละหนึ่ง',
      names: [],
    });
    return problems;
  }

  const requiredTypeIds = new Set<string>();
  for (const svc of services) for (const req of svc.requirements) requiredTypeIds.add(req.resourceTypeId);

  const filledTypeIds = new Set(ctx.resources.map((r) => r.resourceTypeId));
  const emptyTypeNames = [...requiredTypeIds]
    .filter((typeId) => !filledTypeIds.has(typeId))
    .map((typeId) => ctx.resourceTypes.find((t) => t.id === typeId)?.name ?? typeId);

  if (emptyTypeNames.length > 0) {
    problems.push({
      code: 'missing_resource_type',
      message: `ยังไม่มี ${emptyTypeNames.join(', ')} ซึ่งบริการที่เลือกต้องใช้`,
      names: emptyTypeNames,
    });
  }

  // Mirrors eligibleStaff(): one person must cover the whole basket, so a
  // shop where two people each know half of it still cannot take the booking.
  const humanTypeIds = new Set(ctx.resourceTypes.filter((t) => t.isHuman).map((t) => t.id));
  const needsHuman = [...requiredTypeIds].some((typeId) => humanTypeIds.has(typeId));

  if (needsHuman && emptyTypeNames.length === 0) {
    const staff = ctx.resources.filter((r) => humanTypeIds.has(r.resourceTypeId));
    const covered = staff.some((r) => services.every((svc) => r.skills.has(svc.id)));

    if (!covered) {
      const unreachable = services
        .filter((svc) => !staff.some((r) => r.skills.has(svc.id)))
        .map((svc) => svc.name);

      problems.push({
        code: 'no_skilled_staff',
        message:
          unreachable.length > 0
            ? `ยังไม่ได้ระบุว่าใครทำ ${unreachable.join(', ')} ได้`
            : 'ต้องมีช่างหนึ่งคนที่ทำได้ครบทุกบริการที่ลูกค้าเลือก',
        names: unreachable,
      });
    }
  }

  return problems;
}

function hasAnyOpenDay(ctx: AvailabilityContext): boolean {
  for (const windows of ctx.shopHours.values()) {
    if (windows.length > 0) return true;
  }
  return false;
}
