# CLAUDE.md

ระบบจองคิว + สะสมแต้ม แบบ multi-tenant สำหรับร้านบริการในไทย
(ร้านเล็บ / ร้านผม / ร้านนวด / คลินิก / สปา)

ผู้พัฒนา: dev คนเดียว — ทุกการตัดสินใจต้องเลือกทางที่ **คนเดียวดูแลได้**

---

## Stack

- Next.js (App Router) + TypeScript strict
- PostgreSQL + Drizzle ORM
- Tailwind + shadcn/ui
- LINE LIFF (ลูกค้าจอง) + LINE Messaging API (แจ้งเตือน)
- Luxon สำหรับเวลา
- Vitest (unit) + Playwright (e2e)

---

## เอกสารอ้างอิง — อ่านก่อนแตะโค้ด

- `docs/schema.sql` — โครงสร้างฐานข้อมูลฉบับสมบูรณ์
- `docs/logic.md` — อัลกอริทึม availability + ระบบแต้ม
- `docs/roadmap.md` — ลำดับงานแต่ละ phase

ถ้าคำขอของ user ขัดกับเอกสารเหล่านี้ → **ถามก่อน อย่าเดา**

---

## กฎเหล็ก (ห้ามละเมิดเด็ดขาด)

### 1. การกันจองซ้อน
ใช้ `EXCLUDE USING gist` บนตาราง `resource_allocation` เท่านั้น
- ❌ ห้ามเขียน `SELECT ... WHERE NOT EXISTS` แล้วค่อย `INSERT`
- ❌ ห้ามใช้ application-level lock หรือ mutex
- ✅ ให้ INSERT ตรงๆ แล้วจับ error code `23P01`

### 2. ระบบแต้ม
- `point_ledger` เป็น **append-only** — ห้าม `UPDATE` ห้าม `DELETE` ทุกกรณี
- ให้แต้มเมื่อ `booking.status = 'completed'` เท่านั้น ห้ามให้ตอนจอง
- ยอดที่จ่ายด้วยแต้ม (`point_discount`) **ไม่นับเป็นฐานคำนวณแต้มใหม่**
- ใช้แต้มต้องหักแบบ FIFO จาก `point_lot` เรียงตาม `expires_at NULLS LAST, earned_at`
- ทุกการหักแต้มต้องอยู่ใน transaction เดียวกับ `SELECT ... FOR UPDATE`
- `customer.point_balance` ต้องเท่ากับ `SUM(point_lot.points_remaining)` เสมอ

### 3. Multi-tenant
- ทุกตารางที่เกี่ยวกับข้อมูลร้านต้องมี `tenant_id`
- ทุก query ต้อง `SET LOCAL app.tenant_id` ก่อน (RLS)
- ❌ ห้ามเขียน query ที่ไม่มีเงื่อนไข tenant แม้แต่ครั้งเดียว
- เขียน helper `withTenant(tenantId, fn)` แล้วบังคับให้ทุก data access ผ่านตัวนี้

### 4. เวลา
- เก็บใน DB เป็น `timestamptz` (UTC) เสมอ
- แสดงผลตาม `tenant.timezone`
- ❌ ห้ามใช้ `new Date()` ดิบในการคำนวณเวลาธุรกิจ — ใช้ Luxon
- `business_hour` เก็บเป็น `time` ต้องแปลงเป็น absolute time ตาม timezone ของร้านก่อนใช้

### 5. เงิน
- ใช้ `numeric(10,2)` ใน DB
- ในโค้ดคำนวณเป็น **สตางค์ (integer)** ห้ามใช้ float
- ระบบไม่ถือเงินแทนร้าน — เงินวิ่งเข้าบัญชีร้านโดยตรง เราแค่บันทึกและตรวจสลิป

### 6. LINE
- ห้ามยิง LINE API ตรงจาก HTTP request handler
- ทุกข้อความต้องผ่าน `notification_queue` แล้วให้ worker ส่ง
- ต้องมี `dedupe_key` ทุกครั้ง
- แต่ละ tenant ใช้ LINE OA ของตัวเอง → channel token เก็บแบบเข้ารหัส
- ใช้ reply message แทน push ทุกครั้งที่ทำได้ (push นับโควตา, reply ฟรี)

---

## รูปแบบโค้ดที่ต้องการ

- Server Component เป็นค่าเริ่มต้น ใช้ `'use client'` เฉพาะที่จำเป็น
- Business logic อยู่ใน `lib/` ห้ามฝังใน route handler หรือ component
- Validation ด้วย Zod ที่ boundary ทุกจุด (form, API, webhook)
- ตั้งชื่อไฟล์ kebab-case, ตัวแปร camelCase, ตาราง/คอลัมน์ snake_case
- Error message ที่ผู้ใช้เห็นเป็นภาษาไทย, comment และ log เป็นอังกฤษ

---

## โครงสร้างโฟลเดอร์

```
app/
  (booking)/[tenantSlug]/     # หน้าจองสำหรับลูกค้า (LIFF)
  (admin)/dashboard/          # หลังบ้านร้าน
  api/
    webhooks/line/
    cron/
lib/
  availability/    # ★ หัวใจ — อัลกอริทึมหาช่วงว่าง
  booking/
  loyalty/         # ★ หัวใจ — แต้ม lot + ledger
  line/
  db/              # drizzle schema + migrations
  time/            # helper timezone ทั้งหมดรวมที่นี่
components/
docs/
tests/
```

---

## การทดสอบ

ต้องมี unit test คลุม 2 ส่วนนี้เสมอ ก่อน merge:
1. `lib/availability/` — โดยเฉพาะ segment active/passive, buffer, ข้ามวัน, ช่างลา
2. `lib/loyalty/` — FIFO, หมดอายุ, ยกเลิก, กดซ้ำ, ใช้แต้มพร้อมกัน 2 หน้าจอ

เขียน test **ก่อน** implement สำหรับสองโฟลเดอร์นี้

---

## สิ่งที่ห้ามทำ

- ห้ามเพิ่ม dependency ใหม่โดยไม่ถาม
- ห้ามแนะนำ Kubernetes / microservices / GraphQL / Kafka
- ห้ามทำ soft delete โดยไม่ถาม (ใช้ status column แทน)
- ห้าม migration ที่ลบคอลัมน์โดยไม่มี backup step
- ห้ามเขียน component เกิน 200 บรรทัด — แตกออก
- ห้ามใส่ business logic ลงใน DB trigger (ยกเว้น audit log)

---

## เมื่อไม่แน่ใจ

ถามก่อนเสมอ โดยเฉพาะเรื่อง:
- โครงสร้างข้อมูลที่ต้องแก้ schema
- อะไรก็ตามที่เกี่ยวกับเงินหรือแต้ม
- อะไรก็ตามที่ส่งข้อความหาลูกค้าจริง
