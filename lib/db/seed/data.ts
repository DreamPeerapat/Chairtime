/**
 * Three shops that stress different corners of the schema.
 *
 * This data is the real test of whether docs/schema.sql holds up:
 *   - the nail bar has more tables than staff, so chairs run out first
 *   - the hair salon has a colour service built from active/passive segments
 *   - the massage shop puts a 15-minute cleaning buffer on every treatment
 */

export interface SeedSegment {
  kind: 'active' | 'passive';
  durationMin: number;
  label?: string;
}

export interface SeedService {
  key: string;
  name: string;
  category: string;
  price: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  segments: SeedSegment[];
  pointEarnMode?: 'inherit' | 'none';
}

export interface SeedResource {
  key: string;
  type: 'staff' | 'chair' | 'bed' | 'table';
  name: string;
  /** service keys this person can do; omit for non-human resources */
  skills?: string[];
  durationFactor?: Record<string, number>;
  /** weekday -> [open, close]; omitted means "same as the shop" */
  hours?: Record<number, Array<[string, string]>>;
}

export interface SeedTenant {
  slug: string;
  name: string;
  businessType: string;
  phone: string;
  address: string;
  openHours: Record<number, Array<[string, string]>>;
  policy: {
    slotGranularityMin: number;
    minLeadTimeMin: number;
    maxAdvanceDays: number;
    cancelCutoffMin: number;
    allowCustomerPickStaff: boolean;
  };
  pointRule: {
    bahtPerPoint: number;
    pointValueBaht: number;
    minRedeemPoints: number;
    maxRedeemPercent: number;
    expiryMonths: number | null;
    signupBonus: number;
    birthdayBonus: number;
  };
  tiers: Array<{
    name: string;
    level: number;
    qualifySpend: number;
    qualifyVisits: number;
    pointMultiplier: number;
    discountPercent: number;
    priorityBookingDays: number;
    color: string;
  }>;
  resourceTypes: Array<{ code: string; name: string; isHuman: boolean }>;
  services: SeedService[];
  resources: SeedResource[];
  /** resource type code required by every service, with its hold scope */
  requirements: Array<{ typeCode: string; holdScope: 'active_only' | 'whole' }>;
  customers: Array<{ name: string; phone: string; note?: string; birthDate?: string }>;
}

const MON_TO_SUN = (open: string, close: string): Record<number, Array<[string, string]>> =>
  Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [d, [[open, close]]]));

// ---------------------------------------------------------------------
// 1. Nail bar — 4 tables, 3 technicians, 12 services from 30 to 120 minutes
// ---------------------------------------------------------------------

const nailServices: SeedService[] = [
  { key: 'nail_basic', name: 'ทาสีมือ', category: 'ทำเล็บมือ', price: 300, segments: [{ kind: 'active', durationMin: 30 }] },
  { key: 'nail_basic_foot', name: 'ทาสีเท้า', category: 'ทำเล็บเท้า', price: 350, segments: [{ kind: 'active', durationMin: 40 }] },
  { key: 'nail_gel', name: 'ต่อเจลมือ', category: 'ทำเล็บมือ', price: 750, bufferAfterMin: 5, segments: [{ kind: 'active', durationMin: 90 }] },
  { key: 'nail_gel_foot', name: 'ต่อเจลเท้า', category: 'ทำเล็บเท้า', price: 850, bufferAfterMin: 5, segments: [{ kind: 'active', durationMin: 100 }] },
  { key: 'nail_pvc', name: 'ต่อ PVC', category: 'ต่อเล็บ', price: 1200, bufferAfterMin: 10, segments: [{ kind: 'active', durationMin: 120 }] },
  { key: 'nail_paint', name: 'เพ้นท์ลาย (ต่อนิ้ว)', category: 'เพ้นท์', price: 80, segments: [{ kind: 'active', durationMin: 30 }] },
  { key: 'nail_remove', name: 'ถอดเจล', category: 'บริการเสริม', price: 200, segments: [{ kind: 'active', durationMin: 30 }] },
  { key: 'nail_cuticle', name: 'ตัดหนัง+บำรุง', category: 'บริการเสริม', price: 250, segments: [{ kind: 'active', durationMin: 30 }] },
  { key: 'nail_spa_hand', name: 'สปามือ', category: 'สปา', price: 500, bufferAfterMin: 5, segments: [{ kind: 'active', durationMin: 45 }] },
  { key: 'nail_spa_foot', name: 'สปาเท้า', category: 'สปา', price: 600, bufferAfterMin: 5, segments: [{ kind: 'active', durationMin: 60 }] },
  { key: 'nail_french', name: 'เฟรนช์', category: 'ทำเล็บมือ', price: 900, bufferAfterMin: 5, segments: [{ kind: 'active', durationMin: 100 }] },
  { key: 'nail_repair', name: 'ซ่อมเล็บ', category: 'บริการเสริม', price: 150, pointEarnMode: 'none', segments: [{ kind: 'active', durationMin: 30 }] },
];

