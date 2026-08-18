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
