/**
 * Drizzle schema — a faithful translation of docs/schema.sql.
 *
 * Every table in the spec exists here from day one, including the ones that
 * Phase 5-7 will use. Adding a column later is easy; restructuring tables once
 * 20 shops are live is not.
 *
 * Things Drizzle cannot express (EXCLUDE constraints, partial GiST indexes on
 * tstzrange, RLS policies) live in the hand-written SQL migration under
 * drizzle/. Keep the two in sync.
 */
import {
  bigserial,
  check,
  boolean,
  char,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Postgres `tstzrange`. Drizzle has no first-class range type. */
export const tstzrange = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tstzrange';
  },
});

const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

// =====================================================================
//  1. TENANT
// =====================================================================

/** Kept out of `tenant` so prices/limits change without an ALTER TABLE tenant. */
export const subscriptionPlan = pgTable('subscription_plan', {
  id: id(),
  code: text('code').notNull().unique(), // trial | basic | pro
  name: text('name').notNull(),
  priceMonthly: numeric('price_monthly', { precision: 10, scale: 2 }),
  priceYearly: numeric('price_yearly', { precision: 10, scale: 2 }),
  maxResources: integer('max_resources'), // NULL = unlimited
  maxBookingsPerMonth: integer('max_bookings_per_month'),
  trialDays: integer('trial_days').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
});

export interface BusinessTemplateService {
  name: string;
  price: number;
  duration_min: number;
}

export interface BusinessTemplateResourceType {
  code: string;
  name: string;
  is_human: boolean;
}

/** Copied into a new tenant's own rows during onboarding — see lib/onboarding. */
export const businessTypeTemplate = pgTable('business_type_template', {
  businessType: text('business_type').primaryKey(), // nail | hair | massage | clinic | other
  displayName: text('display_name').notNull(),
  servicesJson: jsonb('services_json').$type<BusinessTemplateService[]>().notNull().default([]),
  resourceTypesJson: jsonb('resource_types_json')
    .$type<BusinessTemplateResourceType[]>()
    .notNull()
    .default([]),
});

export const tenant = pgTable(
  'tenant',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    businessType: text('business_type').notNull(), // nail | hair | massage | clinic | other
    timezone: text('timezone').notNull().default('Asia/Bangkok'),
    currency: char('currency', { length: 3 }).notNull().default('THB'),
    phone: text('phone'),
    address: text('address'),
    planId: uuid('plan_id').references(() => subscriptionPlan.id),
    // pending_payment = chose a paid plan but has not paid yet (not usable)
    // active          = usable (trial, or paid)
    // suspended       = trial/billing lapsed
    // cancelled       = closed by the owner
    status: text('status').notNull().default('pending_payment'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    onboardedAt: timestamp('onboarded_at', { withTimezone: true }), // NULL = onboarding wizard not done
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'tenant_status_check',
      sql`${t.status} in ('pending_payment','active','suspended','cancelled')`,
    ),
    index('tenant_status_index').on(t.status),
  ],
);

export const tenantBookingPolicy = pgTable('tenant_booking_policy', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  slotGranularityMin: integer('slot_granularity_min').notNull().default(15),
  minLeadTimeMin: integer('min_lead_time_min').notNull().default(60),
  maxAdvanceDays: integer('max_advance_days').notNull().default(60),
  cancelCutoffMin: integer('cancel_cutoff_min').notNull().default(180),
  allowCustomerPickStaff: boolean('allow_customer_pick_staff').notNull().default(true),
  requireDeposit: boolean('require_deposit').notNull().default(false),
  depositPercent: numeric('deposit_percent', { precision: 5, scale: 2 }).default('0'),
  autoConfirm: boolean('auto_confirm').notNull().default(true),
  noShowFee: numeric('no_show_fee', { precision: 10, scale: 2 }).default('0'),
});

// =====================================================================
//  2. RESOURCE
// =====================================================================