export const nailBar: SeedTenant = {
  slug: 'nailbar-ari',
  name: 'Nail Bar อารีย์',
  businessType: 'nail',
  phone: '02-111-2233',
  address: 'ซอยอารีย์ 4 พหลโยธิน กรุงเทพฯ',
  openHours: MON_TO_SUN('10:00:00', '20:00:00'),
  policy: {
    slotGranularityMin: 15,
    minLeadTimeMin: 60,
    maxAdvanceDays: 45,
    cancelCutoffMin: 180,
    allowCustomerPickStaff: true,
  },
  pointRule: {
    bahtPerPoint: 100,
    pointValueBaht: 1,
    minRedeemPoints: 50,
    maxRedeemPercent: 50,
    expiryMonths: 12,
    signupBonus: 20,
    birthdayBonus: 100,
  },
  tiers: [
    { name: 'Silver', level: 1, qualifySpend: 0, qualifyVisits: 0, pointMultiplier: 1, discountPercent: 0, priorityBookingDays: 0, color: '#94a3b8' },
    { name: 'Gold', level: 2, qualifySpend: 15000, qualifyVisits: 8, pointMultiplier: 1.25, discountPercent: 5, priorityBookingDays: 15, color: '#eab308' },
    { name: 'Platinum', level: 3, qualifySpend: 40000, qualifyVisits: 20, pointMultiplier: 1.5, discountPercent: 10, priorityBookingDays: 30, color: '#a78bfa' },
  ],
  resourceTypes: [
    { code: 'staff', name: 'ช่างทำเล็บ', isHuman: true },
    { code: 'table', name: 'โต๊ะทำเล็บ', isHuman: false },
  ],
  requirements: [
    { typeCode: 'staff', holdScope: 'active_only' },
    { typeCode: 'table', holdScope: 'whole' },
  ],
  services: nailServices,
  resources: [
    { key: 'nail_s1', type: 'staff', name: 'ช่างแนน', skills: nailServices.map((s) => s.key) },
    {
      key: 'nail_s2',
      type: 'staff',
      name: 'ช่างมิ้นท์',
      skills: nailServices.filter((s) => s.key !== 'nail_pvc').map((s) => s.key),
    },
    {
      key: 'nail_s3',
      type: 'staff',
      name: 'ช่างเบล',
      // newest technician: still 20% slower on the long gel work
      skills: ['nail_basic', 'nail_basic_foot', 'nail_gel', 'nail_remove', 'nail_cuticle', 'nail_repair'],
      durationFactor: { nail_gel: 1.2 },
      hours: { 1: [['12:00:00', '20:00:00']], 2: [['12:00:00', '20:00:00']], 3: [['12:00:00', '20:00:00']], 4: [['12:00:00', '20:00:00']], 5: [['12:00:00', '20:00:00']] },
    },
    { key: 'nail_t1', type: 'table', name: 'โต๊ะ 1' },
    { key: 'nail_t2', type: 'table', name: 'โต๊ะ 2' },
    { key: 'nail_t3', type: 'table', name: 'โต๊ะ 3' },
    { key: 'nail_t4', type: 'table', name: 'โต๊ะ 4' },
  ],
  customers: [
    { name: 'คุณฝ้าย', phone: '0810000001', note: 'ชอบสีนู้ด แพ้กลิ่นน้ำยาถอดแรงๆ', birthDate: '1994-05-12' },
    { name: 'คุณจูน', phone: '0810000002', note: 'ขอช่างแนนตลอด' },
    { name: 'คุณเบียร์', phone: '0810000003' },
    { name: 'คุณแพร', phone: '0810000004', birthDate: '1990-11-02' },
    { name: 'คุณต่าย', phone: '0810000005', note: 'เล็บบางมาก ระวังตอนตะไบ' },
    { name: 'คุณหนึ่ง', phone: '0810000006' },
  ],
};

// ---------------------------------------------------------------------
// 2. Hair salon — 5 chairs, 4 stylists, colouring uses active/passive segments
// ---------------------------------------------------------------------

