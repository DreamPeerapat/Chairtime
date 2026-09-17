/**
 * The rich menu endpoints, which are configuration rather than messaging.
 *
 * Iron rule #6 puts every *message* through notification_queue. Nothing here
 * sends one: these create a menu, upload its picture, and attach it to one
 * person — the same class of call as `testConnection` in the wizard, made
 * once when a shop sets itself up, from a server action the owner is sitting
 * in front of.
 *
 * Kept apart from `LineClient` on purpose. That interface is what the worker
 * takes and what the recording test double implements; widening it with four
 * methods no message path uses would make every fake carry them.
 */
const API_BASE = process.env.LINE_API_BASE ?? 'https://api.line.me';
/** Uploads go to a different host. LINE's own split, not ours. */
const DATA_BASE = process.env.LINE_API_DATA_BASE ?? 'https://api-data.line.me';

export class RichMenuError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`LINE rich menu API responded ${status}: ${body}`);
    this.name = 'RichMenuError';
  }
}

export interface RichMenuArea {
  bounds: { x: number; y: number; width: number; height: number };
  action: { type: 'uri'; label: string; uri: string } | { type: 'message'; label: string; text: string };
}

export interface RichMenuDefinition {
  size: { width: number; height: number };
  selected: boolean;
  name: string;
  /** shown on the bar the user taps to open the menu */
  chatBarText: string;
  areas: RichMenuArea[];
}

export interface RichMenuApi {
  create(definition: RichMenuDefinition): Promise<string>;
  uploadImage(richMenuId: string, png: ArrayBuffer): Promise<void>;
  linkToUser(userId: string, richMenuId: string): Promise<void>;
  unlinkFromUser(userId: string): Promise<void>;
  remove(richMenuId: string): Promise<void>;
}

export function createRichMenuApi(channelAccessToken: string): RichMenuApi {
  const auth = { authorization: `Bearer ${channelAccessToken}` };

  async function json<T>(path: string, method: string, payload?: unknown): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: payload ? { ...auth, 'content-type': 'application/json' } : auth,
      body: payload ? JSON.stringify(payload) : undefined,
    });
    if (!response.ok) {
      throw new RichMenuError(response.status, await response.text().catch(() => ''));
    }
    return (await response.json().catch(() => ({}))) as T;
  }

  return {
    async create(definition) {
      const { richMenuId } = await json<{ richMenuId: string }>(
        '/v2/bot/richmenu',
        'POST',
        definition,
      );
      return richMenuId;
    },

    async uploadImage(richMenuId, png) {
      const response = await fetch(`${DATA_BASE}/v2/bot/richmenu/${richMenuId}/content`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'image/png' },
        body: png,
      });
      if (!response.ok) {
        throw new RichMenuError(response.status, await response.text().catch(() => ''));
      }
    },

    async linkToUser(userId, richMenuId) {
      const response = await fetch(`${API_BASE}/v2/bot/user/${userId}/richmenu/${richMenuId}`, {
        method: 'POST',
        headers: auth,
      });
      if (!response.ok) {
        throw new RichMenuError(response.status, await response.text().catch(() => ''));
      }
    },

    async unlinkFromUser(userId) {
      const response = await fetch(`${API_BASE}/v2/bot/user/${userId}/richmenu`, {
        method: 'DELETE',
        headers: auth,
      });
      // 404 means there was nothing linked, which is the state we wanted.
      if (!response.ok && response.status !== 404) {
        throw new RichMenuError(response.status, await response.text().catch(() => ''));
      }
    },

    async remove(richMenuId) {
      const response = await fetch(`${API_BASE}/v2/bot/richmenu/${richMenuId}`, {
        method: 'DELETE',
        headers: auth,
      });
      if (!response.ok && response.status !== 404) {
        throw new RichMenuError(response.status, await response.text().catch(() => ''));
      }
    },
  };
}
