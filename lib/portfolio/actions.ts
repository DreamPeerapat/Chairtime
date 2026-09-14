'use server';

/**
 * Server actions for the portfolio.
 *
 * Like lib/admin/actions.ts, every one re-reads the session rather than
 * trusting a tenant id from the form. The blob store holds files for every
 * shop, so a tenant id off a hidden field would be an attacker's way into
 * another shop's photos.
 */
import { del } from '@vercel/blob';
import { revalidatePath } from 'next/cache';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { requireSession } from '@/lib/auth';
import { findBlobPathname } from './queries';
import { portfolioItemSchema, portfolioUpdateSchema } from './validation';
import { z } from 'zod';

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const ok: ActionResult = { ok: true };
const fail = (error: string): ActionResult => ({ ok: false, error });

function revalidate(tenantSlug: string): void {
  revalidatePath('/dashboard/portfolio');
  revalidatePath(`/${tenantSlug}/gallery`);
  revalidatePath(`/${tenantSlug}`);
}

/** Record a photo the browser has already uploaded to the blob store. */
export async function addPortfolioItem(input: unknown): Promise<ActionResult> {
  const session = await requireSession('manager');
  const parsed = portfolioItemSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');

  const { imageUrl, blobPathname, caption, resourceId, serviceId } = parsed.data;

  await withTenant(session.tenantId, async (tx) => {
    // New photos go to the front: the shop just chose to show this one.
    const [first] = await tx
      .select({
        nextOrder: sql<number>`coalesce(min(${schema.portfolioItem.displayOrder}), 0) - 1`,
      })
      .from(schema.portfolioItem)
      .where(eq(schema.portfolioItem.tenantId, session.tenantId));

    await tx.insert(schema.portfolioItem).values({
      tenantId: session.tenantId,
      imageUrl,
      blobPathname: blobPathname ?? null,
      caption,
      resourceId,
      serviceId,
      displayOrder: first?.nextOrder ?? 0,
    });
  });

  revalidate(session.tenantSlug);
  return ok;
}

export async function updatePortfolioItem(input: unknown): Promise<ActionResult> {
  const session = await requireSession('manager');
  const parsed = portfolioUpdateSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'ข้อมูลไม่ถูกต้อง');

  const { id, caption, resourceId, serviceId, isPublished } = parsed.data;

  await withTenant(session.tenantId, (tx) =>
    tx
      .update(schema.portfolioItem)
      .set({ caption, resourceId, serviceId, isPublished })
      .where(
        and(
          eq(schema.portfolioItem.tenantId, session.tenantId),
          eq(schema.portfolioItem.id, id),
        ),
      ),
  );

  revalidate(session.tenantSlug);
  return ok;
}

/**
 * Remove a photo, and the file behind it.
 *
 * The row goes first. If the blob delete then fails the shop has an orphaned
 * file costing a few kilobytes, which is a bill; the other order risks a row
 * pointing at a file that no longer exists, which is a broken gallery.
 */
export async function deletePortfolioItem(input: unknown): Promise<ActionResult> {
  const session = await requireSession('manager');
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return fail('ไม่พบรูปที่ต้องการลบ');

  const pathname = await findBlobPathname(session.tenantId, parsed.data.id);

  await withTenant(session.tenantId, (tx) =>
    tx
      .delete(schema.portfolioItem)
      .where(
        and(
          eq(schema.portfolioItem.tenantId, session.tenantId),
          eq(schema.portfolioItem.id, parsed.data.id),
        ),
      ),
  );

  if (pathname) {
    try {
      await del(pathname);
    } catch (error) {
      // Not worth failing the action the shop asked for — the photo is gone
      // from their gallery either way. Logged so the orphan can be swept up.
      console.error('[portfolio] blob delete failed', { pathname, error });
    }
  }

  revalidate(session.tenantSlug);
  return ok;
}

/** Move one photo up or down in the gallery. */
export async function reorderPortfolioItem(input: unknown): Promise<ActionResult> {
  const session = await requireSession('manager');
  const parsed = z
    .object({ id: z.string().uuid(), direction: z.enum(['up', 'down']) })
    .safeParse(input);
  if (!parsed.success) return fail('ข้อมูลไม่ถูกต้อง');

  const { id, direction } = parsed.data;

  await withTenant(session.tenantId, async (tx) => {
    const rows = await tx
      .select({ id: schema.portfolioItem.id })
      .from(schema.portfolioItem)
      .where(eq(schema.portfolioItem.tenantId, session.tenantId))
      .orderBy(schema.portfolioItem.displayOrder, schema.portfolioItem.createdAt);

    const index = rows.findIndex((r) => r.id === id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= rows.length) return;

    // Rewrite the whole list rather than swapping two values: display_order
    // starts out full of duplicates (every new photo takes min-1), and a swap
    // between two equal values does nothing at all.
    const reordered = [...rows];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(target, 0, moved!);

    for (const [position, row] of reordered.entries()) {
      await tx
        .update(schema.portfolioItem)
        .set({ displayOrder: position })
        .where(eq(schema.portfolioItem.id, row.id));
    }
  });

  revalidate(session.tenantSlug);
  return ok;
}
