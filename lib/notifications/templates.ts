/** The notification templates from docs/logic.md §5. */
export const NOTIFICATION_TEMPLATES = [
  'booking_confirmed',
  'booking_cancelled',
  'reminder_24h',
  'reminder_2h',
  'points_earned',
  'points_expiring',
  'tier_up',
  'birthday',
  'winback',
] as const;

export type NotificationTemplate = (typeof NOTIFICATION_TEMPLATES)[number];

/**
 * How long before the appointment each reminder goes out.
 * docs/logic.md notes reminder_24h is the single biggest lever on no-shows.
 */
export const REMINDER_OFFSETS: Partial<Record<NotificationTemplate, { minutesBefore: number }>> = {
  reminder_24h: { minutesBefore: 24 * 60 },
  reminder_2h: { minutesBefore: 2 * 60 },
};

/**
 * The dedupe key is a UNIQUE column, so building it consistently is what stops
 * a retried cron run or a double-clicked button sending twice.
 */
export function dedupeKey(
  template: NotificationTemplate,
  entity: 'booking' | 'customer' | 'lot',
  entityId: string,
  discriminator?: string,
): string {
  return [template, entity, entityId, discriminator].filter(Boolean).join(':');
}
