/**
 * What the product costs, and what each price buys.
 *
 * The landing page and the plan rows in the database have to agree, and until
 * now only the database knew. A price advertised in one place and charged in
 * another is the kind of thing a shop notices on the day it pays, so this file
 * is the written version and `scripts/sync-plans.ts` is what makes the rows
 * match it. Change it here, run that, deploy.
 *
 * No VAT anywhere: the business is a natural person and not VAT registered, so
 * there is nothing to add and no tax invoice to issue. The pricing page says
 * so plainly rather than leaving an accountant to find out later.
 *
 * Money is written in baht as numeric(10,2) strings, as everywhere else — the
 * arithmetic that turns it into a QR happens in lib/billing/amount.ts.
 */

export interface PlanFeature {
  /** what a shop gets, in the words a shop would use */
  label: string;
  /** false renders it struck through: present in the plan above, not in this one */
  included?: boolean;
}

export interface CatalogPlan {
  code: string;
  name: string;
  /** one line under the name: who this plan is for */
  tagline: string;
  priceMonthly: string;
  /** null for the trial, which nobody pays for */
  priceYearly: string | null;
  /** trial length in days; 0 for a paid plan */
  trialDays: number;
  /** null = no limit */
  maxPortfolioItems: number | null;
  features: PlanFeature[];
  /** the one a shop should pick unless it has a reason not to */
  recommended?: boolean;
}

/**
 * A year costs ten months. Two free is enough to be worth choosing without
 * being a discount the business cannot afford to honour for a year at a time.
 */
export const PLANS: CatalogPlan[] = [
  {
    code: 'trial',
    name: 'ทดลองใช้',
    tagline: 'ลองทั้งระบบก่อน ไม่ต้องใส่บัตร',
    priceMonthly: '0.00',
    priceYearly: null,
    trialDays: 15,
    maxPortfolioItems: 10,
    features: [
      { label: 'ใช้ได้ 15 วัน ทุกฟีเจอร์ของ Basic' },
      { label: 'ไม่ต้องผูกบัตรเครดิต' },
      { label: 'ข้อมูลที่กรอกไว้อยู่ต่อเมื่อสมัครจริง' },
    ],
  },
  {
    code: 'basic',
    name: 'Basic',
    tagline: 'ร้านเดียว เจ้าของดูแลเอง',
    priceMonthly: '499.00',
    priceYearly: '4990.00',
    trialDays: 0,
    maxPortfolioItems: 10,
    recommended: true,
    features: [
      { label: 'ลูกค้าจองคิวเองผ่าน LINE ตลอด 24 ชม.' },
      { label: 'ปฏิทินหลังร้าน กันคิวชนอัตโนมัติ' },
      { label: 'แจ้งเตือนลูกค้าก่อนถึงคิว ลดคิวหลุด' },
      { label: 'ประวัติลูกค้าและยอดใช้จ่าย' },
      { label: 'ผลงานร้าน 10 รูป' },
      { label: 'สรุปยอดขายรายวัน' },
      { label: 'รายงานย้อนหลังและกราฟรายได้', included: false },
      { label: 'ระบบสะสมแต้มและของรางวัล', included: false },
    ],
  },
  {
    code: 'pro',
    name: 'Pro',
    tagline: 'ร้านที่มีหลายช่าง และอยากรู้ตัวเลข',
    priceMonthly: '999.00',
    priceYearly: '9990.00',
    trialDays: 0,
    maxPortfolioItems: null,
    features: [
      { label: 'ทุกอย่างใน Basic' },
      { label: 'ผลงานร้านไม่จำกัดรูป' },
      { label: 'รายงานเต็ม — กราฟรายได้ ย้อนหลังทุกช่วง' },
      { label: 'ระบบสะสมแต้ม ระดับสมาชิก และของรางวัล' },
      { label: 'ผลงานรายช่าง ให้ลูกค้าเลือกจากฝีมือ' },
    ],
  },
];

/** The two ways to pay, as the pricing page offers them. */
export type BillingTerm = 'monthly' | 'yearly';

export const TERM_MONTHS: Record<BillingTerm, number> = { monthly: 1, yearly: 12 };

/**
 * How much a year saves, as a percentage, worked out rather than written down
 * — a number typed twice is a number that ends up wrong on one of the two.
 */
export function yearlySavingPercent(plan: CatalogPlan): number | null {
  if (!plan.priceYearly) return null;
  const monthly = Number(plan.priceMonthly) * 12;
  if (monthly <= 0) return null;
  return Math.round(((monthly - Number(plan.priceYearly)) / monthly) * 100);
}

export function planByCode(code: string): CatalogPlan | undefined {
  return PLANS.find((plan) => plan.code === code);
}

/** The paid ones, in the order the pricing page shows them. */
export const PAID_PLANS = PLANS.filter((plan) => Number(plan.priceMonthly) > 0);
