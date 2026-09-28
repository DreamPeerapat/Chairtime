import { z } from 'zod';

export const pointRuleFormSchema = z.object({
  bahtPerPoint: z.coerce.number().positive('ต้องมากกว่า 0'),
  rounding: z.enum(['floor', 'round', 'ceil']),
  pointValueBaht: z.coerce.number().positive('ต้องมากกว่า 0'),
  minRedeemPoints: z.coerce.number().int().min(0),
  maxRedeemPercent: z.coerce.number().min(0).max(100),
  // empty string means "never expires" — z.coerce.number() would turn '' into 0, so check first
  expiryMonths: z
    .string()
    .transform((v) => (v.trim() === '' ? null : Number(v)))
    .pipe(z.number().int().positive().nullable()),
  signupBonus: z.coerce.number().int().min(0),
  birthdayBonus: z.coerce.number().int().min(0),
  referralBonus: z.coerce.number().int().min(0),
  isActive: z.coerce.boolean(),
});

export type PointRuleFormInput = z.infer<typeof pointRuleFormSchema>;

const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === '' ? null : v));

function optionalNumber(inner: z.ZodNumber) {
  return z
    .string()
    .transform((v) => (v.trim() === '' ? null : Number(v)))
    .pipe(inner.nullable());
}

export const rewardFormSchema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1, 'ต้องมีชื่อของรางวัล').max(120),
    rewardType: z.enum(['free_service', 'discount_amount', 'discount_percent', 'free_item']),
    pointCost: z.coerce.number().int().positive('แต้มต้องมากกว่า 0'),
    serviceId: optionalString.pipe(z.uuid().nullable()),
    valueAmount: optionalNumber(z.number().min(0)),
    minTierLevel: z.coerce.number().int().min(0),
    stock: optionalNumber(z.number().int().positive()),
    validFrom: optionalString,
    validUntil: optionalString,
    isActive: z.coerce.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.rewardType === 'free_service' && !data.serviceId) {
      ctx.addIssue({ code: 'custom', path: ['serviceId'], message: 'เลือกบริการสำหรับของรางวัลประเภทบริการฟรี' });
    }
    if ((data.rewardType === 'discount_amount' || data.rewardType === 'discount_percent') && data.valueAmount === null) {
      ctx.addIssue({ code: 'custom', path: ['valueAmount'], message: 'ระบุมูลค่าส่วนลด' });
    }
    if (data.rewardType === 'discount_percent' && data.valueAmount !== null && data.valueAmount > 100) {
      ctx.addIssue({ code: 'custom', path: ['valueAmount'], message: 'ส่วนลดเปอร์เซ็นต์ต้องไม่เกิน 100' });
    }
    if (data.validFrom && data.validUntil && data.validFrom > data.validUntil) {
      ctx.addIssue({ code: 'custom', path: ['validUntil'], message: 'วันหมดเขตต้องอยู่หลังวันเริ่ม' });
    }
  });

export type RewardFormInput = z.infer<typeof rewardFormSchema>;

/** At most `places` decimal places — what a numeric(p, places) column holds. */
function withinPlaces(places: number) {
  const factor = 10 ** places;
  return (n: number) => Math.abs(Math.round(n * factor) - n * factor) < 1e-6;
}

/**
 * A membership tier as the shop edits it. Only the fields lib/loyalty acts on:
 * `discount_percent` and `priority_booking_days` exist in the schema but
 * nothing reads them yet, and a setting that does nothing is worse than none.
 */
export const tierFormSchema = z.object({
  name: z.string().trim().min(1, 'ต้องมีชื่อระดับ').max(40, 'ชื่อระดับยาวได้ไม่เกิน 40 ตัวอักษร'),
  // 0 is what tier.ts calls "no tier", so a real tier starts at 1.
  level: z.coerce.number().int('ลำดับต้องเป็นจำนวนเต็ม').min(1, 'ลำดับเริ่มที่ 1').max(20, 'ลำดับได้ไม่เกิน 20'),
  qualifySpend: z.coerce
    .number()
    .min(0, 'ยอดใช้จ่ายต้องไม่ติดลบ')
    .max(10_000_000, 'ยอดใช้จ่ายสูงเกินไป')
    .refine(withinPlaces(2), 'ยอดใช้จ่ายมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง'),
  qualifyVisits: z.coerce.number().int('จำนวนครั้งต้องเป็นจำนวนเต็ม').min(0, 'จำนวนครั้งต้องไม่ติดลบ').max(1000),
  qualifyWindowMonths: z.coerce
    .number()
    .int('จำนวนเดือนต้องเป็นจำนวนเต็ม')
    .min(1, 'นับย้อนหลังอย่างน้อย 1 เดือน')
    .max(60, 'นับย้อนหลังได้ไม่เกิน 60 เดือน'),
  pointMultiplier: z.coerce
    .number()
    .positive('ตัวคูณแต้มต้องมากกว่า 0')
    .max(10, 'ตัวคูณแต้มได้ไม่เกิน 10')
    .refine(withinPlaces(2), 'ตัวคูณแต้มมีทศนิยมได้ไม่เกิน 2 ตำแหน่ง'),
});

export type TierFormInput = z.infer<typeof tierFormSchema>;