export const resourceType = pgTable(
  'resource_type',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    code: text('code').notNull(), // staff | chair | bed | room | machine
    name: text('name').notNull(),
    isHuman: boolean('is_human').notNull().default(false),
  },
  (t) => [unique().on(t.tenantId, t.code)],
);

export const resource = pgTable(
  'resource',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    resourceTypeId: uuid('resource_type_id')
      .notNull()
      .references(() => resourceType.id),
    name: text('name').notNull(),
    displayOrder: integer('display_order').notNull().default(0),
    photoUrl: text('photo_url'),
    bio: text('bio'),
    isBookable: boolean('is_bookable').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('resource_tenant_id_is_active_index').on(t.tenantId, t.isActive)],
);

// =====================================================================
//  3. SERVICE
// =====================================================================

export const serviceCategory = pgTable('service_category', {
  id: id(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  displayOrder: integer('display_order').notNull().default(0),
});

export const service = pgTable(
  'service',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    categoryId: uuid('category_id').references(() => serviceCategory.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    basePrice: numeric('base_price', { precision: 10, scale: 2 }).notNull(),
    bufferBeforeMin: integer('buffer_before_min').notNull().default(0),
    bufferAfterMin: integer('buffer_after_min').notNull().default(0),
    pointEarnMode: text('point_earn_mode').notNull().default('inherit'), // inherit | fixed | multiplier | none
    pointEarnValue: numeric('point_earn_value', { precision: 10, scale: 2 }).default('0'),
    isPointRedeemable: boolean('is_point_redeemable').notNull().default(true),
    maxParallelCustomers: integer('max_parallel_customers').notNull().default(1),
    isActive: boolean('is_active').notNull().default(true),
    displayOrder: integer('display_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('service_tenant_id_is_active_index').on(t.tenantId, t.isActive)],
);

/**
 * active  = the human must be with the customer
 * passive = the human is free to serve someone else, the chair/bed stays busy
 */
export const serviceSegment = pgTable(
  'service_segment',
  {
    id: id(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    kind: text('kind').notNull(), // active | passive
    durationMin: integer('duration_min').notNull(),
    label: text('label'),
  },
  (t) => [
    unique().on(t.serviceId, t.seq),
    check('service_segment_kind_check', sql`${t.kind} in ('active','passive')`),
    check('service_segment_duration_min_check', sql`${t.durationMin} > 0`),
  ],
);

export const serviceResourceRequirement = pgTable(
  'service_resource_requirement',
  {
    id: id(),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
    resourceTypeId: uuid('resource_type_id')
      .notNull()
      .references(() => resourceType.id),
    quantity: integer('quantity').notNull().default(1),
    holdScope: text('hold_scope').notNull().default('whole'),
  },
  (t) => [
    unique().on(t.serviceId, t.resourceTypeId),
    check('service_resource_requirement_hold_scope_check', sql`${t.holdScope} in ('active_only','whole')`),
  ],
);

export const resourceServiceSkill = pgTable(
  'resource_service_skill',
  {
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resource.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
    priceOverride: numeric('price_override', { precision: 10, scale: 2 }),
    durationFactor: numeric('duration_factor', { precision: 4, scale: 2 }).notNull().default('1.00'),
  },
  (t) => [primaryKey({ columns: [t.resourceId, t.serviceId] })],
);

// =====================================================================
//  4. OPENING HOURS / TIME OFF
// =====================================================================

export const businessHour = pgTable(
  'business_hour',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id').references(() => resource.id, { onDelete: 'cascade' }), // NULL = whole shop
    weekday: integer('weekday').notNull(), // 0 = Sunday
    openTime: time('open_time').notNull(),
    closeTime: time('close_time').notNull(),
  },
  (t) => [
    check('business_hour_weekday_check', sql`${t.weekday} between 0 and 6`),
    check('business_hour_time_check', sql`${t.closeTime} > ${t.openTime}`),
  ],
);

export const timeOff = pgTable(
  'time_off',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id').references(() => resource.id, { onDelete: 'cascade' }), // NULL = whole shop closed
    period: tstzrange('period').notNull(),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [index('time_off_tenant_id_resource_id_index').on(t.tenantId, t.resourceId)],
);

// =====================================================================
//  5. CUSTOMER
// =====================================================================

export const customer = pgTable(
  'customer',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    lineUserId: text('line_user_id'),
    phone: text('phone'),
    name: text('name').notNull(),
    email: text('email'),
    birthDate: date('birth_date'),
    note: text('note'),
    // denormalized loyalty counters — must always agree with the ledger
    pointBalance: integer('point_balance').notNull().default(0),
    lifetimePoints: integer('lifetime_points').notNull().default(0),
    lifetimeSpend: numeric('lifetime_spend', { precision: 12, scale: 2 }).notNull().default('0'),
    visitCount: integer('visit_count').notNull().default(0),
    noShowCount: integer('no_show_count').notNull().default(0),
    lastVisitAt: timestamp('last_visit_at', { withTimezone: true }),
    isBlocked: boolean('is_blocked').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.lineUserId),
    unique().on(t.tenantId, t.phone),
    index('customer_tenant_id_name_index').on(t.tenantId, t.name),
  ],
);

// =====================================================================
//  6. BOOKING
// =====================================================================

export const booking = pgTable(
  'booking',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customer.id, { onDelete: 'set null' }),
    code: text('code').notNull(),
    status: text('status').notNull().default('pending'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    source: text('source').notNull().default('online'), // online | walk_in | phone | admin
    subtotal: numeric('subtotal', { precision: 10, scale: 2 }).notNull().default('0'),
    discountAmount: numeric('discount_amount', { precision: 10, scale: 2 }).notNull().default('0'),
    pointDiscount: numeric('point_discount', { precision: 10, scale: 2 }).notNull().default('0'),
    total: numeric('total', { precision: 10, scale: 2 }).notNull().default('0'),
    depositPaid: numeric('deposit_paid', { precision: 10, scale: 2 }).notNull().default('0'),
    paymentStatus: text('payment_status').notNull().default('unpaid'), // unpaid | deposit | paid | refunded
    pointsEarned: integer('points_earned').notNull().default(0),
    pointsSpent: integer('points_spent').notNull().default(0),
    customerNote: text('customer_note'),
    internalNote: text('internal_note'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelReason: text('cancel_reason'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique().on(t.tenantId, t.code),
    check(
      'booking_status_check',
      sql`${t.status} in ('pending','confirmed','in_progress','completed','cancelled','no_show')`,
    ),
    index('booking_tenant_id_starts_at_index').on(t.tenantId, t.startsAt),
    index('booking_tenant_id_status_starts_at_index').on(t.tenantId, t.status, t.startsAt),
    index('booking_customer_id_starts_at_index').on(t.customerId, t.startsAt.desc()),
  ],
);

export const bookingItem = pgTable(
  'booking_item',
  {
    id: id(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => booking.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => service.id),
    seq: integer('seq').notNull().default(1),
    // price/name snapshot at booking time — never join back for the current price
    serviceName: text('service_name').notNull(),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    durationMin: integer('duration_min').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    customerPackageId: uuid('customer_package_id'),
  },
  (t) => [unique().on(t.bookingId, t.seq)],
);

/** The table that makes double-booking impossible at the database level. */
export const resourceAllocation = pgTable(
  'resource_allocation',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    bookingItemId: uuid('booking_item_id')
      .notNull()
      .references(() => bookingItem.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resource.id),
    period: tstzrange('period').notNull(), // buffers included
    isActiveHold: boolean('is_active_hold').notNull().default(true),
    isReleased: boolean('is_released').notNull().default(false),
  },
  (t) => [
    index('resource_allocation_tenant_id_resource_id_index').on(t.tenantId, t.resourceId),
    // EXCLUDE USING gist (resource_id WITH =, period WITH &&) WHERE (is_released = false)
    // lives in the hand-written migration.
  ],
);

// =====================================================================
//  7. LOYALTY — TIER
// =====================================================================

export const membershipTier = pgTable(
  'membership_tier',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    level: integer('level').notNull(),
    qualifySpend: numeric('qualify_spend', { precision: 12, scale: 2 }).notNull().default('0'),
    qualifyVisits: integer('qualify_visits').notNull().default(0),
    qualifyWindowMonths: integer('qualify_window_months').notNull().default(12),
    pointMultiplier: numeric('point_multiplier', { precision: 4, scale: 2 }).notNull().default('1.00'),
    discountPercent: numeric('discount_percent', { precision: 5, scale: 2 }).notNull().default('0'),
    priorityBookingDays: integer('priority_booking_days').notNull().default(0),
    perksJson: jsonb('perks_json').notNull().default({}),
    color: text('color'),
  },
  (t) => [unique().on(t.tenantId, t.level)],
);

