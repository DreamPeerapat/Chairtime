/**
 * Turning a shop name into a URL slug — docs/logic.md ข้อ 1.5 "จุดที่ต้องระวัง":
 * a name collision must never fail signup, so a taken slug just gets a
 * numbered suffix.
 */
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';

const MAX_ATTEMPTS = 20;

export async function generateUniqueSlug(shopName: string, businessType: string): Promise<string> {
  const base = slugify(shopName) || `${slugify(businessType) || 'shop'}-${randomBytes(3).toString('hex')}`;

  if (!(await slugTaken(base))) return base;

  for (let n = 2; n <= MAX_ATTEMPTS; n += 1) {
    const candidate = `${base}-${n}`;
    if (!(await slugTaken(candidate))) return candidate;
  }

  // Astronomically unlikely with a random suffix already in play, but a
  // signup must never simply fail here.
  return `${base}-${randomBytes(3).toString('hex')}`;
}

function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function slugTaken(slug: string): Promise<boolean> {
  const [row] = await db.select({ id: schema.tenant.id }).from(schema.tenant).where(eq(schema.tenant.slug, slug));
  return !!row;
}
