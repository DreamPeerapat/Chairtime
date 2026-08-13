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