const hairServices: SeedService[] = [
  { key: 'hair_wash_cut', name: 'สระ+ตัด', category: 'ตัดผม', price: 450, bufferBeforeMin: 5, bufferAfterMin: 5, segments: [{ kind: 'active', durationMin: 60 }] },
  { key: 'hair_cut_only', name: 'ตัดอย่างเดียว', category: 'ตัดผม', price: 350, bufferAfterMin: 5, segments: [{ kind: 'active', durationMin: 40 }] },
  {
    key: 'hair_color',
    name: 'ย้อมผม',
    category: 'ทำสี',
    price: 1800,
    bufferAfterMin: 10,
    // the case docs/logic.md is built around: the stylist is free for 40 minutes
    segments: [
      { kind: 'active', durationMin: 30, label: 'ลงสี' },
      { kind: 'passive', durationMin: 40, label: 'รอสีติด' },
      { kind: 'active', durationMin: 20, label: 'สระ+เป่า' },
    ],
  },
  {
    key: 'hair_bleach',
    name: 'กัดสี',
    category: 'ทำสี',
    price: 2500,
    bufferAfterMin: 15,
    segments: [
      { kind: 'active', durationMin: 40, label: 'ลงยากัดสี' },
      { kind: 'passive', durationMin: 45, label: 'รอกัดสี' },
      { kind: 'active', durationMin: 35, label: 'สระ+โทนเนอร์' },
    ],
  },
  {
    key: 'hair_perm',
    name: 'ดัดผม',
    category: 'ดัด/ยืด',
    price: 2200,
    bufferAfterMin: 10,
    segments: [
      { kind: 'active', durationMin: 50, label: 'ม้วนโรล' },
      { kind: 'passive', durationMin: 30, label: 'รอยาดัด' },
      { kind: 'active', durationMin: 30, label: 'ล้าง+เซ็ต' },
    ],
  },
  {
    key: 'hair_straighten',
    name: 'ยืดผม',
    category: 'ดัด/ยืด',
    price: 2800,
    bufferAfterMin: 10,
    segments: [
      { kind: 'active', durationMin: 60, label: 'ลงยา' },
      { kind: 'passive', durationMin: 30, label: 'พักยา' },
      { kind: 'active', durationMin: 60, label: 'รีด+สระ' },
    ],
  },
  {
    key: 'hair_treatment',
    name: 'ทรีตเมนต์',
    category: 'บำรุง',
    price: 900,
    bufferAfterMin: 5,
    segments: [
      { kind: 'active', durationMin: 20, label: 'ลงทรีตเมนต์' },
      { kind: 'passive', durationMin: 20, label: 'อบไอน้ำ' },
      { kind: 'active', durationMin: 20, label: 'สระ+เป่า' },
    ],
  },
  { key: 'hair_blow', name: 'เซ็ตผม', category: 'จัดแต่ง', price: 500, bufferAfterMin: 5, segments: [{ kind: 'active', durationMin: 45 }] },
  { key: 'hair_shave', name: 'โกนหนวด', category: 'ชาย', price: 200, segments: [{ kind: 'active', durationMin: 20 }] },
];

