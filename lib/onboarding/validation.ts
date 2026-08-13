import { z } from 'zod';

export const onboardingPlanSchema = z.object({
  shopName: z.string().trim().min(1, 'กรุณากรอกชื่อร้าน').max(120, 'ชื่อร้านยาวเกินไป'),
  businessType: z.string().trim().min(1, 'กรุณาเลือกประเภทร้าน'),
  planCode: z.string().trim().min(1, 'กรุณาเลือกแพ็กเกจ'),
});

export type OnboardingPlanInput = z.infer<typeof onboardingPlanSchema>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export const onboardingSetupSchema = z
  .object({
    openTime: z.string().regex(TIME_RE, 'รูปแบบเวลาไม่ถูกต้อง'),
    closeTime: z.string().regex(TIME_RE, 'รูปแบบเวลาไม่ถูกต้อง'),
    serviceIds: z.array(z.string().uuid()),
    servicePrices: z.array(z.coerce.number().positive('ราคาต้องมากกว่า 0')),
  })
  .refine((v) => v.closeTime > v.openTime, {
    message: 'เวลาปิดต้องหลังเวลาเปิด',
    path: ['closeTime'],
  })
  .refine((v) => v.serviceIds.length === v.servicePrices.length, {
    message: 'ข้อมูลราคาบริการไม่ครบ',
    path: ['servicePrices'],
  });

export type OnboardingSetupInput = z.infer<typeof onboardingSetupSchema>;
