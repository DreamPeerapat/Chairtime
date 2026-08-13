# Logic การทำงาน — ระบบจองคิว + สะสมแต้ม

---

## 1. อัลกอริทึมหาช่วงเวลาว่าง (ยากที่สุดของระบบ)

### Input
```
tenant_id, date, service_ids[], preferred_resource_id?
```

### ขั้นตอน

**Step 1 — สร้างกรอบเวลาที่ร้านเปิด**
```
open_windows = business_hour(tenant, weekday)
             - time_off(tenant, resource_id IS NULL)
```

**Step 2 — คำนวณ timeline ของบริการที่ลูกค้าเลือก**

แตก service ออกเป็น segment แล้วต่อกันเป็นเส้นเวลา พร้อม buffer

```
ตัวอย่าง: สระ+ตัด (60 นาที) แล้วต่อด้วย ย้อม (90 นาที)

t=0    ├─ buffer_before 5 ────────────
t=5    ├─ [สระ+ตัด] active 60 ────────  ต้องใช้: ช่าง + เก้าอี้
t=65   ├─ buffer_after 5 ─────────────
t=70   ├─ [ย้อม seg1] active 30 ──────  ต้องใช้: ช่าง + เก้าอี้
t=100  ├─ [ย้อม seg2] passive 40 ─────  ต้องใช้: เก้าอี้ อย่างเดียว ← ช่างว่าง!
t=140  ├─ [ย้อม seg3] active 20 ──────  ต้องใช้: ช่าง + เก้าอี้
t=160  └─ buffer_after 10
รวม 170 นาที  |  ช่างถูกใช้จริง 110 นาที
```

**Step 3 — ดึงช่วงเวลาที่ไม่ว่างของทุก resource**
```sql
SELECT resource_id, period
FROM resource_allocation
WHERE tenant_id = $1
  AND is_released = false
  AND period && tstzrange($day_start, $day_end)
UNION ALL
SELECT resource_id, period FROM time_off WHERE ...
```

**Step 4 — ไล่ทีละ candidate slot**

เดินทีละ `slot_granularity_min` (ปกติ 15 นาที) จากเวลาเปิดถึงเวลาปิด
สำหรับแต่ละ slot ตรวจ:

```
สำหรับทุก requirement ของทุก segment:
    ถ้า hold_scope = 'active_only'  → เช็คเฉพาะช่วง active
    ถ้า hold_scope = 'whole'        → เช็คตั้งแต่ต้นจนจบรวม passive

    หา resource ว่างที่:
      - เป็น resource_type ที่ต้องการ
      - มี skill ทำบริการนี้ได้ (ถ้าเป็นคน)
      - ไม่ชนกับ allocation อื่น
      - อยู่ในเวลาทำงานของตัวเอง

    ถ้าหาได้ครบทุก requirement → slot นี้ใช้ได้
```

**Step 5 — กรองด้วยนโยบาย**
```
ตัดออกถ้า:  slot < now + min_lead_time
            slot > now + max_advance_days (+ priority ของ tier)
```

### ข้อควรระวังด้าน performance
- คำนวณทั้งเดือนพร้อมกันจะช้า → คิดทีละ 7 วัน แล้ว cache ไว้ 60 วินาที
- invalidate cache ทันทีเมื่อมี booking ใหม่ในช่วงนั้น
- ถ้าร้านมี resource เกิน ~20 ตัว ให้ pre-compute เป็น bitmap รายวัน

---

## 1.5 Self-serve signup (OAuth) — ทำให้ระบบเป็น loop สมบูรณ์

**หลักการ:** ไม่มีขั้นตอนไหนต้องรอแอดมิน ตั้งแต่เจอเว็บจนใช้งานหลังบ้านได้จริง

### Journey

```
เจอเว็บ → Login LINE หรือ Google → เลือกแพ็กเกจ + ประเภทธุรกิจ
        → (ถ้าจ่ายเงิน → หน้าชำระเงิน) → สร้าง tenant อัตโนมัติ
        → onboarding wizard สั้นๆ → เข้าใช้งานหลังบ้าน
```

**ข้อควรรู้:** LINE Login (คนสมัคร login เข้าเว็บ) กับ LINE OA ของร้าน (ใช้ส่ง
reminder ให้ลูกค้าร้านนั้น) เป็นคนละเรื่องกัน อย่าสับสน — LINE OA ผูกกับ
tenant ทีหลังในหน้า settings ไม่เกี่ยวกับตอน signup

### Callback logic