export const customerTier = pgTable('customer_tier', {
  customerId: uuid('customer_id')
    .primaryKey()
    .references(() => customer.id, { onDelete: 'cascade' }),
  tierId: uuid('tier_id')
    .notNull()
    .references(() => membershipTier.id),
  achievedAt: timestamp('achieved_at', { withTimezone: true }).notNull().defaultNow(),
  validUntil: date('valid_until'),
  isManual: boolean('is_manual').notNull().default(false),
});

// =====================================================================
//  8. LOYALTY — POINTS
// =====================================================================

export const pointRule = pgTable(
  'point_rule',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    bahtPerPoint: numeric('baht_per_point', { precision: 10, scale: 2 }).notNull().default('100'),
    rounding: text('rounding').notNull().default('floor'), // floor | round | ceil
    pointValueBaht: numeric('point_value_baht', { precision: 10, scale: 2 }).notNull().default('1.00'),
    minRedeemPoints: integer('min_redeem_points').notNull().default(50),
    maxRedeemPercent: numeric('max_redeem_percent', { precision: 5, scale: 2 }).notNull().default('50'),
    expiryMonths: integer('expiry_months'), // NULL = never expires
    expiryMode: text('expiry_mode').notNull().default('from_earn'), // from_earn | fixed_year_end
    signupBonus: integer('signup_bonus').notNull().default(0),
    birthdayBonus: integer('birthday_bonus').notNull().default(0),
    referralBonus: integer('referral_bonus').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [unique().on(t.tenantId)],
);

