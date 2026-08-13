/**
 * Connecting a tenant's LINE Official Account from the command line.
 *
 * The shop-facing path is the 4-step wizard in dashboard/settings
 * (docs/logic.md ข้อ 1.6, lib/line/wizard.ts); this script exists for local
 * dev and one-off support, where typing credentials into a terminal beats
 * pasting them into a web form that isn't running yet.
 *
 *   pnpm tsx lib/line/connect.ts \
 *     --slug thehair-thonglor \
 *     --token <channel access token> \
 *     --secret <channel secret> \
 *     [--liff 1234567890-abcdefgh] [--basic-id @xxxxx]
 */
import { eq } from 'drizzle-orm';
import { loadEnv } from '@/lib/env';

loadEnv();

import { db, schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { encryptSecret } from '@/lib/crypto';
import { webhookUrlFor } from './wizard';

export interface ConnectInput {
  tenantId: string;
  tenantSlug: string;
  channelAccessToken: string;
  channelSecret: string;
  liffId?: string | null;
  basicId?: string | null;
}

/**
 * Store (or replace) a tenant's channel credentials, encrypted, and mark the
 * wizard complete — this is the CLI, run by someone who already knows the
 * token is real, so it skips the "test connection" step's own verification.
 */
export async function connectLineChannel(input: ConnectInput): Promise<void> {
  await withTenant(input.tenantId, (tx) =>
    tx
      .insert(schema.tenantLineOa)
      .values({
        tenantId: input.tenantId,
        channelAccessToken: encryptSecret(input.channelAccessToken),
        channelSecret: encryptSecret(input.channelSecret),
        liffId: input.liffId ?? null,
        oaBasicId: input.basicId ?? null,
        webhookUrl: webhookUrlFor(input.tenantSlug),
        stepOaCreated: true,
        stepApiEnabled: true,
        stepTokenSaved: true,
        stepWebhookVerified: true,
        isVerified: true,
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.tenantLineOa.tenantId,
        set: {
          channelAccessToken: encryptSecret(input.channelAccessToken),
          channelSecret: encryptSecret(input.channelSecret),
          liffId: input.liffId ?? null,
          oaBasicId: input.basicId ?? null,
          webhookUrl: webhookUrlFor(input.tenantSlug),
          stepOaCreated: true,
          stepApiEnabled: true,
          stepTokenSaved: true,
          stepWebhookVerified: true,
          isVerified: true,
          connectedAt: new Date(),
          lastVerifiedAt: new Date(),
          updatedAt: new Date(),
        },
      }),
  );
}

export async function disconnectLineChannel(tenantId: string): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx
      .update(schema.tenantLineOa)
      .set({ isVerified: false, updatedAt: new Date() })
      .where(eq(schema.tenantLineOa.tenantId, tenantId)),
  );
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const slug = arg('slug');
  const token = arg('token');
  const secret = arg('secret');

  if (!slug || !token || !secret) {
    console.error(
      'usage: pnpm tsx lib/line/connect.ts --slug <shop> --token <token> --secret <secret> [--liff <id>] [--basic-id <@id>]',
    );
    process.exit(1);
  }

  const [tenant] = await db
    .select({ id: schema.tenant.id, name: schema.tenant.name })
    .from(schema.tenant)
    .where(eq(schema.tenant.slug, slug));

  if (!tenant) {
    console.error(`no shop with slug ${slug}`);
    process.exit(1);
  }

  await connectLineChannel({
    tenantId: tenant.id,
    tenantSlug: slug,
    channelAccessToken: token,
    channelSecret: secret,
    liffId: arg('liff') ?? null,
    basicId: arg('basic-id') ?? null,
  });

  console.log(`connected LINE channel for ${tenant.name}`);
  console.log(`webhook URL: ${webhookUrlFor(slug)}`);
}

if (process.argv[1]?.endsWith('connect.ts')) {
  main()
    .then(() => sqlClient.end())
    .catch(async (error) => {
      console.error(error);
      await sqlClient.end();
      process.exit(1);
    });
}