```
GET /auth/callback?provider=line|google

  1. แลก code กับ provider → ได้ { provider_uid, email, display_name, avatar_url }

  2. SELECT auth_identity WHERE provider = $1 AND provider_uid = $2

     กรณีเจอ (เคย login มาก่อน):
       → หา staff_user ผ่าน staff_auth_identity
       → SELECT staff_tenant ของ staff คนนี้
           - 0 tenant  → redirect /onboarding/plan   (สมัครค้างไว้ ยังไม่เลือกแพ็กเกจ)
           - 1 tenant  → set session, redirect /dashboard
           - >1 tenant → redirect /select-store

     กรณีไม่เจอ (คนใหม่):
       → INSERT auth_identity
       → INSERT staff_user
       → INSERT staff_auth_identity
       → redirect /onboarding/plan
```

### สร้าง tenant

```
POST /onboarding/plan
  body: { plan_code, business_type }

  plan = SELECT subscription_plan WHERE code = plan_code

  BEGIN;
    slug = generate_unique_slug(business_name)   -- ชนกันเติมเลขต่อท้าย

    ถ้า plan.trial_days > 0 (แพ็กเกจ trial):
        INSERT tenant (slug, business_type, plan_id, status='active',
                        trial_ends_at = now() + plan.trial_days || ' days')
        INSERT staff_tenant (role='owner')
        copy_business_template(tenant.id, business_type)
        INSERT tenant_booking_policy (ค่า default)
        COMMIT
        redirect /onboarding/setup     -- เข้าใช้งานได้เลย ไม่ต้องจ่ายก่อน

    ถ้าเลือกแพ็กเกจเสียเงิน:
        INSERT tenant (slug, business_type, plan_id, status='pending_payment')
        INSERT staff_tenant (role='owner')
        COMMIT
        redirect /onboarding/payment   -- ต้องจ่ายก่อนถึงจะ active
```

```
copy_business_template(tenant_id, business_type):
  template = SELECT business_type_template WHERE business_type = $1

  สำหรับแต่ละ resource_type ใน template.resource_types_json:
      INSERT resource_type (tenant_id, code, name, is_human)

  สำหรับแต่ละ service ใน template.services_json:
      INSERT service (tenant_id, name, base_price, ...)
  -- เจ้าของร้านแค่แก้ราคา/ชื่อ ไม่ต้องพิมพ์บริการเองตั้งแต่ศูนย์
```

### ยืนยันชำระเงิน (แพ็กเกจเสียเงิน)

```
POST /onboarding/payment
  -- แนบสลิป → ยิงตรวจผ่าน SlipOK/Slip2Go
  -- ถ้าผ่าน:
       UPDATE tenant SET status = 'active'
       copy_business_template(...)
       INSERT tenant_booking_policy (ค่า default)
       redirect /onboarding/setup

  -- ถ้าเลือกจ่ายบัตรผ่าน gateway:
       webhook ยืนยันสำเร็จ → ทำแบบเดียวกัน
```

### จุดที่ต้องระวัง

- **Slug ชนกัน** — เติม `-2`, `-3` อัตโนมัติ ห้ามให้ signup fail เพราะชื่อซ้ำ
- **Trial ไม่ผูกบัตรตั้งแต่แรก** — ขอจ่ายตอนใกล้หมดอายุ (conversion สูงกว่า)
- **Trial หมดอายุ** — cron รายวัน: `tenant.trial_ends_at < now() AND status='active' AND plan.code='trial'` → `UPDATE status='suspended'`
- **เชื่อมหลาย identity เข้า staff_user เดียว** — ถ้าคนเดิม login คนละ provider
  ระบบจะมองเป็นคนละคน ต้องมีปุ่ม "เชื่อมบัญชี" ในหน้า settings ที่ต้อง
  ยืนยันตัวตนทั้งสอง provider ก่อนเชื่อม ห้าม auto-merge จาก email เฉยๆ
  (email ปลอมแปลงหรือเปลี่ยนมือได้)
- **onboarded_at ยัง NULL** — ถ้า login เข้ามาแล้วยังไม่ผ่าน wizard ให้บังคับ
  redirect กลับไป `/onboarding/setup` ก่อนเข้า dashboard เสมอ

---

## 1.6 เชื่อมต่อ LINE OA ของร้าน — Manual wizard (วิธีที่ 2)

**หลักการ:** ร้านต้องไปทำ 2-3 ขั้นตอนในเว็บของ LINE เอง (เราควบคุมไม่ได้)
แต่เราทำให้ไม่หลงทางด้วย checklist + ภาพประกอบ + ทดสอบผลทันทีทุกขั้น

