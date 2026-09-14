/**
 * Reads for the portfolio — the shop's own photos of its work.
 *
 * Iron rule #3: everything goes through withTenant, including the customer
 * -facing reads. The gallery is public in the sense that anyone with the shop's
 * link can see it, but "public" is a filter on `is_published`, never a reason
 * to step outside the tenant's row-level security.
 */
import { and, asc, desc, eq } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';

export interface PortfolioPhoto {
  id: string;
  imageUrl: string;
  caption: string | null;
  resourceId: string | null;
  resourceName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  isPublished: boolean;
  displayOrder: number;
}

/** Newest first within a display_order tier, so a fresh upload shows up top. */
function selectPhotos(tx: TenantTx, tenantId: string) {
  return tx
    .select({
      id: schema.portfolioItem.id,
      imageUrl: schema.portfolioItem.imageUrl,
      caption: schema.portfolioItem.caption,
      resourceId: schema.portfolioItem.resourceId,
      resourceName: schema.resource.name,
      serviceId: schema.portfolioItem.serviceId,
      serviceName: schema.service.name,
      isPublished: schema.portfolioItem.isPublished,
      displayOrder: schema.portfolioItem.displayOrder,
    })
    .from(schema.portfolioItem)
    .leftJoin(schema.resource, eq(schema.resource.id, schema.portfolioItem.resourceId))
    .leftJoin(schema.service, eq(schema.service.id, schema.portfolioItem.serviceId))
    .where(eq(schema.portfolioItem.tenantId, tenantId))
    .orderBy(asc(schema.portfolioItem.displayOrder), desc(schema.portfolioItem.createdAt));
}

/** Everything the shop has, published or not — the dashboard view. */
export async function listPortfolioForAdmin(tenantId: string): Promise<PortfolioPhoto[]> {
  return withTenant(tenantId, (tx) => selectPhotos(tx, tenantId));
}

/** Only what the shop chose to show — every customer-facing surface. */
export async function listPublishedPortfolio(tenantId: string): Promise<PortfolioPhoto[]> {
  return withTenant(tenantId, (tx) =>
    selectPhotos(tx, tenantId).then((rows) => rows.filter((r) => r.isPublished)),
  );
}

/**
 * Published photos grouped by the staff member who did the work, for the
 * booking flow's staff step. Photos filed under nobody are left out: on that
 * screen a photo with no owner answers a question nobody asked.
 */
export async function listPublishedPortfolioByStaff(
  tenantId: string,
): Promise<Map<string, PortfolioPhoto[]>> {
  const byStaff = new Map<string, PortfolioPhoto[]>();

  // Same reasoning as hasPublishedPortfolio: these photos decorate the staff
  // step. Booking is the thing the customer came for, and it must not fall
  // over because the portfolio did.
  let photos: PortfolioPhoto[];
  try {
    photos = await listPublishedPortfolio(tenantId);
  } catch (error) {
    console.error('[portfolio] staff strip failed', error);
    return byStaff;
  }

  for (const photo of photos) {
    if (!photo.resourceId) continue;
    const list = byStaff.get(photo.resourceId);
    if (list) list.push(photo);
    else byStaff.set(photo.resourceId, [photo]);
  }

  return byStaff;
}

/**
 * Is there anything to show? — for the "ดูผลงาน" link in the shop header.
 *
 * Deliberately cheap and deliberately non-fatal. It runs on every customer
 * page, and it decides one decorative link: a shop whose portfolio query fails
 * must still be able to take bookings, so a failure here means "no link", not
 * a 500 on the booking flow. LIMIT 1 on the (tenant_id, display_order) index.
 */
export async function hasPublishedPortfolio(tenantId: string): Promise<boolean> {
  try {
    return await withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({ id: schema.portfolioItem.id })
        .from(schema.portfolioItem)
        .where(
          and(
            eq(schema.portfolioItem.tenantId, tenantId),
            eq(schema.portfolioItem.isPublished, true),
          ),
        )
        .limit(1);
      return Boolean(row);
    });
  } catch (error) {
    console.error('[portfolio] header link check failed', error);
    return false;
  }
}

/** The blob pathname for one photo, so the file can be deleted with the row. */
export async function findBlobPathname(tenantId: string, id: string): Promise<string | null> {
  return withTenant(tenantId, async (tx) => {
    const [row] = await tx
      .select({ blobPathname: schema.portfolioItem.blobPathname })
      .from(schema.portfolioItem)
      .where(
        and(eq(schema.portfolioItem.tenantId, tenantId), eq(schema.portfolioItem.id, id)),
      );
    return row?.blobPathname ?? null;
  });
}
