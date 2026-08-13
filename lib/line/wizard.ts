/** Shared by the CLI connector and the settings wizard (docs/logic.md ข้อ 1.6). */
export function webhookUrlFor(tenantSlug: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return `${base}/api/webhooks/line/${tenantSlug}`;
}