**เตรียมไว้ล่วงหน้า (ทำครั้งเดียว ไม่ใช่ต่อร้าน):**
สร้าง LINE Business ID ของบริษัทตัวเองไว้เป็น "Provider" กลาง
ถ้าร้านผูก Channel ใหม่เข้า Provider นี้ได้ จะลดขั้นตอนของร้านลง 1 ขั้น
(ไม่บังคับ ร้านสร้าง Provider ของตัวเองก็ได้เช่นกัน)

### ขั้นตอนที่ร้านเห็นในหน้า settings → เชื่อมต่อ LINE

```
Step 1: สร้าง LINE OA (ถ้ายังไม่มี)
   → ลิงก์ตรงไป https://manager.line.biz/ พร้อมภาพประกอบ
   → ปุ่ม "ทำแล้ว ถัดไป" → UPDATE tenant_line_oa SET step_oa_created = true

Step 2: เปิด Messaging API
   → ภาพ: Settings → Messaging API → Enable Messaging API → เลือก/สร้าง Provider
   → ปุ่ม "ทำแล้ว ถัดไป" → step_api_enabled = true

Step 3: คัดลอก Token + Secret มาวาง
   → ฟอร์ม 2 ช่อง: Channel Access Token, Channel Secret
   → ระบบ generate webhook_url เฉพาะร้านนี้ให้ทันที
     (รูปแบบ: https://yourapp.com/api/webhooks/line/{tenant_slug})
   → แสดงคำสั่ง "คัดลอก URL นี้ไปวางใน LINE Developers Console
     ช่อง Webhook URL แล้วเปิด Use webhook = ON"
   → กด "บันทึก" → เข้ารหัส token/secret ก่อน UPDATE tenant_line_oa
     SET channel_access_token = encrypt(...), channel_secret = encrypt(...),
         webhook_url = ..., step_token_saved = true

Step 4: ทดสอบเชื่อมต่อ
   → กดปุ่ม "ทดสอบ" → เรียก LINE API (getBotInfo หรือส่ง broadcast ทดสอบ
     ไปหาแอดมินร้านเอง) ด้วย token ที่บันทึกไว้
   → สำเร็จ:
       UPDATE tenant_line_oa SET is_verified = true, connected_at = now(),
                                   step_webhook_verified = true
       → โชว์ QR code ของ OA ให้ร้านเอาไปติดหน้าร้าน
   → ล้มเหลว:
       UPDATE tenant_line_oa SET last_error = <ข้อความจาก LINE API>
       → โชว์ error เป็นภาษาไทยเข้าใจง่าย พร้อมปุ่ม "ลองใหม่"
       → เก็บ last_error ไว้ debug ด้วย
```

### ความสำคัญของ checklist state

เก็บ `step_oa_created`, `step_api_enabled`, `step_token_saved`,
`step_webhook_verified` แยกกัน (ไม่ใช่ boolean เดียว) เพราะ:
- ร้านอาจปิดหน้าเว็บกลางทาง แล้วกลับมาทำต่อได้ตรงจุดที่ค้างไว้
- ใช้เป็น metric ดูว่าร้านส่วนใหญ่หลุดตรงขั้นไหน (ถ้าหลุดที่ step 2 บ่อย
  แปลว่าภาพประกอบขั้นนั้นต้องปรับปรุง)

### สิ่งที่ต้องมี ไม่ใช่ทางเลือก

- **เข้ารหัส token/secret ก่อนเก็บเสมอ** — ใช้ `pgcrypto` หรือส่งผ่าน secret
  manager ห้าม plaintext ใน DB เด็ดขาด (ดู CLAUDE.md กฎเหล็ก)
- **ปุ่ม "ทดสอบ" ต้องเรียก LINE API จริงทันที** ไม่ใช่แค่เช็ครูปแบบ token
  ว่าง่ายพอ เพราะ token ผิดรูปแบบไม่ error แต่ token ผิดค่าจะ error ตอนยิงจริง
- **แนะนำให้ร้านปิด Auto-reply ของ LINE OA Manager** ในขั้นตอน เพราะจะชน
  กับข้อความที่ระบบเราส่งเอง — ใส่คำเตือนนี้ไว้ใน Step 2

### เตรียมไว้สำหรับอนาคต (connection_method = 'partner_oauth')

Column `connection_method` ใน `tenant_line_oa` มีไว้ล่วงหน้าเพื่อวันที่ได้
LINE Developer Partner Program แล้ว จะเพิ่ม flow ใหม่ (ผู้ใช้กดปุ่มเดียว
→ OAuth consent → ระบบดึง token ให้อัตโนมัติ) โดยไม่ต้องรื้อ schema เดิม
ร้านเก่าที่เชื่อมแบบ manual ไว้แล้วไม่ต้องทำอะไรซ้ำ

