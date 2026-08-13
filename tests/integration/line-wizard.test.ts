/**
 * The manual LINE OA wizard against a real database — docs/prompts.md ข้อ 5.7:
 * a wrong token must fail with a real error, a correct token must verify,
 * and progress must survive closing the tab mid-way.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sqlClient } from '@/lib/db/client';
import { loadWizardState, markStepDone, saveCredentials, testConnection } from '@/lib/line/wizard';
import { createSimpleShop, resetDatabase } from '../support/db';

afterAll(async () => {
  await sqlClient.end();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

let shop: Awaited<ReturnType<typeof createSimpleShop>>;

beforeEach(async () => {
  process.env.SECRET_ENCRYPTION_KEY ??= Buffer.alloc(32, 9).toString('base64');
  await resetDatabase();
  shop = await createSimpleShop({ slug: 'line-wizard-shop' });
});

describe('checklist state', () => {
  it('starts with every step pending', async () => {
    const state = await loadWizardState(shop.tenantId);
    expect(state).toMatchObject({
      stepOaCreated: false,
      stepApiEnabled: false,
      stepTokenSaved: false,
      stepWebhookVerified: false,
      isVerified: false,
    });
  });

  it('resumes exactly where a shop left off after closing the tab', async () => {
    await markStepDone(shop.tenantId, 'stepOaCreated');
    await markStepDone(shop.tenantId, 'stepApiEnabled');
    await saveCredentials(shop.tenantId, 'line-wizard-shop', 'a-token-value', 'a-secret-value');

    // "reopening the tab" is just reading the same row again — nothing lives in memory.
    const reloaded = await loadWizardState(shop.tenantId);
    expect(reloaded.stepOaCreated).toBe(true);
    expect(reloaded.stepApiEnabled).toBe(true);
    expect(reloaded.stepTokenSaved).toBe(true);
    expect(reloaded.stepWebhookVerified).toBe(false); // step 4 never ran
    expect(reloaded.webhookUrl).toBe(
      `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/webhooks/line/line-wizard-shop`,
    );
  });
});

describe('ทดสอบเชื่อมต่อ', () => {
  it('refuses to test before a token has been saved', async () => {
    const result = await testConnection(shop.tenantId);
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining('ขั้นตอนที่ 3') });
  });

  it('gives a Thai error and never verifies when the token is wrong', async () => {
    await saveCredentials(shop.tenantId, 'line-wizard-shop', 'wrong-token', 'wrong-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );

    const result = await testConnection(shop.tenantId);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Token ไม่ถูกต้อง');

    const state = await loadWizardState(shop.tenantId);
    expect(state.isVerified).toBe(false);
    expect(state.stepWebhookVerified).toBe(false);
    expect(state.lastError).toContain('Token ไม่ถูกต้อง');
  });

  it('marks is_verified = true and stores the OA basic id when the token is correct', async () => {
    await saveCredentials(shop.tenantId, 'line-wizard-shop', 'right-token', 'right-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ basicId: '@example-shop', displayName: 'ร้านทดสอบ' }), { status: 200 }),
      ),
    );

    const result = await testConnection(shop.tenantId);
    expect(result).toEqual({ ok: true, basicId: '@example-shop' });

    const state = await loadWizardState(shop.tenantId);
    expect(state.isVerified).toBe(true);
    expect(state.stepWebhookVerified).toBe(true);
    expect(state.oaBasicId).toBe('@example-shop');
    expect(state.lastError).toBeNull();
    expect(state.connectedAt).toBeInstanceOf(Date);
  });

  it('re-testing after fixing a bad token clears the previous error', async () => {
    await saveCredentials(shop.tenantId, 'line-wizard-shop', 'bad-token', 'bad-secret');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    await testConnection(shop.tenantId);
    expect((await loadWizardState(shop.tenantId)).lastError).not.toBeNull();

    await saveCredentials(shop.tenantId, 'line-wizard-shop', 'good-token', 'good-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ basicId: '@fixed' }), { status: 200 })),
    );
    await testConnection(shop.tenantId);

    const state = await loadWizardState(shop.tenantId);
    expect(state.isVerified).toBe(true);
    expect(state.lastError).toBeNull();
  });
});