export const hairSalon: SeedTenant = {
  slug: 'thehair-thonglor',
  name: 'The Hair ทองหล่อ',
  businessType: 'hair',
  phone: '02-222-3344',
  address: 'ทองหล่อ ซอย 10 กรุงเทพฯ',
  openHours: {
    // closed Mondays, and the shop takes a lunch break on weekdays
    0: [['10:00:00', '20:00:00']],
    2: [['10:00:00', '13:00:00'], ['14:00:00', '20:00:00']],
    3: [['10:00:00', '13:00:00'], ['14:00:00', '20:00:00']],
    4: [['10:00:00', '13:00:00'], ['14:00:00', '20:00:00']],
    5: [['10:00:00', '13:00:00'], ['14:00:00', '21:00:00']],
    6: [['09:00:00', '21:00:00']],
  },
  policy: {
    slotGranularityMin: 30,
    minLeadTimeMin: 120,
    maxAdvanceDays: 60,
    cancelCutoffMin: 240,
    allowCustomerPickStaff: true,
  },
  pointRule: {
    bahtPerPoint: 50,
    pointValueBaht: 1,
    minRedeemPoints: 100,
    maxRedeemPercent: 30,
    expiryMonths: 24,
    signupBonus: 50,
    birthdayBonus: 200,
  },
  tiers: [
    { name: 'Member', level: 1, qualifySpend: 0, qualifyVisits: 0, pointMultiplier: 1, discountPercent: 0, priorityBookingDays: 0, color: '#94a3b8' },
    { name: 'VIP', level: 2, qualifySpend: 25000, qualifyVisits: 6, pointMultiplier: 1.5, discountPercent: 5, priorityBookingDays: 30, color: '#f472b6' },
  ],
  resourceTypes: [
    { code: 'staff', name: 'ช่างผม', isHuman: true },
    { code: 'chair', name: 'เก้าอี้', isHuman: false },
  ],
  requirements: [
    { typeCode: 'staff', holdScope: 'active_only' },
    { typeCode: 'chair', holdScope: 'whole' },
  ],
  services: hairServices,
  resources: [
    { key: 'hair_s1', type: 'staff', name: 'ช่างโอ๊ต', skills: hairServices.map((s) => s.key) },
    { key: 'hair_s2', type: 'staff', name: 'ช่างพลอย', skills: hairServices.map((s) => s.key) },
    {
      key: 'hair_s3',
      type: 'staff',
      name: 'ช่างกิ๊ฟ',
      skills: ['hair_wash_cut', 'hair_cut_only', 'hair_color', 'hair_treatment', 'hair_blow'],
    },
    {
      key: 'hair_s4',
      type: 'staff',
      name: 'ช่างเจได',
      skills: ['hair_cut_only', 'hair_shave', 'hair_wash_cut', 'hair_blow'],
      hours: { 5: [['14:00:00', '21:00:00']], 6: [['09:00:00', '21:00:00']], 0: [['10:00:00', '20:00:00']] },
    },
    { key: 'hair_c1', type: 'chair', name: 'เก้าอี้ 1' },
    { key: 'hair_c2', type: 'chair', name: 'เก้าอี้ 2' },
    { key: 'hair_c3', type: 'chair', name: 'เก้าอี้ 3' },
    { key: 'hair_c4', type: 'chair', name: 'เก้าอี้ 4' },
    { key: 'hair_c5', type: 'chair', name: 'เก้าอี้ 5' },
  ],
  customers: [
    { name: 'คุณเอ', phone: '0820000001', note: 'ผมแพ้ยาดัด ใช้สูตรอ่อนเท่านั้น', birthDate: '1988-02-20' },
    { name: 'คุณบี', phone: '0820000002' },
    { name: 'คุณซี', phone: '0820000003', note: 'ชอบช่างโอ๊ต ไม่เอาช่างอื่น' },
    { name: 'คุณดี', phone: '0820000004', birthDate: '1996-07-30' },
    { name: 'คุณอี', phone: '0820000005' },
    { name: 'คุณเอฟ', phone: '0820000006', note: 'มาสายประจำ โทรเตือนก่อน 1 ชม.' },
    { name: 'คุณจี', phone: '0820000007' },
  ],
};

// ---------------------------------------------------------------------
// 3. Massage shop — 6 beds, 8 therapists, 15-minute cleaning buffer
// ---------------------------------------------------------------------

const massageServices: SeedService[] = [
  { key: 'ms_thai_60', name: 'นวดไทย 60 นาที', category: 'นวดไทย', price: 400, bufferAfterMin: 15, segments: [{ kind: 'active', durationMin: 60 }] },
  { key: 'ms_thai_90', name: 'นวดไทย 90 นาที', category: 'นวดไทย', price: 550, bufferAfterMin: 15, segments: [{ kind: 'active', durationMin: 90 }] },
  { key: 'ms_thai_120', name: 'นวดไทย 120 นาที', category: 'นวดไทย', price: 700, bufferAfterMin: 15, segments: [{ kind: 'active', durationMin: 120 }] },
  { key: 'ms_oil_60', name: 'นวดน้ำมัน 60 นาที', category: 'นวดน้ำมัน', price: 600, bufferBeforeMin: 5, bufferAfterMin: 15, segments: [{ kind: 'active', durationMin: 60 }] },
  { key: 'ms_oil_90', name: 'นวดน้ำมัน 90 นาที', category: 'นวดน้ำมัน', price: 800, bufferBeforeMin: 5, bufferAfterMin: 15, segments: [{ kind: 'active', durationMin: 90 }] },
  { key: 'ms_foot_45', name: 'นวดเท้า 45 นาที', category: 'นวดเท้า', price: 300, bufferAfterMin: 10, segments: [{ kind: 'active', durationMin: 45 }] },
  { key: 'ms_foot_60', name: 'นวดเท้า 60 นาที', category: 'นวดเท้า', price: 380, bufferAfterMin: 10, segments: [{ kind: 'active', durationMin: 60 }] },
  { key: 'ms_head', name: 'นวดศีรษะ+บ่า', category: 'นวดเฉพาะจุด', price: 350, bufferAfterMin: 10, segments: [{ kind: 'active', durationMin: 45 }] },
  {
    key: 'ms_herbal',
    name: 'ประคบสมุนไพร',
    category: 'ประคบ',
    price: 750,
    bufferBeforeMin: 10,
    bufferAfterMin: 15,
    segments: [
      { kind: 'active', durationMin: 60, label: 'นวด' },
      { kind: 'passive', durationMin: 15, label: 'ประคบร้อน พักบนเตียง' },
    ],
  },
  { key: 'ms_office', name: 'นวดออฟฟิศซินโดรม', category: 'นวดเฉพาะจุด', price: 500, bufferAfterMin: 15, segments: [{ kind: 'active', durationMin: 60 }] },
];