/** A batch of earned points, with its own expiry and remaining balance. */
export const pointLot = pgTable(
  'point_lot',
  {
  id: id(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  customerId: uuid('customer_id')
    .notNull()
    .references(() => customer.id, { onDelete: 'cascade' }),
  pointsTotal: integer('points_total').notNull(),
  pointsRemaining: integer('points_remaining').notNull(),
  earnedAt: timestamp('earned_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
    sourceType: text('source_type').notNull(), // booking | signup | birthday | referral | manual
    sourceId: uuid('source_id'),
  },
  (t) => [
    check('point_lot_points_total_check', sql`${t.pointsTotal} > 0`),
    check('point_lot_points_remaining_check', sql`${t.pointsRemaining} >= 0`),
    check('point_lot_remaining_lte_total_check', sql`${t.pointsRemaining} <= ${t.pointsTotal}`),
  ],
);

/** Append-only. Never UPDATE, never DELETE. */
export const pointLedger = pgTable(
  'point_ledger',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customer.id, { onDelete: 'cascade' }),
    entryType: text('entry_type').notNull(), // earn | redeem | expire | adjust | revert
    points: integer('points').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    lotId: uuid('lot_id').references(() => pointLot.id),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id'),
    note: text('note'),
    createdBy: uuid('created_by'),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      'point_ledger_entry_type_check',
      sql`${t.entryType} in ('earn','redeem','expire','adjust','revert')`,
    ),
    index('point_ledger_customer_id_created_at_index').on(t.customerId, t.createdAt.desc()),
  ],
);

