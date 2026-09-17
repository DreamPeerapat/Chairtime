/**
 * The shop owner's own rich menu.
 *
 * The customer menu is built by hand in LINE OA Manager — we hand the shop a
 * PNG and the steps. This one cannot be: attaching a menu to a single person
 * is an API call and nothing else, there is no screen in OA Manager for it.
 * So the product does the whole job, and the owner presses one button.
 *
 * Why per-user at all: the customer menu is what every follower sees, and
 * putting a "back office" button on it offers every customer a door that does
 * not open for them. A menu linked to one user id replaces the default for
 * that user only — the owner sees their four screens, everybody else sees
 * จองคิว as before.
 *
 * Iron rule #6 stands: nothing here sends a message. These are configuration
 * calls, the same class as `testConnection` in the wizard.
 */
import { eq } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { decryptSecret } from '@/lib/crypto';
import { createRichMenuApi, RichMenuError, type RichMenuArea } from './rich-menu-api';
import { OWNER_MENU_CELLS, RICH_MENU_SIZE, ownerRichMenuImage } from './rich-menu';

export interface OwnerMenuResult {
  ok: boolean;
  message: string;
}

export interface OwnerMenuState {
  /** the shop has connected its OA and somebody has claimed the alerts */
  ready: boolean;
  installed: boolean;
}

export async function ownerMenuState(tenantId: string): Promise<OwnerMenuState> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        token: schema.tenantLineOa.channelAccessToken,
        owner: schema.tenantLineOa.ownerLineUserId,
        menuId: schema.tenantLineOa.ownerRichMenuId,
      })
      .from(schema.tenantLineOa)
      .where(eq(schema.tenantLineOa.tenantId, tenantId)),
  );

  return {
    ready: Boolean(row?.token && row.owner),
    installed: Boolean(row?.menuId),
  };
}

/**
 * Build the menu, upload its picture, and attach it to the owner.
 *
 * Ordered so a failure never leaves the owner with a menu that has no image:
 * create, upload, link, and only then record the id and delete the one it
 * replaced. A crash midway leaves an unattached menu on LINE's side, which is
 * invisible to everyone and is cleaned up by the next successful run.
 */
export async function installOwnerMenu(tenantId: string): Promise<OwnerMenuResult> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        token: schema.tenantLineOa.channelAccessToken,
        owner: schema.tenantLineOa.ownerLineUserId,
        previousMenuId: schema.tenantLineOa.ownerRichMenuId,
        shopName: schema.tenant.name,
      })
      .from(schema.tenantLineOa)
      .innerJoin(schema.tenant, eq(schema.tenant.id, schema.tenantLineOa.tenantId))
      .where(eq(schema.tenantLineOa.tenantId, tenantId)),
  );

  if (!row?.token) {
    return { ok: false, message: 'ยังไม่ได้เชื่อม LINE OA — ทำขั้นตอนที่ 1-4 ให้ครบก่อน' };
  }
  if (!row.owner) {
    return { ok: false, message: 'ยังไม่ได้ผูกบัญชีเจ้าของร้าน — ทำขั้นตอนที่ 6 ก่อน' };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (!base) {
    return { ok: false, message: 'ระบบยังไม่ได้ตั้งค่าที่อยู่เว็บ กรุณาแจ้งผู้ดูแล' };
  }

  const api = createRichMenuApi(decryptSecret(row.token));

  try {
    const richMenuId = await api.create({
      size: RICH_MENU_SIZE,
      selected: true,
      name: `chairtime-owner-${tenantId.slice(0, 8)}`,
      chatBarText: 'หลังร้าน',
      areas: ownerAreas(base),
    });

    const image = await ownerRichMenuImage(row.shopName);
    await api.uploadImage(richMenuId, await image.arrayBuffer());
    await api.linkToUser(row.owner, richMenuId);

    await withTenant(tenantId, (tx) =>
      tx
        .update(schema.tenantLineOa)
        .set({ ownerRichMenuId: richMenuId })
        .where(eq(schema.tenantLineOa.tenantId, tenantId)),
    );

    // Only once the new one is live and recorded. Failing to delete the old
    // menu is untidy, not broken, so it must not fail the whole operation.
    if (row.previousMenuId && row.previousMenuId !== richMenuId) {
      await api.remove(row.previousMenuId).catch(() => {});
    }

    return { ok: true, message: 'สร้างเมนูเจ้าของร้านแล้ว เปิดแชท LINE ของร้านดูได้เลย' };
  } catch (error) {
    console.error('[line] owner rich menu failed', error);
    return { ok: false, message: explain(error) };
  }
}

/** Take the menu off the owner's chat and delete it. */
export async function removeOwnerMenu(tenantId: string): Promise<OwnerMenuResult> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx
      .select({
        token: schema.tenantLineOa.channelAccessToken,
        owner: schema.tenantLineOa.ownerLineUserId,
        menuId: schema.tenantLineOa.ownerRichMenuId,
      })
      .from(schema.tenantLineOa)
      .where(eq(schema.tenantLineOa.tenantId, tenantId)),
  );

  if (!row?.token || !row.menuId) {
    return { ok: false, message: 'ยังไม่มีเมนูเจ้าของร้านให้เอาออก' };
  }

  const api = createRichMenuApi(decryptSecret(row.token));

  try {
    if (row.owner) await api.unlinkFromUser(row.owner);
    await api.remove(row.menuId);

    await withTenant(tenantId, (tx) =>
      tx
        .update(schema.tenantLineOa)
        .set({ ownerRichMenuId: null })
        .where(eq(schema.tenantLineOa.tenantId, tenantId)),
    );

    return { ok: true, message: 'เอาเมนูเจ้าของร้านออกแล้ว — กลับไปเห็นเมนูเดียวกับลูกค้า' };
  } catch (error) {
    console.error('[line] owner rich menu removal failed', error);
    return { ok: false, message: explain(error) };
  }
}

/**
 * Four equal tiles over the bottom two thirds, matching the picture.
 *
 * The bounds are the tap targets and the image is only paint — LINE does not
 * check that they agree, so getting these wrong gives a menu that looks right
 * and opens the wrong page. They are derived from the same constants the
 * image uses rather than typed twice.
 */
function ownerAreas(base: string): RichMenuArea[] {
  const half = RICH_MENU_SIZE.width / 2;
  const header = 180;
  const rowHeight = (RICH_MENU_SIZE.height - header) / 2;

  return OWNER_MENU_CELLS.map((cell, index) => ({
    bounds: {
      x: (index % 2) * half,
      y: header + Math.floor(index / 2) * rowHeight,
      width: half,
      height: rowHeight,
    },
    action: { type: 'uri' as const, label: cell.label, uri: `${base}${cell.path}` },
  }));
}

function explain(error: unknown): string {
  if (error instanceof RichMenuError) {
    if (error.status === 401 || error.status === 403) {
      return 'LINE ปฏิเสธ Token — ลองทดสอบเชื่อมต่อใหม่ในขั้นตอนที่ 4';
    }
    if (error.status === 400) {
      return 'LINE ไม่รับรูปแบบเมนูนี้ กรุณาแจ้งผู้ดูแล';
    }
    return `LINE ตอบกลับผิดพลาด (${error.status})`;
  }
  return 'เชื่อมต่อ LINE ไม่ได้ ลองใหม่อีกครั้ง';
}
