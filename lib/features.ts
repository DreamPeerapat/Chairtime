/**
 * Feature flags.
 *
 * Plain constants, not env vars or a `tenant` column: flipping one is a code
 * change that goes through review and deploys with the UI it controls, and
 * nobody can turn a half-finished feature on from a dashboard by accident.
 */
import type { NotificationTemplate } from '@/lib/notifications/templates';

/**
 * Points, tiers and rewards are hidden while the product is still pre-launch.
 *
 * Hidden, not switched off: `point_ledger` keeps filling up behind the scenes
 * (iron rule #2 makes it append-only anyway, so there is nothing to unwind),
 * which means the day this flips to `true` every customer already has the
 * balance their past visits earned. What must NOT happen meanwhile is the
 * shop's LINE OA telling a customer about points they cannot see or spend —
 * `enqueue` drops those messages for as long as this is false.
 *
 * To launch: set this to `true`. Nothing else needs changing.
 */
export const LOYALTY_ENABLED = false;

/**
 * Messages that only make sense once loyalty is visible.
 *
 * Typed as NotificationTemplate so renaming a template breaks the build here
 * rather than quietly letting its messages through.
 */
export const LOYALTY_TEMPLATES = new Set<NotificationTemplate>([
  'points_earned',
  'points_expiring',
  'tier_up',
  'tier_at_risk',
  'birthday',
]);

/** True when this message would reveal the hidden loyalty feature. */
export function isLoyaltyTemplate(template: NotificationTemplate): boolean {
  return LOYALTY_TEMPLATES.has(template);
}