// =====================================================================
//  9. REWARD
// =====================================================================

export const reward = pgTable(
  'reward',
  {
    id: id(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  rewardType: text('reward_type').notNull(),
  pointCost: integer('point_cost').notNull(),
  serviceId: uuid('service_id').references(() => service.id),
  valueAmount: numeric('value_amount', { precision: 10, scale: 2 }),
  minTierLevel: integer('min_tier_level').notNull().default(0),
  stock: integer('stock'), // NULL = unlimited
  stockUsed: integer('stock_used').notNull().default(0),
    validFrom: date('valid_from'),
    validUntil: date('valid_until'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [
    check(
      'reward_reward_type_check',
      sql`${t.rewardType} in ('free_service','discount_amount','discount_percent','free_item')`,
    ),
  ],
);

export const rewardRedemption = pgTable(
  'reward_redemption',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customer.id, { onDelete: 'cascade' }),
    rewardId: uuid('reward_id')
      .notNull()
      .references(() => reward.id),
    pointsSpent: integer('points_spent').notNull(),
    code: text('code').notNull(),
    status: text('status').notNull().default('issued'), // issued | used | expired | cancelled
    bookingId: uuid('booking_id').references(() => booking.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.tenantId, t.code),
    check(
      'reward_redemption_status_check',
      sql`${t.status} in ('issued','used','expired','cancelled')`,
    ),
  ],
);

// =====================================================================
//  10. PACKAGE
// =====================================================================

export const packageTable = pgTable('package', {
  id: id(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  totalSessions: integer('total_sessions').notNull(),
  validDays: integer('valid_days'),
  isTransferable: boolean('is_transferable').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
});

export const packageService = pgTable(
  'package_service',
  {
    packageId: uuid('package_id')
      .notNull()
      .references(() => packageTable.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id')
      .notNull()
      .references(() => service.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.packageId, t.serviceId] })],
);

export const customerPackage = pgTable(
  'customer_package',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customer.id, { onDelete: 'cascade' }),
    packageId: uuid('package_id')
      .notNull()
      .references(() => packageTable.id),
    sessionsTotal: integer('sessions_total').notNull(),
    sessionsUsed: integer('sessions_used').notNull().default(0),
    purchasedAt: timestamp('purchased_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    status: text('status').notNull().default('active'), // active | used_up | expired | refunded
  },
  (t) => [
    index('customer_package_customer_id_status_index').on(t.customerId, t.status),
    check(
      'customer_package_status_check',
      sql`${t.status} in ('active','used_up','expired','refunded')`,
    ),
    check('customer_package_sessions_check', sql`${t.sessionsUsed} <= ${t.sessionsTotal}`),
  ],
);

// =====================================================================
//  11. NOTIFICATION
// =====================================================================

export const notificationQueue = pgTable(
  'notification_queue',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    customerId: uuid('customer_id').references(() => customer.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull().default('line'), // line | sms | email
    template: text('template').notNull(),
    payload: jsonb('payload').notNull().default({}),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    status: text('status').notNull().default('pending'), // pending | sent | failed | cancelled
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    dedupeKey: text('dedupe_key').unique(),
  },
  (t) => [
    index('notification_queue_status_scheduled_at_index').on(t.status, t.scheduledAt),
    check(
      'notification_queue_status_check',
      sql`${t.status} in ('pending','sent','failed','cancelled')`,
    ),
  ],
);

// =====================================================================
//  12.5 LINE OA CONNECTION  (ร้านเชื่อม LINE OA ของตัวเองเข้าระบบ)
//
//  Manual wizard for now (docs/logic.md ข้อ 1.6): the shop pastes its own
//  channel token/secret. `connection_method` leaves room for a one-click
//  `partner_oauth` flow later without another schema change.
//
//  `channelAccessToken`/`channelSecret` hold AES-256-GCM ciphertext from
//  lib/crypto — despite the column names, plaintext must never land here.
// =====================================================================

