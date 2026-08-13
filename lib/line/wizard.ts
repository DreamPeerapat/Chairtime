/**
 * The manual LINE OA connection wizard — docs/logic.md ข้อ 1.6. Four
 * independently-tracked steps so a shop that closes the tab mid-way resumes
 * exactly where it left off, per CLAUDE.md iron rule #6.
 */
import { eq } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import { withTenant, type TenantTx } from '@/lib/db/tenant';
import { encryptSecret, decryptSecret } from '@/lib/crypto';

/** Shared by the CLI connector and this wizard. */
export function webhookUrlFor(tenantSlug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return `${base}/api/webhooks/line/${tenantSlug}`;
}

export interface WizardState {
  stepOaCreated: boolean;
  stepApiEnabled: boolean;
  stepTokenSaved: boolean;
  stepWebhookVerified: boolean;
  isVerified: boolean;
  oaBasicId: string | null;
  webhookUrl: string | null;
  lastError: string | null;
  connectedAt: Date | null;
}

const EMPTY_STATE: WizardState = {
  stepOaCreated: false,
  stepApiEnabled: false,
  stepTokenSaved: false,
  stepWebhookVerified: false,
  isVerified: false,
  oaBasicId: null,
  webhookUrl: null,
  lastError: null,
  connectedAt: null,
};

export async function loadWizardState(tenantId: string): Promise<WizardState> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx.select().from(schema.tenantLineOa).where(eq(schema.tenantLineOa.tenantId, tenantId)),
  );
  return row ? { ...row } : EMPTY_STATE;
}

async function ensureRow(tx: TenantTx, tenantId: string) {
  await tx.insert(schema.tenantLineOa).values({ tenantId }).onConflictDoNothing({
    target: schema.tenantLineOa.tenantId,
  });
}

export async function markStepDone(
  tenantId: string,
  step: 'stepOaCreated' | 'stepApiEnabled',
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await ensureRow(tx, tenantId);
    await tx
      .update(schema.tenantLineOa)
      .set({ [step]: true, updatedAt: new Date() })
      .where(eq(schema.tenantLineOa.tenantId, tenantId));
  });
}

export async function saveCredentials(
  tenantId: string,
  tenantSlug: string,
  channelAccessToken: string,
  channelSecret: string,
): Promise<void> {
  await withTenant(tenantId, async (tx) => {
    await ensureRow(tx, tenantId);
    await tx
      .update(schema.tenantLineOa)
      .set({
        channelAccessToken: encryptSecret(channelAccessToken),
        channelSecret: encryptSecret(channelSecret),
        webhookUrl: webhookUrlFor(tenantSlug),
        stepTokenSaved: true,
        // a new token invalidates whatever the last test proved
        isVerified: false,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tenantLineOa.tenantId, tenantId));
  });
}

export type TestConnectionResult =
  | { ok: true; basicId: string | null }
  | { ok: false; message: string };

/**
 * "ปุ่มทดสอบ ต้องเรียก LINE API จริงทันที ไม่ใช่แค่เช็ครูปแบบ token" —
 * docs/logic.md ข้อ 1.6. `GET /v2/bot/info` is the cheapest real call: it
 * fails exactly the way a bad token or missing Messaging API scope would.
 */
export async function testConnection(tenantId: string): Promise<TestConnectionResult> {
  const [row] = await withTenant(tenantId, (tx) =>
    tx.select().from(schema.tenantLineOa).where(eq(schema.tenantLineOa.tenantId, tenantId)),
  );
  if (!row?.channelAccessToken) {
    return { ok: false, message: 'ยังไม่ได้บันทึก Token กรุณาทำขั้นตอนที่ 3 ก่อน' };
  }

  let response: Response;
  try {
    response = await fetch('https://api.line.me/v2/bot/info', {
      headers: { authorization: `Bearer ${decryptSecret(row.channelAccessToken)}` },
    });
  } catch {
    const message = 'เชื่อมต่อ LINE API ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
    await recordError(tenantId, message);
    return { ok: false, message };
  }

  if (!response.ok) {
    const message = describeLineError(response.status);
    await recordError(tenantId, message);
    return { ok: false, message };
  }

  const info = (await response.json().catch(() => ({}))) as { basicId?: string };

  await withTenant(tenantId, (tx) =>
    tx
      .update(schema.tenantLineOa)
      .set({
        isVerified: true,
        stepWebhookVerified: true,
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
        lastError: null,
        oaBasicId: info.basicId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.tenantLineOa.tenantId, tenantId)),
  );

  return { ok: true, basicId: info.basicId ?? null };
}

function describeLineError(status: number): string {
  if (status === 401) return 'Channel Access Token ไม่ถูกต้อง กรุณาคัดลอกใหม่จาก LINE Developers Console';
  if (status === 403) return 'Token นี้ไม่มีสิทธิ์ใช้งาน ตรวจสอบว่าเปิด Messaging API ในขั้นตอนที่ 2 แล้ว';
  if (status === 429) return 'เรียก LINE API ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่';
  return `LINE ตอบกลับผิดพลาด (รหัส ${status}) กรุณาลองใหม่อีกครั้ง`;
}

async function recordError(tenantId: string, message: string): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx
      .update(schema.tenantLineOa)
      .set({ lastError: message, updatedAt: new Date() })
      .where(eq(schema.tenantLineOa.tenantId, tenantId)),
  );
}
