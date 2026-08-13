/**
 * Starter service lists by business type.
 *
 * docs/roadmap.md's Phase 3 gate is "set up a new shop from scratch in 15
 * minutes without touching the database". Typing fifteen services by hand is
 * what makes that impossible, so picking a shop type fills them in.
 *
 * These are starting points, not rules — every field stays editable afterwards.
 */
export interface TemplateService {
  name: string;
  category: string;
  price: number;
  durationMin: number;
  bufferAfterMin?: number;
}

export interface ShopTemplate {
  businessType: string;
  label: string;
  resourceTypes: Array<{ code: string; name: string; isHuman: boolean }>;
  /** how many of the non-human resource to create by default */
  defaultSpaces: number;
  spaceLabel: string;
  services: TemplateService[];
}

export const SHOP_TEMPLATES: ShopTemplate[] = [
  {
    businessType: 'nail',
    label: 'ร้านทำเล็บ',
    resourceTypes: [
      { code: 'staff', name: 'ช่างทำเล็บ', isHuman: true },
      { code: 'table', name: 'โต๊ะทำเล็บ', isHuman: false },
    ],
    defaultSpaces: 4,
    spaceLabel: 'โต๊ะ',
    services: [
      { name: 'ทาสีมือ', category: 'ทำเล็บมือ', price: 300, durationMin: 30 },
      { name: 'ทาสีเท้า', category: 'ทำเล็บเท้า', price: 350, durationMin: 40 },
      { name: 'ต่อเจลมือ', category: 'ทำเล็บมือ', price: 750, durationMin: 90, bufferAfterMin: 5 },
      { name: 'ต่อเจลเท้า', category: 'ทำเล็บเท้า', price: 850, durationMin: 100, bufferAfterMin: 5 },
      { name: 'ต่อ PVC', category: 'ต่อเล็บ', price: 1200, durationMin: 120, bufferAfterMin: 10 },
      { name: 'เฟรนช์', category: 'ทำเล็บมือ', price: 900, durationMin: 100, bufferAfterMin: 5 },
      { name: 'เพ้นท์ลาย', category: 'เพ้นท์', price: 80, durationMin: 30 },
      { name: 'ถอดเจล', category: 'บริการเสริม', price: 200, durationMin: 30 },
      { name: 'ตัดหนัง+บำรุง', category: 'บริการเสริม', price: 250, durationMin: 30 },
      { name: 'ซ่อมเล็บ', category: 'บริการเสริม', price: 150, durationMin: 30 },
      { name: 'สปามือ', category: 'สปา', price: 500, durationMin: 45, bufferAfterMin: 5 },
      { name: 'สปาเท้า', category: 'สปา', price: 600, durationMin: 60, bufferAfterMin: 5 },
    ],
  },
  {
    businessType: 'hair',
    label: 'ร้านทำผม',
    resourceTypes: [
      { code: 'staff', name: 'ช่างผม', isHuman: true },
      { code: 'chair', name: 'เก้าอี้', isHuman: false },
    ],
    defaultSpaces: 5,
    spaceLabel: 'เก้าอี้',
    services: [
      { name: 'สระ+ตัด', category: 'ตัดผม', price: 450, durationMin: 60, bufferAfterMin: 5 },
      { name: 'ตัดอย่างเดียว', category: 'ตัดผม', price: 350, durationMin: 40, bufferAfterMin: 5 },
      { name: 'สระ+ไดร์', category: 'จัดแต่ง', price: 300, durationMin: 40 },
      { name: 'เซ็ตผม', category: 'จัดแต่ง', price: 500, durationMin: 45, bufferAfterMin: 5 },
      { name: 'ย้อมผม', category: 'ทำสี', price: 1800, durationMin: 90, bufferAfterMin: 10 },
      { name: 'กัดสี', category: 'ทำสี', price: 2500, durationMin: 120, bufferAfterMin: 15 },
      { name: 'ไฮไลท์', category: 'ทำสี', price: 2200, durationMin: 120, bufferAfterMin: 10 },
      { name: 'ดัดผม', category: 'ดัด/ยืด', price: 2200, durationMin: 110, bufferAfterMin: 10 },
      { name: 'ยืดผม', category: 'ดัด/ยืด', price: 2800, durationMin: 150, bufferAfterMin: 10 },
      { name: 'ทรีตเมนต์', category: 'บำรุง', price: 900, durationMin: 60, bufferAfterMin: 5 },
      { name: 'โกนหนวด', category: 'ชาย', price: 200, durationMin: 20 },
      { name: 'ตัดผมเด็ก', category: 'ตัดผม', price: 250, durationMin: 30 },
    ],
  },
  {
    businessType: 'massage',
    label: 'ร้านนวด / สปา',
    resourceTypes: [
      { code: 'staff', name: 'หมอนวด', isHuman: true },
      { code: 'bed', name: 'เตียงนวด', isHuman: false },
    ],
    defaultSpaces: 6,
    spaceLabel: 'เตียง',
    services: [
      { name: 'นวดไทย 60 นาที', category: 'นวดไทย', price: 400, durationMin: 60, bufferAfterMin: 15 },
      { name: 'นวดไทย 90 นาที', category: 'นวดไทย', price: 550, durationMin: 90, bufferAfterMin: 15 },
      { name: 'นวดไทย 120 นาที', category: 'นวดไทย', price: 700, durationMin: 120, bufferAfterMin: 15 },
      { name: 'นวดน้ำมัน 60 นาที', category: 'นวดน้ำมัน', price: 600, durationMin: 60, bufferAfterMin: 15 },
      { name: 'นวดน้ำมัน 90 นาที', category: 'นวดน้ำมัน', price: 800, durationMin: 90, bufferAfterMin: 15 },
      { name: 'นวดเท้า 45 นาที', category: 'นวดเท้า', price: 300, durationMin: 45, bufferAfterMin: 10 },
      { name: 'นวดเท้า 60 นาที', category: 'นวดเท้า', price: 380, durationMin: 60, bufferAfterMin: 10 },
      { name: 'นวดศีรษะ+บ่า', category: 'นวดเฉพาะจุด', price: 350, durationMin: 45, bufferAfterMin: 10 },
      { name: 'นวดออฟฟิศซินโดรม', category: 'นวดเฉพาะจุด', price: 500, durationMin: 60, bufferAfterMin: 15 },
      { name: 'ประคบสมุนไพร', category: 'ประคบ', price: 750, durationMin: 75, bufferAfterMin: 15 },
      { name: 'ขัดผิว', category: 'สปา', price: 900, durationMin: 60, bufferAfterMin: 15 },
      { name: 'อโรมาเธอราพี', category: 'สปา', price: 1200, durationMin: 90, bufferAfterMin: 15 },
    ],
  },
  {
    businessType: 'clinic',
    label: 'คลินิกความงาม',
    resourceTypes: [
      { code: 'staff', name: 'แพทย์ / ผู้ให้บริการ', isHuman: true },
      { code: 'room', name: 'ห้องทรีตเมนต์', isHuman: false },
    ],
    defaultSpaces: 3,
    spaceLabel: 'ห้อง',
    services: [
      { name: 'ปรึกษาแพทย์', category: 'ปรึกษา', price: 0, durationMin: 20 },
      { name: 'ฉีดโบท็อกซ์', category: 'ฉีด', price: 6000, durationMin: 30, bufferAfterMin: 10 },
      { name: 'ฉีดฟิลเลอร์', category: 'ฉีด', price: 12000, durationMin: 45, bufferAfterMin: 10 },
      { name: 'เมโสหน้าใส', category: 'ฉีด', price: 3500, durationMin: 40, bufferAfterMin: 10 },
      { name: 'เลเซอร์หน้าใส', category: 'เลเซอร์', price: 2500, durationMin: 45, bufferAfterMin: 15 },
      { name: 'เลเซอร์กำจัดขน', category: 'เลเซอร์', price: 1800, durationMin: 30, bufferAfterMin: 15 },
      { name: 'ทรีตเมนต์หน้า', category: 'ทรีตเมนต์', price: 1500, durationMin: 60, bufferAfterMin: 15 },
      { name: 'กดสิว', category: 'ทรีตเมนต์', price: 800, durationMin: 45, bufferAfterMin: 15 },
    ],
  },
];

export function findTemplate(businessType: string): ShopTemplate | null {
  return SHOP_TEMPLATES.find((t) => t.businessType === businessType) ?? null;
}
