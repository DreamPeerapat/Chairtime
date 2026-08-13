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

export const tenant = pgTable('tenant', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  businessType: text('business_type').notNull(), // nail | hair | massage | clinic | other
  timezone: text('timezone').notNull().default('Asia/Bangkok'),
  currency: char('currency', { length: 3 }).notNull().default('THB'),
  phone: text('phone'),
  address: text('address'),
  plan: text('plan').notNull().default('trial'), // trial | basic | pro
  status: text('status').notNull().default('active'), // active | suspended | cancelled
  createdAt: createdAt(),
});

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
//  12b. LINE CHANNEL  (not in docs/schema.sql — see the note below)
//
//  CLAUDE.md iron rule #6 requires every tenant to use its own LINE OA with
//  the channel token stored encrypted, but docs/schema.sql has nowhere to put
//  it. Rather than bolt the columns onto `tenant`, they live here: secrets are
//  read on a different path from shop settings, and keeping them in their own
//  table means an admin screen that selects * from tenant never touches them.
//
//  Values are AES-256-GCM ciphertext produced by lib/crypto — never plaintext.
// =====================================================================

export const tenantLineChannel = pgTable('tenant_line_channel', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenant.id, { onDelete: 'cascade' }),
  channelId: text('channel_id').notNull(),
  /** encrypted: LINE Messaging API channel access token */
  channelAccessTokenEnc: text('channel_access_token_enc').notNull(),
  /** encrypted: channel secret, used to verify webhook signatures */
  channelSecretEnc: text('channel_secret_enc').notNull(),
  liffId: text('liff_id'),
  basicId: text('basic_id'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// =====================================================================
//  12. AUDIT + STAFF USER
// =====================================================================

export const staffUser = pgTable(
  'staff_user',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenant.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id').references(() => resource.id),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    role: text('role').notNull().default('staff'), // owner | manager | staff
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [unique().on(t.tenantId, t.email)],
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
