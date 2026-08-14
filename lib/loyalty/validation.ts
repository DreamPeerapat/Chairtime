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
