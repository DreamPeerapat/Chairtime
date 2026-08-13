/**
 * Connecting a tenant's LINE Official Account.
 *
 * Run by an operator, not by the shop: the channel token is a credential, and
 * pasting it into a web form means it passes through logs, browser history and
 * whatever sits in front of the app. This writes it encrypted in one step.
 *
 *   pnpm tsx lib/line/connect.ts \
 *     --slug thehair-thonglor \
 *     --channel-id 1234567890 \
 *     --token <channel access token> \
 *     --secret <channel secret> \
 *     [--liff 1234567890-abcdefgh]
 */
import { eq } from 'drizzle-orm';
import { loadEnv } from '@/lib/env';

loadEnv();

import { db, schema, sqlClient } from '@/lib/db/client';
import { withTenant } from '@/lib/db/tenant';
import { encryptSecret } from '@/lib/crypto';

export interface ConnectInput {
  tenantId: string;
  channelId: string;
  channelAccessToken: string;
  channelSecret: string;
  liffId?: string | null;
  basicId?: string | null;
}

/** Store (or replace) a tenant's channel credentials, encrypted. */
export async function connectLineChannel(input: ConnectInput): Promise<void> {
  await withTenant(input.tenantId, (tx) =>
    tx
      .insert(schema.tenantLineChannel)
      .values({
        tenantId: input.tenantId,
        channelId: input.channelId,
        channelAccessTokenEnc: encryptSecret(input.channelAccessToken),
        channelSecretEnc: encryptSecret(input.channelSecret),
        liffId: input.liffId ?? null,
        basicId: input.basicId ?? null,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: schema.tenantLineChannel.tenantId,
        set: {
          channelId: input.channelId,
          channelAccessTokenEnc: encryptSecret(input.channelAccessToken),
          channelSecretEnc: encryptSecret(input.channelSecret),
          liffId: input.liffId ?? null,
          basicId: input.basicId ?? null,
          isActive: true,
          updatedAt: new Date(),
        },
      }),
  );
}

export async function disconnectLineChannel(tenantId: string): Promise<void> {
  await withTenant(tenantId, (tx) =>
    tx
      .update(schema.tenantLineChannel)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.tenantLineChannel.tenantId, tenantId)),
  );
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const slug = arg('slug');
  const channelId = arg('channel-id');
  const token = arg('token');
  const secret = arg('secret');

  if (!slug || !channelId || !token || !secret) {
    console.error(
      'usage: pnpm tsx lib/line/connect.ts --slug <shop> --channel-id <id> --token <token> --secret <secret> [--liff <id>]',
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
    channelId,
    channelAccessToken: token,
    channelSecret: secret,
    liffId: arg('liff') ?? null,
  });

  console.log(`connected LINE channel for ${tenant.name}`);
  console.log(`webhook URL: ${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/webhooks/line/${slug}`);
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