export const massageShop: SeedTenant = {
  slug: 'baanmalisa-spa',
  name: 'บ้านมะลิซ้อน นวดแผนไทย',
  businessType: 'massage',
  phone: '02-333-4455',
  address: 'ถนนสุขุมวิท 71 กรุงเทพฯ',
  openHours: MON_TO_SUN('09:00:00', '22:00:00'),
  policy: {
    slotGranularityMin: 15,
    minLeadTimeMin: 30,
    maxAdvanceDays: 30,
    cancelCutoffMin: 120,
    allowCustomerPickStaff: false,
  },
  pointRule: {
    bahtPerPoint: 100,
    pointValueBaht: 1,
    minRedeemPoints: 30,
    maxRedeemPercent: 50,
    expiryMonths: null, // this shop's points never expire
    signupBonus: 10,
    birthdayBonus: 50,
  },
  tiers: [
    { name: 'ทั่วไป', level: 1, qualifySpend: 0, qualifyVisits: 0, pointMultiplier: 1, discountPercent: 0, priorityBookingDays: 0, color: '#94a3b8' },
    { name: 'สมาชิก', level: 2, qualifySpend: 8000, qualifyVisits: 10, pointMultiplier: 1.2, discountPercent: 5, priorityBookingDays: 7, color: '#34d399' },
    { name: 'สมาชิกทอง', level: 3, qualifySpend: 20000, qualifyVisits: 25, pointMultiplier: 1.5, discountPercent: 10, priorityBookingDays: 14, color: '#fbbf24' },
  ],
  resourceTypes: [
    { code: 'staff', name: 'หมอนวด', isHuman: true },
    { code: 'bed', name: 'เตียงนวด', isHuman: false },
  ],
  requirements: [
    { typeCode: 'staff', holdScope: 'active_only' },
    { typeCode: 'bed', holdScope: 'whole' },
  ],
  services: massageServices,
  resources: [
    ...['หมอสมพร', 'หมอวิภา', 'หมอนงลักษณ์', 'หมอประทีป', 'หมอจันทร์', 'หมอสุดา', 'หมอบัวลอย', 'หมออารีย์'].map(
      (name, i): SeedResource => ({
        key: `ms_s${i + 1}`,
        type: 'staff',
        name,
        // the first four are the only ones trained on oil and herbal work
        skills:
          i < 4
            ? massageServices.map((s) => s.key)
            : massageServices.filter((s) => !s.key.startsWith('ms_oil') && s.key !== 'ms_herbal').map((s) => s.key),
        ...(i >= 6
          ? { hours: { 0: [['09:00:00', '22:00:00']], 6: [['09:00:00', '22:00:00']], 5: [['16:00:00', '22:00:00']] } }
          : {}),
      }),
    ),
    ...[1, 2, 3, 4, 5, 6].map((n): SeedResource => ({ key: `ms_b${n}`, type: 'bed', name: `เตียง ${n}` })),
  ],
  customers: [
    { name: 'คุณสมชาย', phone: '0830000001', note: 'ปวดหลังล่าง ห้ามเหยียบ' },
    { name: 'คุณมาลี', phone: '0830000002', birthDate: '1975-03-08' },
    { name: 'คุณวิชัย', phone: '0830000003', note: 'ชอบน้ำหนักมือหนัก' },
    { name: 'คุณนภา', phone: '0830000004' },
    { name: 'คุณธีระ', phone: '0830000005', note: 'ความดันสูง ห้ามนวดคอแรง' },
    { name: 'คุณกนก', phone: '0830000006' },
    { name: 'คุณพิมพ์', phone: '0830000007', birthDate: '1992-12-25' },
    { name: 'คุณอนันต์', phone: '0830000008' },
  ],
};

export const seedTenants: SeedTenant[] = [nailBar, hairSalon, massageShop];
