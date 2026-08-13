-- =====================================================================
--  Multi-tenant Booking + Loyalty  |  PostgreSQL 14+
--  รองรับ: ร้านเล็บ / ร้านผม / ร้านนวด / คลินิก / สปา
--  แนวคิดหลัก:
--    1. resource-based ไม่ใช่ slot-based  → รองรับหลายเตียง/หลายช่าง
--    2. service มี segment (active/passive) → รองรับย้อมผม, มาส์ก, รอสีติด
--    3. แต้มใช้ ledger + lot           → หมดอายุแบบ FIFO, audit ได้, ไม่หาย
--    4. auth เป็น OAuth เท่านั้น (LINE/Google) → self-serve signup ไม่ต้องรอแอดมิน
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- จำเป็นสำหรับ EXCLUDE constraint


-- =====================================================================
--  1. TENANT  (ร้านค้า)
-- =====================================================================

-- ---------------------------------------------------------------------
--  แพ็กเกจ subscription — แยกออกจาก tenant เพื่อแก้ราคา/limit ได้โดยไม่ ALTER tenant
-- ---------------------------------------------------------------------
CREATE TABLE subscription_plan (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    text UNIQUE NOT NULL,   -- trial | basic | pro
    name                    text NOT NULL,
    price_monthly           numeric(10,2),
    price_yearly            numeric(10,2),
    max_resources           int,                    -- NULL = ไม่จำกัด
    max_bookings_per_month  int,
    trial_days              int NOT NULL DEFAULT 0,
    is_active               boolean NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------
--  Template บริการมาตรฐานตามประเภทธุรกิจ
--  ใช้ตอน onboarding เพื่อ copy ให้ tenant ใหม่ทันที ไม่ต้องพิมพ์เอง
-- ---------------------------------------------------------------------
CREATE TABLE business_type_template (
    business_type   text PRIMARY KEY,     -- nail | hair | massage | clinic | other
    display_name    text NOT NULL,        -- "ร้านทำเล็บ"
    -- services_json: [{ name, category, price, duration_min,
    --                    buffer_before_min, buffer_after_min }, ...]
    services_json    jsonb NOT NULL DEFAULT '[]',
    -- resource_types_json: [{ code, name, is_human }, ...]
    resource_types_json jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE tenant (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            text UNIQUE NOT NULL,              -- nailbar-ari  → nailbar-ari.yourapp.com
    name            text NOT NULL,
    business_type   text NOT NULL,                     -- nail | hair | massage | clinic | other
    timezone        text NOT NULL DEFAULT 'Asia/Bangkok',
    currency        char(3) NOT NULL DEFAULT 'THB',
    phone           text,
    address         text,
    plan_id         uuid REFERENCES subscription_plan(id),
    -- pending_payment = เลือกแพ็กเกจเสียเงินแต่ยังไม่จ่าย (ยังใช้งานไม่ได้)
    -- active          = ใช้งานได้ (trial หรือจ่ายแล้ว)
    -- suspended       = trial/บิลหมดอายุ ไม่จ่ายต่อ
    -- cancelled       = ยกเลิกเอง
    status          text NOT NULL DEFAULT 'pending_payment'
                    CHECK (status IN ('pending_payment','active','suspended','cancelled')),
    trial_ends_at   timestamptz,
    onboarded_at    timestamptz,     -- NULL = ยังไม่ผ่าน onboarding wizard
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON tenant (status);

-- ค่าตั้งนโยบายการจอง แยกออกมาเพื่อไม่ต้อง ALTER tenant บ่อย
CREATE TABLE tenant_booking_policy (
    tenant_id                uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
    slot_granularity_min     int  NOT NULL DEFAULT 15,   -- ปล่อยช่องทุกกี่นาที
    min_lead_time_min        int  NOT NULL DEFAULT 60,   -- จองล่วงหน้าอย่างน้อย
    max_advance_days         int  NOT NULL DEFAULT 60,   -- จองล่วงหน้าได้ไกลสุด
    cancel_cutoff_min        int  NOT NULL DEFAULT 180,  -- ยกเลิกฟรีก่อนกี่นาที
    allow_customer_pick_staff boolean NOT NULL DEFAULT true,
    require_deposit          boolean NOT NULL DEFAULT false,
    deposit_percent          numeric(5,2) DEFAULT 0,
    auto_confirm             boolean NOT NULL DEFAULT true,
    no_show_fee              numeric(10,2) DEFAULT 0
);


-- =====================================================================
--  2. RESOURCE  (ช่าง / เตียง / โต๊ะ / ห้อง / เครื่องมือ)
--     หัวใจของระบบ — ถ้าไม่มีตัวนี้ ระบบพังทันทีที่ร้านมีมากกว่า 1 ที่นั่ง
-- =====================================================================

CREATE TABLE resource_type (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    code        text NOT NULL,          -- staff | chair | bed | room | machine
    name        text NOT NULL,          -- "ช่างทำเล็บ" / "เตียงนวด"
    is_human    boolean NOT NULL DEFAULT false,
    UNIQUE (tenant_id, code)
);

CREATE TABLE resource (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    resource_type_id  uuid NOT NULL REFERENCES resource_type(id),
    name              text NOT NULL,           -- "ช่างแนน" / "เตียง 3"
    display_order     int  NOT NULL DEFAULT 0,
    photo_url         text,
    bio               text,
    is_bookable       boolean NOT NULL DEFAULT true,   -- ลูกค้าเลือกเจาะจงได้ไหม
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON resource (tenant_id, is_active);


-- =====================================================================
--  3. SERVICE  (บริการ)
-- =====================================================================

CREATE TABLE service_category (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    name          text NOT NULL,
    display_order int NOT NULL DEFAULT 0
);

CREATE TABLE service (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    category_id       uuid REFERENCES service_category(id) ON DELETE SET NULL,
    name              text NOT NULL,
    description       text,
    base_price        numeric(10,2) NOT NULL,
    -- เวลา
    buffer_before_min int NOT NULL DEFAULT 0,     -- เตรียมของ / ปูผ้า
    buffer_after_min  int NOT NULL DEFAULT 0,     -- ทำความสะอาด / เก็บของ
    -- แต้ม
    point_earn_mode   text NOT NULL DEFAULT 'inherit',  -- inherit | fixed | multiplier | none
    point_earn_value  numeric(10,2) DEFAULT 0,
    is_point_redeemable boolean NOT NULL DEFAULT true,  -- ใช้แต้มแลกบริการนี้ได้ไหม
    -- อื่นๆ
    max_parallel_customers int NOT NULL DEFAULT 1,      -- คลาสกลุ่ม เช่น โยคะ = 10
    is_active         boolean NOT NULL DEFAULT true,
    display_order     int NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON service (tenant_id, is_active);

-- ---------------------------------------------------------------------
--  SEGMENT — ตัวแก้ปัญหา "ย้อมผมแล้วช่างว่างระหว่างรอสีติด"
--  active  = ช่างต้องอยู่กับลูกค้า
--  passive = ช่างไปรับคนอื่นได้ แต่เก้าอี้/เตียงยังถูกใช้อยู่
-- ---------------------------------------------------------------------
CREATE TABLE service_segment (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id    uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
    seq           int  NOT NULL,                 -- 1,2,3...
    kind          text NOT NULL CHECK (kind IN ('active','passive')),
    duration_min  int  NOT NULL CHECK (duration_min > 0),
    label         text,                          -- "ลงสี" / "รอสีติด" / "สระออก"
    UNIQUE (service_id, seq)
);
-- ตัวอย่าง ย้อมผม: (1,active,30,'ลงสี') (2,passive,40,'รอสีติด') (3,active,20,'สระ+เป่า')
-- บริการธรรมดา: (1,active,60,NULL)

-- ---------------------------------------------------------------------
--  บริการนี้ต้องใช้ resource อะไรบ้าง
--  hold_scope: active_only = จองช่างเฉพาะช่วง active
--              whole       = จองทั้งหมดรวม passive (เตียง/เก้าอี้/ห้อง)
-- ---------------------------------------------------------------------
CREATE TABLE service_resource_requirement (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    service_id       uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
    resource_type_id uuid NOT NULL REFERENCES resource_type(id),
    quantity         int  NOT NULL DEFAULT 1,
    hold_scope       text NOT NULL DEFAULT 'whole'
                     CHECK (hold_scope IN ('active_only','whole')),
    UNIQUE (service_id, resource_type_id)
);

-- ช่างคนไหนทำบริการอะไรได้ + ราคา/เวลาต่างจากมาตรฐานไหม
CREATE TABLE resource_service_skill (
    resource_id       uuid NOT NULL REFERENCES resource(id) ON DELETE CASCADE,
    service_id        uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
    price_override    numeric(10,2),        -- ช่างอาวุโสแพงกว่า
    duration_factor   numeric(4,2) NOT NULL DEFAULT 1.00,  -- ช่างใหม่ช้ากว่า 1.2 เท่า
    PRIMARY KEY (resource_id, service_id)
);


-- =====================================================================
--  4. เวลาทำการ / วันหยุด / ตารางช่าง
-- =====================================================================

CREATE TABLE business_hour (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    resource_id  uuid REFERENCES resource(id) ON DELETE CASCADE,  -- NULL = ทั้งร้าน
    weekday      int  NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0=อาทิตย์
    open_time    time NOT NULL,
    close_time   time NOT NULL,
    CHECK (close_time > open_time)
);
-- พักเที่ยง = ใส่ 2 แถว 10:00-12:00 และ 13:00-20:00

-- ปิดร้าน / ช่างลา / จองส่วนตัว  (resource_id NULL = ปิดทั้งร้าน)
CREATE TABLE time_off (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    resource_id  uuid REFERENCES resource(id) ON DELETE CASCADE,
    period       tstzrange NOT NULL,
    reason       text,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON time_off USING gist (period);
CREATE INDEX ON time_off (tenant_id, resource_id);


-- =====================================================================
--  5. CUSTOMER  (ลูกค้าของร้าน — แยกตาม tenant)
-- =====================================================================

CREATE TABLE customer (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    line_user_id      text,                  -- จาก LINE Login / LIFF
    phone             text,
    name              text NOT NULL,
    email             text,
    birth_date        date,                  -- ใช้ส่งโปรวันเกิด
    note              text,                  -- "แพ้น้ำยา X" / "ชอบช่างแนน"
    -- loyalty (denormalized เพื่อความเร็ว — ต้องตรงกับ ledger เสมอ)
    point_balance     int NOT NULL DEFAULT 0,
    lifetime_points   int NOT NULL DEFAULT 0,
    lifetime_spend    numeric(12,2) NOT NULL DEFAULT 0,
    visit_count       int NOT NULL DEFAULT 0,
    no_show_count     int NOT NULL DEFAULT 0,
    last_visit_at     timestamptz,
    is_blocked        boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, line_user_id),
    UNIQUE (tenant_id, phone)
);
CREATE INDEX ON customer (tenant_id, name);


-- =====================================================================
--  6. BOOKING
--     booking      = 1 ครั้งที่ลูกค้ามา (อาจมีหลายบริการ)
--     booking_item = 1 บริการ
--     allocation   = การจอง resource จริง ← ตัวกันชนกัน
-- =====================================================================

CREATE TABLE booking (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    customer_id       uuid REFERENCES customer(id) ON DELETE SET NULL,
    code              text NOT NULL,          -- "A7K2Q9" ให้ลูกค้าอ้างอิง
    status            text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','confirmed','in_progress',
                                        'completed','cancelled','no_show')),
    starts_at         timestamptz NOT NULL,   -- = MIN ของ item
    ends_at           timestamptz NOT NULL,   -- = MAX ของ item
    source            text NOT NULL DEFAULT 'online',  -- online | walk_in | phone | admin
    -- เงิน
    subtotal          numeric(10,2) NOT NULL DEFAULT 0,
    discount_amount   numeric(10,2) NOT NULL DEFAULT 0,
    point_discount    numeric(10,2) NOT NULL DEFAULT 0,
    total             numeric(10,2) NOT NULL DEFAULT 0,
    deposit_paid      numeric(10,2) NOT NULL DEFAULT 0,
    payment_status    text NOT NULL DEFAULT 'unpaid',  -- unpaid | deposit | paid | refunded
    -- แต้ม
    points_earned     int NOT NULL DEFAULT 0,
    points_spent      int NOT NULL DEFAULT 0,
    customer_note     text,
    internal_note     text,
    cancelled_at      timestamptz,
    cancel_reason     text,
    completed_at      timestamptz,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);
CREATE INDEX ON booking (tenant_id, starts_at);
CREATE INDEX ON booking (tenant_id, status, starts_at);
CREATE INDEX ON booking (customer_id, starts_at DESC);

CREATE TABLE booking_item (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id     uuid NOT NULL REFERENCES booking(id) ON DELETE CASCADE,
    service_id     uuid NOT NULL REFERENCES service(id),
    seq            int  NOT NULL DEFAULT 1,        -- ลำดับบริการในครั้งนี้
    -- snapshot ราคา/ชื่อ ณ เวลาจอง (ห้าม join กลับไปอ่านราคาปัจจุบัน)
    service_name   text NOT NULL,
    price          numeric(10,2) NOT NULL,
    duration_min   int NOT NULL,
    starts_at      timestamptz NOT NULL,
    ends_at        timestamptz NOT NULL,
    -- ถ้าใช้แพ็กเกจตัดครั้งแทนเงินสด
    customer_package_id uuid,
    UNIQUE (booking_id, seq)
);

-- ★ ตารางที่กัน double-booking ระดับฐานข้อมูล
CREATE TABLE resource_allocation (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    booking_item_id uuid NOT NULL REFERENCES booking_item(id) ON DELETE CASCADE,
    resource_id     uuid NOT NULL REFERENCES resource(id),
    period          tstzrange NOT NULL,      -- รวม buffer แล้ว
    is_active_hold  boolean NOT NULL DEFAULT true,
    is_released     boolean NOT NULL DEFAULT false   -- ตั้ง true เมื่อยกเลิก
);

-- หัวใจความถูกต้อง: DB จะ reject เองถ้าเวลาทับกัน ไม่ต้องพึ่ง application lock
ALTER TABLE resource_allocation
  ADD CONSTRAINT resource_no_overlap
  EXCLUDE USING gist (resource_id WITH =, period WITH &&)
  WHERE (is_released = false);

CREATE INDEX ON resource_allocation USING gist (period);
CREATE INDEX ON resource_allocation (tenant_id, resource_id);


-- =====================================================================
--  7. LOYALTY — TIER
-- =====================================================================

CREATE TABLE membership_tier (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    name               text NOT NULL,            -- Silver / Gold / Platinum
    level              int  NOT NULL,            -- 1,2,3 (มากกว่า = สูงกว่า)
    -- เงื่อนไขเลื่อนขั้น (นับจากยอดใช้จ่ายย้อนหลัง N เดือน)
    qualify_spend      numeric(12,2) NOT NULL DEFAULT 0,
    qualify_visits     int NOT NULL DEFAULT 0,
    qualify_window_months int NOT NULL DEFAULT 12,
    -- สิทธิประโยชน์
    point_multiplier   numeric(4,2) NOT NULL DEFAULT 1.00,   -- Gold ได้แต้ม x1.5
    discount_percent   numeric(5,2) NOT NULL DEFAULT 0,
    priority_booking_days int NOT NULL DEFAULT 0,            -- จองล่วงหน้าได้ไกลกว่า
    perks_json         jsonb NOT NULL DEFAULT '{}',
    color              text,
    UNIQUE (tenant_id, level)
);

CREATE TABLE customer_tier (
    customer_id     uuid PRIMARY KEY REFERENCES customer(id) ON DELETE CASCADE,
    tier_id         uuid NOT NULL REFERENCES membership_tier(id),
    achieved_at     timestamptz NOT NULL DEFAULT now(),
    valid_until     date,               -- ต้องรักษายอด ไม่งั้นตกชั้น
    is_manual       boolean NOT NULL DEFAULT false   -- แอดมินตั้งเอง ห้าม job แตะ
);


-- =====================================================================
--  8. LOYALTY — POINTS
--     ใช้ 2 ตาราง:
--       point_lot    = ก้อนแต้มที่ได้มา (มีวันหมดอายุ + ยอดคงเหลือของก้อน)
--       point_ledger = บันทึกทุกการเคลื่อนไหว (append-only, ห้าม UPDATE/DELETE)
--     ทำไมไม่เก็บแค่ balance? เพราะแต้มหมดอายุแบบ FIFO และต้องตรวจย้อนหลังได้
-- =====================================================================

CREATE TABLE point_rule (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    -- การได้แต้ม
    baht_per_point    numeric(10,2) NOT NULL DEFAULT 100,  -- ใช้ 100 บาท = 1 แต้ม
    rounding          text NOT NULL DEFAULT 'floor',       -- floor | round | ceil
    -- การใช้แต้ม
    point_value_baht  numeric(10,2) NOT NULL DEFAULT 1.00, -- 1 แต้ม = 1 บาท
    min_redeem_points int NOT NULL DEFAULT 50,
    max_redeem_percent numeric(5,2) NOT NULL DEFAULT 50,   -- ใช้แต้มได้ไม่เกิน 50% ของบิล
    -- อายุแต้ม
    expiry_months     int,                                 -- NULL = ไม่หมดอายุ
    expiry_mode       text NOT NULL DEFAULT 'from_earn',   -- from_earn | fixed_year_end
    -- โบนัส
    signup_bonus      int NOT NULL DEFAULT 0,
    birthday_bonus    int NOT NULL DEFAULT 0,
    referral_bonus    int NOT NULL DEFAULT 0,
    is_active         boolean NOT NULL DEFAULT true,
    UNIQUE (tenant_id)
);

-- ก้อนแต้ม (เฉพาะรายการที่ "ได้เพิ่ม")
CREATE TABLE point_lot (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    customer_id       uuid NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    points_total      int NOT NULL CHECK (points_total > 0),
    points_remaining  int NOT NULL CHECK (points_remaining >= 0),
    earned_at         timestamptz NOT NULL DEFAULT now(),
    expires_at        timestamptz,                 -- NULL = ไม่หมดอายุ
    source_type       text NOT NULL,               -- booking | signup | birthday | referral | manual
    source_id         uuid,
    CHECK (points_remaining <= points_total)
);
-- index สำหรับหาแต้มที่ใช้ได้ เรียงตามใกล้หมดอายุก่อน (FIFO)
CREATE INDEX ON point_lot (customer_id, expires_at NULLS LAST, earned_at)
    WHERE points_remaining > 0;

-- บันทึกทุกการเคลื่อนไหว — ห้ามแก้ ห้ามลบ
CREATE TABLE point_ledger (
    id             bigserial PRIMARY KEY,
    tenant_id      uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    customer_id    uuid NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    entry_type     text NOT NULL CHECK (entry_type IN
                       ('earn','redeem','expire','adjust','revert')),
    points         int NOT NULL,          -- +earn / -redeem / -expire
    balance_after  int NOT NULL,
    lot_id         uuid REFERENCES point_lot(id),   -- ก้อนที่ถูกหัก (สำหรับ redeem/expire)
    source_type    text NOT NULL,
    source_id      uuid,
    note           text,
    created_by     uuid,                  -- staff user ที่กด (ถ้ามี)
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON point_ledger (customer_id, created_at DESC);

-- ★ กันแต้มซ้ำ: 1 booking ได้แต้มได้ครั้งเดียวเท่านั้น
--   (เผื่อกดปุ่ม "จบงาน" สองที หรือ webhook ยิงซ้ำ)
CREATE UNIQUE INDEX point_ledger_idem
    ON point_ledger (tenant_id, entry_type, source_type, source_id)
    WHERE source_id IS NOT NULL AND entry_type IN ('earn','redeem');


-- =====================================================================
--  9. REWARD  (ของรางวัลแลกแต้ม)
-- =====================================================================

CREATE TABLE reward (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    name            text NOT NULL,
    reward_type     text NOT NULL CHECK (reward_type IN
                        ('free_service','discount_amount','discount_percent','free_item')),
    point_cost      int NOT NULL,
    service_id      uuid REFERENCES service(id),     -- ถ้าแลกเป็นบริการฟรี
    value_amount    numeric(10,2),                   -- ถ้าเป็นส่วนลด
    min_tier_level  int NOT NULL DEFAULT 0,          -- ต้องเป็นระดับไหนขึ้นไป
    stock           int,                             -- NULL = ไม่จำกัด
    stock_used      int NOT NULL DEFAULT 0,
    valid_from      date,
    valid_until     date,
    is_active       boolean NOT NULL DEFAULT true
);

CREATE TABLE reward_redemption (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    customer_id   uuid NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    reward_id     uuid NOT NULL REFERENCES reward(id),
    points_spent  int NOT NULL,
    code          text NOT NULL,          -- โค้ดให้พนักงานสแกน/กรอก
    status        text NOT NULL DEFAULT 'issued'
                  CHECK (status IN ('issued','used','expired','cancelled')),
    booking_id    uuid REFERENCES booking(id),
    expires_at    timestamptz,
    used_at       timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);


-- =====================================================================
--  10. PACKAGE  (คอร์ส/แพ็กเกจตัดครั้ง — ขายดีมากในร้านนวด/เล็บ/สปา)
-- =====================================================================

CREATE TABLE package (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    name              text NOT NULL,          -- "นวดไทย 10 ครั้ง"
    price             numeric(10,2) NOT NULL,
    total_sessions    int NOT NULL,
    valid_days        int,                    -- อายุกี่วันนับจากซื้อ (NULL = ไม่หมด)
    is_transferable   boolean NOT NULL DEFAULT false,   -- โอนให้เพื่อนได้ไหม
    is_active         boolean NOT NULL DEFAULT true
);

CREATE TABLE package_service (
    package_id  uuid NOT NULL REFERENCES package(id) ON DELETE CASCADE,
    service_id  uuid NOT NULL REFERENCES service(id) ON DELETE CASCADE,
    PRIMARY KEY (package_id, service_id)
);

CREATE TABLE customer_package (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id         uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    customer_id       uuid NOT NULL REFERENCES customer(id) ON DELETE CASCADE,
    package_id        uuid NOT NULL REFERENCES package(id),
    sessions_total    int NOT NULL,
    sessions_used     int NOT NULL DEFAULT 0,
    purchased_at      timestamptz NOT NULL DEFAULT now(),
    expires_at        timestamptz,
    status            text NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','used_up','expired','refunded')),
    CHECK (sessions_used <= sessions_total)
);
CREATE INDEX ON customer_package (customer_id, status);

ALTER TABLE booking_item
  ADD CONSTRAINT fk_customer_package
  FOREIGN KEY (customer_package_id) REFERENCES customer_package(id);


-- =====================================================================
--  11. NOTIFICATION  (คิวส่ง LINE — ห้ามส่งตรงจาก request)
-- =====================================================================

CREATE TABLE notification_queue (
    id            bigserial PRIMARY KEY,
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    customer_id   uuid REFERENCES customer(id) ON DELETE CASCADE,
    channel       text NOT NULL DEFAULT 'line',   -- line | sms | email
    template      text NOT NULL,                  -- booking_confirmed | reminder_24h |
                                                  -- reminder_2h | points_earned | tier_up
    payload       jsonb NOT NULL DEFAULT '{}',
    scheduled_at  timestamptz NOT NULL,
    sent_at       timestamptz,
    status        text NOT NULL DEFAULT 'pending'  -- pending | sent | failed | cancelled
                  CHECK (status IN ('pending','sent','failed','cancelled')),
    attempts      int NOT NULL DEFAULT 0,
    last_error    text,
    dedupe_key    text,                            -- กันส่งซ้ำ
    UNIQUE (dedupe_key)
);
CREATE INDEX ON notification_queue (status, scheduled_at)
    WHERE status = 'pending';


-- =====================================================================
--  12. AUTH + STAFF USER  (OAuth เท่านั้น — ไม่มี password)
--      แยก identity (ตัวตนจริง) ออกจาก staff_user (บทบาทในระบบ)
--      เพื่อรองรับ: คนเดียวเป็นเจ้าของหลายร้าน, login ได้ทั้ง LINE/Google
-- =====================================================================

-- ตัวตนจริงจาก OAuth provider — ไม่ผูกกับร้านใดร้านหนึ่ง
CREATE TABLE auth_identity (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider      text NOT NULL CHECK (provider IN ('line','google')),
    provider_uid  text NOT NULL,          -- LINE userId หรือ Google sub
    email         text,
    display_name  text,
    avatar_url    text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_uid)
);

-- ผู้ใช้ระบบ 1 คน อาจมีหลาย identity ถ้าเชื่อมบัญชี (LINE + Google) ในหน้า settings
CREATE TABLE staff_user (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    primary_email     text,
    display_name      text,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE staff_auth_identity (
    staff_id          uuid NOT NULL REFERENCES staff_user(id) ON DELETE CASCADE,
    auth_identity_id  uuid NOT NULL REFERENCES auth_identity(id) ON DELETE CASCADE,
    PRIMARY KEY (staff_id, auth_identity_id),
    UNIQUE (auth_identity_id)   -- 1 identity ผูกได้กับ 1 staff_user เท่านั้น
);

-- ความสัมพันธ์คน ↔ ร้าน (many-to-many รองรับหลายสาขา)
CREATE TABLE staff_tenant (
    staff_id      uuid NOT NULL REFERENCES staff_user(id) ON DELETE CASCADE,
    tenant_id     uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    resource_id   uuid REFERENCES resource(id),   -- ถ้าเป็นช่างด้วย
    role          text NOT NULL DEFAULT 'staff',  -- owner | manager | staff
    is_active     boolean NOT NULL DEFAULT true,
    joined_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (staff_id, tenant_id)
);
CREATE INDEX ON staff_tenant (tenant_id);

CREATE TABLE audit_log (
    id          bigserial PRIMARY KEY,
    tenant_id   uuid NOT NULL,
    actor_id    uuid,
    action      text NOT NULL,       -- point.adjust | booking.cancel | price.change
    entity      text NOT NULL,
    entity_id   uuid,
    before_json jsonb,
    after_json  jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (tenant_id, created_at DESC);


-- =====================================================================
--  12.5 LINE OA CONNECTION  (ร้านเชื่อม LINE OA ของตัวเองเข้าระบบ)
--       connection_method รองรับ 2 ทาง เพื่อ migrate ได้ในอนาคตโดยไม่รื้อ schema:
--         manual        = ร้านคัดลอก token/secret มาวางเอง (ใช้ตอนนี้)
--         partner_oauth = เชื่อมผ่านปุ่มเดียวหลังได้ LINE Partner Program (อนาคต)
-- =====================================================================

CREATE TABLE tenant_line_oa (
    tenant_id             uuid PRIMARY KEY REFERENCES tenant(id) ON DELETE CASCADE,
    connection_method     text NOT NULL DEFAULT 'manual'
                          CHECK (connection_method IN ('manual','partner_oauth')),
    -- เข้ารหัสก่อนเก็บเสมอ (pgcrypto หรือ KMS) ห้าม plaintext เด็ดขาด
    channel_access_token  text,
    channel_secret        text,
    oa_basic_id           text,            -- @xxxxx สำหรับโชว์ QR ให้ร้าน
    webhook_url           text,            -- ที่ generate ให้ร้านไปวางใน LINE Developers Console
    -- สถานะ wizard แต่ละขั้น เพื่อโชว์ checklist ความคืบหน้าให้ร้านเห็น
    step_oa_created       boolean NOT NULL DEFAULT false,
    step_api_enabled      boolean NOT NULL DEFAULT false,
    step_token_saved      boolean NOT NULL DEFAULT false,
    step_webhook_verified boolean NOT NULL DEFAULT false,
    is_verified           boolean NOT NULL DEFAULT false,   -- ทดสอบยิงข้อความสำเร็จแล้ว
    connected_at          timestamptz,
    last_verified_at      timestamptz,
    last_error            text,             -- ไว้โชว์ error ให้ร้านเห็นตอนกด "ทดสอบเชื่อมต่อ"
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);


-- =====================================================================
--  13. ROW LEVEL SECURITY  (กันข้อมูลข้ามร้าน — สำคัญมากสำหรับ multi-tenant)
-- =====================================================================

ALTER TABLE booking        ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer       ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_lot      ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_tenant   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_line_oa ENABLE ROW LEVEL SECURITY;
-- ... ทำกับทุกตารางที่มี tenant_id
-- หมายเหตุ: auth_identity, staff_user, subscription_plan, business_type_template
--           ไม่มี tenant_id ตรงๆ (เป็น global/cross-tenant) ไม่ต้องเปิด RLS แบบนี้

CREATE POLICY tenant_isolation ON booking
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON customer
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON point_lot
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON staff_tenant
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY tenant_isolation ON tenant_line_oa
    USING (tenant_id = current_setting('app.tenant_id', true)::uuid);
-- ก่อนทุก query ให้ตั้ง:  SET LOCAL app.tenant_id = '<uuid>';


-- =====================================================================
--  14. SEED — ข้อมูลเริ่มต้นที่ต้องมีก่อนระบบ signup ทำงานได้
-- =====================================================================

INSERT INTO subscription_plan (code, name, price_monthly, price_yearly, max_resources, max_bookings_per_month, trial_days) VALUES
    ('trial', 'ทดลองใช้',   0,    0,    3,   100,  14),
    ('basic', 'Basic',      590,  5900, 8,   1000, 0),
    ('pro',   'Pro',        1200, 12000, NULL, NULL, 0);

INSERT INTO business_type_template (business_type, display_name, services_json, resource_types_json) VALUES
    ('nail', 'ร้านทำเล็บ',
     '[{"name":"ทำเล็บมือ เจล","price":350,"duration_min":60},
       {"name":"ทำเล็บเท้า เจล","price":400,"duration_min":75},
       {"name":"ต่อเล็บ","price":600,"duration_min":90}]'::jsonb,
     '[{"code":"staff","name":"ช่างทำเล็บ","is_human":true},
       {"code":"table","name":"โต๊ะทำเล็บ","is_human":false}]'::jsonb),
    ('hair', 'ร้านทำผม',
     '[{"name":"สระ+ตัด","price":250,"duration_min":45},
       {"name":"ย้อมสีผม","price":1200,"duration_min":150},
       {"name":"ดัดผม","price":1500,"duration_min":180}]'::jsonb,
     '[{"code":"staff","name":"ช่างผม","is_human":true},
       {"code":"chair","name":"เก้าอี้ทำผม","is_human":false}]'::jsonb),
    ('massage', 'ร้านนวด',
     '[{"name":"นวดไทย 60 นาที","price":300,"duration_min":60},
       {"name":"นวดน้ำมัน 90 นาที","price":600,"duration_min":90},
       {"name":"นวดเท้า 45 นาที","price":250,"duration_min":45}]'::jsonb,
     '[{"code":"staff","name":"หมอนวด","is_human":true},
       {"code":"bed","name":"เตียงนวด","is_human":false}]'::jsonb),
    ('other', 'อื่นๆ (เริ่มจากว่างเปล่า)', '[]'::jsonb, '[]'::jsonb);
