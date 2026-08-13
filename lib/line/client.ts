/**
 * LINE Messaging API transport.
 *
 * Iron rule #6: nothing here is ever called from an HTTP request handler except
 * `reply()`, which must answer within the reply token's short lifetime and
 * costs nothing. Push messages go through notification_queue and the worker.
 */
import { and, eq } from 'drizzle-orm';
import { schema } from '@/lib/db/client';
import type { TenantTx } from '@/lib/db/tenant';
import { decryptSecret } from '@/lib/crypto';
import type { LineClient, LineMessage } from './types';

const API_BASE = process.env.LINE_API_BASE ?? 'https://api.line.me';

export class LineApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`LINE API responded ${status}: ${body}`);
    this.name = 'LineApiError';
  }

  /** 429 and 5xx are worth another attempt; 4xx means the message is wrong. */
  get isRetryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export function createLineClient(channelAccessToken: string): LineClient {
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${channelAccessToken}`,
  };

  async function post(path: string, payload: unknown): Promise<void> {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new LineApiError(response.status, await response.text().catch(() => ''));
    }
  }

  return {
    // Free, and always preferred where a reply token is available.
    reply: (replyToken, messages) => post('/v2/bot/message/reply', { replyToken, messages }),
    // Counts against the tenant's monthly quota.
    push: (to, messages) => post('/v2/bot/message/push', { to, messages }),
  };
}

export interface TenantLineCredentials {
  channelId: string;
  channelAccessToken: string;
  channelSecret: string;
  liffId: string | null;
}

/** Reads and decrypts a tenant's channel credentials. Null when not set up yet. */
export async function loadLineCredentials(
  tx: TenantTx,
  tenantId: string,
): Promise<TenantLineCredentials | null> {
  const [row] = await tx
    .select()
    .from(schema.tenantLineChannel)
    .where(
      and(
        eq(schema.tenantLineChannel.tenantId, tenantId),
        eq(schema.tenantLineChannel.isActive, true),
      ),
    );
  if (!row) return null;

  return {
    channelId: row.channelId,
    channelAccessToken: decryptSecret(row.channelAccessTokenEnc),
    channelSecret: decryptSecret(row.channelSecretEnc),
    liffId: row.liffId,
  };
}

/**
 * A client that records instead of sending. Used by the tests, and by a local
 * dev environment that has no LINE channel configured — better a logged message
 * than a crash on every booking.
 */
export function createRecordingLineClient(): LineClient & {
  sent: Array<{ kind: 'reply' | 'push'; to: string; messages: LineMessage[] }>;
} {
  const sent: Array<{ kind: 'reply' | 'push'; to: string; messages: LineMessage[] }> = [];
  return {
    sent,
    async reply(replyToken, messages) {
      sent.push({ kind: 'reply', to: replyToken, messages });
    },
    async push(to, messages) {
      sent.push({ kind: 'push', to, messages });
    },
  };
}