---

## 2. การจองจริง (กัน race condition)

**ห้ามเชื่อผลจาก Step 4** — ระหว่างที่ลูกค้ากรอกฟอร์ม อาจมีคนอื่นจองไปแล้ว

```
BEGIN;
  SET LOCAL app.tenant_id = '<uuid>';

  INSERT INTO booking (...) RETURNING id;
  INSERT INTO booking_item (...) RETURNING id;

  -- ตัวนี้จะ throw exclusion_violation ถ้าชน
  INSERT INTO resource_allocation (resource_id, period, ...) VALUES (...);

COMMIT;
```

จับ error `23P01` (exclusion_violation) แล้วตอบกลับว่า
"ช่วงเวลานี้เพิ่งถูกจองไป กรุณาเลือกเวลาใหม่" — **ไม่ต้อง retry อัตโนมัติ**
เพราะลูกค้าควรได้เห็นตัวเลือกใหม่ก่อนตัดสินใจ

> จุดสำคัญ: ปล่อยให้ฐานข้อมูลเป็นคนตัดสิน ไม่ใช่ application logic
> การใช้ `SELECT ... WHERE NOT EXISTS` แล้วค่อย INSERT จะพลาดเสมอเมื่อมี concurrent request

---

## 3. Logic ระบบแต้ม

### 3.1 การได้แต้ม — ทำตอน `completed` เท่านั้น

**ห้ามให้แต้มตอนจอง** เพราะลูกค้าอาจไม่มา

```
เมื่อ booking.status → 'completed':

  1. base = total - point_discount        (ส่วนที่จ่ายเงินจริง)
     ※ ยอดที่จ่ายด้วยแต้ม ไม่ควรได้แต้มอีก ไม่งั้นวนลูปสร้างแต้มเอง

  2. raw_points = base / rule.baht_per_point
     points = apply_rounding(raw_points, rule.rounding)

  3. tier = customer_tier(customer)
     points = floor(points × tier.point_multiplier)

  4. service ที่ point_earn_mode = 'none' → หักยอดออกก่อนคำนวณ

  5. INSERT point_lot (
        points_total     = points,
        points_remaining = points,
        expires_at       = now() + rule.expiry_months
     )
     INSERT point_ledger (entry_type='earn', source_id=booking.id)
        ← unique index กันซ้ำให้อัตโนมัติ

  6. UPDATE customer SET point_balance = point_balance + points,
                         lifetime_points = ...,
                         lifetime_spend  = ...,
                         visit_count     = visit_count + 1
```

### 3.2 การใช้แต้ม — FIFO ตามวันหมดอายุ

```
redeem(customer, points_wanted):

  ตรวจก่อน:
    points_wanted >= rule.min_redeem_points
    points_wanted × point_value_baht <= bill × max_redeem_percent / 100
    points_wanted <= customer.point_balance

  BEGIN;
    -- lock เพื่อกันใช้แต้มซ้ำจาก 2 หน้าจอพร้อมกัน
    SELECT * FROM point_lot
    WHERE customer_id = $1
      AND points_remaining > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY expires_at NULLS LAST, earned_at
    FOR UPDATE;

    remaining = points_wanted
    for lot in lots:
        take = min(lot.points_remaining, remaining)
        UPDATE point_lot SET points_remaining -= take WHERE id = lot.id
        INSERT point_ledger (entry_type='redeem', points = -take, lot_id = lot.id)
        remaining -= take
        if remaining == 0: break

    if remaining > 0: ROLLBACK  -- แต้มไม่พอ (balance ไม่ตรง lot = มีบั๊ก)

    UPDATE customer SET point_balance = point_balance - points_wanted;
  COMMIT;
```

**ทำไมต้อง FIFO ตามวันหมดอายุ?** เพื่อให้ลูกค้าได้ใช้แต้มที่ใกล้หมดก่อน — เป็นธรรมกับลูกค้าและลดข้อร้องเรียน

### 3.3 การยกเลิก / คืนแต้ม

```
ยกเลิกหลังได้แต้มไปแล้ว (เช่น ลูกค้าขอคืนเงิน):
  INSERT point_ledger (entry_type='revert', points = -earned)
  UPDATE point_lot SET points_remaining = points_remaining - X
  ※ ถ้าลูกค้าใช้แต้มไปแล้วบางส่วน → ปล่อยให้ balance ติดลบไม่ได้
    ให้บันทึกเป็น adjust และแจ้งแอดมินแทน
```