export const tenantLineOa = pgTable(
  'tenant_line_oa',
  {
    tenantId: uuid('tenant_id')
      .primaryKey()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    connectionMethod: text('connection_method').notNull().default('manual'), // manual | partner_oauth
    /** encrypted */
    channelAccessToken: text('channel_access_token'),
    /** encrypted */
    channelSecret: text('channel_secret'),
    oaBasicId: text('oa_basic_id'),
    webhookUrl: text('webhook_url'),
    // Not in docs/schema.sql — the LIFF app id customer booking pages need to
    // deep-link into LINE is a different concern from the OA credentials the
    // spec covers, and dropping it would break the Phase 2 booking flow that
    // already ships. Kept here rather than back on `tenant` for the same
    // reason the old tenant_line_channel table existed: LINE config lives in
    // one place.
    liffId: text('liff_id'),
    // wizard progress, tracked independently so a shop can resume mid-step
    stepOaCreated: boolean('step_oa_created').notNull().default(false),
    stepApiEnabled: boolean('step_api_enabled').notNull().default(false),
    stepTokenSaved: boolean('step_token_saved').notNull().default(false),
    stepWebhookVerified: boolean('step_webhook_verified').notNull().default(false),
    isVerified: boolean('is_verified').notNull().default(false),
    connectedAt: timestamp('connected_at', { withTimezone: true }),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      'tenant_line_oa_connection_method_check',
      sql`${t.connectionMethod} in ('manual','partner_oauth')`,
    ),
  ],
);

// =====================================================================
//  12. AUTH + STAFF USER  (OAuth only — no passwords, iron rule #7)
//      `auth_identity` (the OAuth provider's identity) is kept separate
//      from `staff_user` (the app user) so one person can hold several
//      identities (LINE + Google) and belong to several shops.
// =====================================================================

/** One row per OAuth identity. Not tied to any one shop. */
export const authIdentity = pgTable(
  'auth_identity',
  {
    id: id(),
    provider: text('provider').notNull(), // line | google
    providerUid: text('provider_uid').notNull(),
    email: text('email'),
    displayName: text('display_name'),
    avatarUrl: text('avatar_url'),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.provider, t.providerUid),
    check('auth_identity_provider_check', sql`${t.provider} in ('line','google')`),
  ],
);

/** An app user. May hold more than one auth_identity if accounts are linked. */
export const staffUser = pgTable('staff_user', {
  id: id(),
  primaryEmail: text('primary_email'),
  displayName: text('display_name'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

export const staffAuthIdentity = pgTable(
  'staff_auth_identity',
  {
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffUser.id, { onDelete: 'cascade' }),
    authIdentityId: uuid('auth_identity_id')
      .notNull()
      .references(() => authIdentity.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.staffId, t.authIdentityId] }),
    unique().on(t.authIdentityId), // one identity belongs to exactly one staff_user
  ],
);

/** Many-to-many: one person can own/work at several shops. */
export const staffTenant = pgTable(
  'staff_tenant',
  {
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffUser.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id').references(() => resource.id), // set when this person is also bookable
    role: text('role').notNull().default('staff'), // owner | manager | staff
    isActive: boolean('is_active').notNull().default(true),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.staffId, t.tenantId] }),
    index('staff_tenant_tenant_id_index').on(t.tenantId),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorId: uuid('actor_id'),
    action: text('action').notNull(), // point.adjust | booking.cancel | price.change
    entity: text('entity').notNull(),
    entityId: uuid('entity_id'),
    beforeJson: jsonb('before_json'),
    afterJson: jsonb('after_json'),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_tenant_id_created_at_index').on(t.tenantId, t.createdAt.desc())],
);