### 3.4 แต้มหมดอายุ — cron รายวัน

```sql
-- ทำทุกวันตี 2
WITH expired AS (
  UPDATE point_lot
  SET points_remaining = 0
  WHERE points_remaining > 0 AND expires_at <= now()
  RETURNING id, tenant_id, customer_id, points_remaining AS lost
)
INSERT INTO point_ledger (tenant_id, customer_id, entry_type, points, lot_id, source_type)
SELECT tenant_id, customer_id, 'expire', -lost, id, 'system' FROM expired;

-- แล้วค่อย sync customer.point_balance
```

พร้อมส่งแจ้งเตือน LINE ล่วงหน้า **30 วัน** ว่า "แต้ม X กำลังจะหมดอายุ" —
ตัวนี้ดึงลูกค้ากลับมาได้ดีที่สุดในบรรดา notification ทั้งหมด

### 3.5 การเลื่อนขั้น tier — cron รายวัน

```sql
-- คำนวณยอดย้อนหลังตาม qualify_window_months
SELECT c.id,
       SUM(b.total) FILTER (
         WHERE b.completed_at > now() - (t.qualify_window_months || ' months')::interval
       ) AS window_spend
FROM customer c ...
```
- เลื่อนขึ้น → ทำทันที + ส่ง LINE แสดงความยินดี
- ตกชั้น → ให้ grace period 30 วัน + เตือนล่วงหน้า
- `is_manual = true` → ข้ามเสมอ

---

## 4. ตรวจสอบความถูกต้องของแต้ม (ต้องมี)

รัน cron รายวัน — ถ้าไม่ตรงคือมีบั๊ก ต้องรู้ก่อนลูกค้า

```sql
SELECT c.id, c.point_balance,
       COALESCE(SUM(l.points_remaining), 0) AS lot_sum,
       (SELECT SUM(points) FROM point_ledger WHERE customer_id = c.id) AS ledger_sum
FROM customer c
LEFT JOIN point_lot l ON l.customer_id = c.id
GROUP BY c.id
HAVING c.point_balance <> COALESCE(SUM(l.points_remaining), 0);
```

ทั้ง 3 ตัวเลขต้องเท่ากันเสมอ

---

## 5. Notification ที่ควรมี

| Template | เวลาส่ง | หมายเหตุ |
|---|---|---|
| `booking_confirmed` | ทันที | แนบปุ่มเพิ่มลงปฏิทิน |
| `reminder_24h` | ก่อน 24 ชม. | ลด no-show ได้มากที่สุด |
| `reminder_2h` | ก่อน 2 ชม. | |
| `points_earned` | หลังจบงาน | บอกแต้มคงเหลือด้วย |
| `points_expiring` | ก่อนหมด 30 วัน | ดึงลูกค้ากลับได้ดีที่สุด |
| `tier_up` | ทันที | ทำให้รู้สึกพิเศษ |
| `birthday` | 7 วันก่อนวันเกิด | แถมแต้ม + คูปอง |
| `winback` | ไม่มา 60/90 วัน | |

**ทุกตัวต้องผ่าน `notification_queue`** ไม่ส่งตรงจาก HTTP request
เพราะ LINE API ล่มบ่อย และต้อง retry ได้

---

## 6. ลำดับการพัฒนา (สำหรับ dev คนเดียว)

| Phase | สิ่งที่ทำ | เวลาโดยประมาณ |
|---|---|---|
| 1 | tenant, resource, service (segment เดียว), booking, allocation | 3 สัปดาห์ |
| 2 | LINE LIFF จอง + reminder 24h/2h | 2 สัปดาห์ |
| 3 | หลังบ้าน: ปฏิทินวันนี้, แก้ราคา, จัดการช่าง, วันลา | 3 สัปดาห์ |
| 4 | ลูกค้า + ประวัติการมา | 1 สัปดาห์ |
| 5 | **แต้ม** (lot + ledger + earn/redeem) | 2 สัปดาห์ |
| 6 | tier + reward | 2 สัปดาห์ |
| 7 | package ตัดครั้ง | 1 สัปดาห์ |
| 8 | segment active/passive, มัดจำ, รายงาน | 3 สัปดาห์ |

**สร้าง table ทั้งหมดตั้งแต่ Phase 1** แม้ยังไม่ใช้ — การเพิ่ม column ทีหลังง่าย
แต่การรื้อโครงสร้างตอนมีลูกค้า 20 ร้านแล้วคือฝันร้าย

Phase 1–4 คือ MVP ที่ขายได้จริงแล้ว อย่ารอทำครบ 8 phase ก่อนหาลูกค้า
