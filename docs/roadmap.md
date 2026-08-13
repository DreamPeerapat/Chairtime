# Roadmap

เกณฑ์: **Phase 1–4 = MVP ที่ขายได้จริง** อย่ารอครบทุก phase ก่อนหาลูกค้า

---

## Phase 0 — Setup (2–3 วัน)

- [ ] `create-next-app` + TypeScript strict + Tailwind + shadcn/ui
- [ ] ตั้ง Postgres (local Docker + Neon/Supabase สำหรับ staging)
- [ ] Drizzle + แปลง `docs/schema.sql` เป็น schema ทั้งหมด **ครบทุกตาราง**
      (แม้ Phase 5–7 ยังไม่ใช้ — สร้างไว้ก่อน)
- [ ] เปิด extension `pgcrypto` + `btree_gist`
- [ ] Seed script: 3 ร้านตัวอย่าง (เล็บ / ผม / นวด) ข้อมูลต่างกันจริง
- [ ] Vitest + Playwright + CI (GitHub Actions)

**Definition of done:** `pnpm test` และ `pnpm build` ผ่าน, seed แล้ว query ได้

---

## Phase 1 — Core booking engine (3 สัปดาห์)

- [ ] `lib/time/` — helper timezone ทั้งหมด (แปลง business_hour → absolute)
- [ ] `lib/availability/` — อัลกอริทึมตาม `docs/logic.md` ข้อ 1
  - [ ] เขียน test ก่อน: 15+ เคส (ช่างลา, พักเที่ยง, buffer, หลายบริการต่อกัน)
  - [ ] รองรับ segment active/passive ตั้งแต่แรก
- [ ] `lib/booking/create.ts` — transaction + จับ error `23P01`
- [ ] `lib/booking/cancel.ts` — release allocation
- [ ] REST API: `GET /api/availability`, `POST /api/bookings`
- [ ] Playwright: จองพร้อมกัน 2 request ต้องสำเร็จแค่ 1

**Definition of done:** ยิง 50 request พร้อมกันที่ slot เดียว → สำเร็จ 1 ล้มเหลว 49

---

## Phase 2 — LINE (2 สัปดาห์)

- [ ] LINE Login + LIFF เข้าหน้าจอง
- [ ] หน้าจองสำหรับลูกค้า: เลือกบริการ → เลือกช่าง (ถ้าเปิด) → เลือกเวลา → ยืนยัน
- [ ] `notification_queue` + worker (QStash หรือ cron ทุก 1 นาที)
- [ ] Flex Message: ยืนยันการจอง / เตือน 24h / เตือน 2h
- [ ] Webhook รับข้อความ: พิมพ์ "คิวของฉัน" → ตอบด้วย reply message (ฟรี)
- [ ] ปุ่มยกเลิก/เลื่อนคิวใน Flex Message

> หมายเหตุ: ช่วงนี้ยังไม่มีหน้า wizard ให้ร้านเชื่อม LINE OA เอง (มาใน Phase 2.5)
> ทดสอบด้วย token ของ LINE OA ทดสอบที่ใส่ตรงลง `tenant_line_oa` ผ่าน seed script
> ก่อน — โค้ดที่เขียนใน Phase 2 ต้องอ่าน token จากตารางนี้เสมอ (ไม่ hardcode
> ใน env) เพื่อให้ต่อกับ wizard ของ Phase 2.5 ได้ทันทีโดยไม่ต้องแก้โค้ด

**Definition of done:** จองจริงบนมือถือ แล้วได้รับ reminder ตรงเวลา

---

## Phase 2.5 — Self-serve signup (1.5 สัปดาห์)

★ ตัวนี้คือสิ่งที่ทำให้ระบบเป็น "loop" ที่สมบูรณ์ — ไม่มีขั้นตอนไหนรอแอดมิน

- [ ] `auth_identity`, `staff_user`, `staff_auth_identity`, `staff_tenant`,
      `subscription_plan`, `business_type_template` — สร้างครบตาม schema.sql
- [ ] LINE Login OAuth
- [ ] Google OAuth
- [ ] `/auth/callback` ตาม `docs/logic.md` ข้อ 1.5
- [ ] หน้าเลือกแพ็กเกจ + ประเภทธุรกิจ
- [ ] `copy_business_template()` — copy service + resource_type จาก template
- [ ] หน้าชำระเงิน (แพ็กเกจเสียเงิน) — แนบสลิปธรรมดาไปก่อน ยังไม่ต้อง SlipOK
- [ ] Onboarding wizard: ชื่อร้าน, เวลาทำการ, แก้ราคาจาก template
- [ ] **เชื่อมต่อ LINE OA ของร้าน** (manual wizard ตาม `docs/logic.md` ข้อ 1.6)
  - [ ] `tenant_line_oa` table + เข้ารหัส token/secret ก่อนเก็บ
  - [ ] หน้า checklist 4 step พร้อมภาพประกอบทุกขั้น
  - [ ] generate webhook URL เฉพาะร้าน (`/api/webhooks/line/{tenant_slug}`)
  - [ ] ปุ่ม "ทดสอบเชื่อมต่อ" ที่ยิง LINE API จริงและโชว์ error ภาษาไทย
  - [ ] แสดง QR code ของ OA หลังเชื่อมสำเร็จ ให้ร้านเอาไปติดหน้าร้าน
- [ ] Middleware บังคับ `onboarded_at IS NOT NULL` ก่อนเข้า dashboard
- [ ] หน้า `/select-store` (คนเดียวมีหลายร้าน)
- [ ] cron: trial หมดอายุ → `status = 'suspended'`

**Definition of done เพิ่มเติม (LINE OA):** ร้านทดสอบเชื่อม LINE OA ด้วยตัวเอง
ตั้งแต่ศูนย์ ไม่มีปุ่มไหนที่ error โดยไม่บอกสาเหตุเป็นภาษาไทย

**Definition of done:** สมัครใหม่ทั้งหมดด้วยตัวเองตั้งแต่ landing page จนเห็น
ปฏิทินร้านตัวเอง โดยไม่มีใครแตะ database ให้เลยแม้แต่ครั้งเดียว

---

## Phase 3 — หลังบ้านร้าน (3 สัปดาห์)

เรียงตามความถี่การใช้งานจริง:

- [ ] **ปฏิทินวันนี้** (ใช้ 90% ของเวลา) — FullCalendar resource timeline
  - [ ] ลาก-วางเพื่อเลื่อนคิว
  - [ ] กดสร้าง walk-in ได้เร็ว
  - [ ] เปลี่ยนสถานะ: มาแล้ว / กำลังทำ / เสร็จ / ไม่มา
- [ ] จัดการบริการ: เพิ่ม/แก้ราคา/แก้เวลา/buffer
- [ ] จัดการช่างและ resource + เวลาทำงานรายคน
- [ ] วันลา / ปิดร้านชั่วคราว
- [ ] จัดการสิทธิ์ (owner / manager / staff) — auth (login) ทำไปแล้วใน Phase 2.5
      ตรงนี้คือ invite พนักงานเข้าร้าน + กำหนด role ผ่าน `staff_tenant`
- [ ] Template ตามประเภทร้าน — ใช้ระบบเดียวกับ Phase 2.5 แต่เพิ่มปุ่ม
      "รีเซ็ตกลับไปใช้ template" ในหลังบ้าน เผื่อร้านอยากเริ่มใหม่

**Definition of done:** ตั้งค่าร้านใหม่จากศูนย์ได้ใน 15 นาทีโดยไม่แตะ DB

---

## Phase 4 — ลูกค้า (1 สัปดาห์)

- [ ] รายชื่อลูกค้า + ค้นหาด้วยชื่อ/เบอร์
- [ ] ประวัติการมา + โน้ต (แพ้อะไร ชอบช่างไหน)
- [ ] merge ลูกค้าซ้ำ (เบอร์เดียวกัน)
- [ ] นับ no-show

**🎯 ถึงตรงนี้ = MVP พร้อมขาย หยุดเขียนโค้ด ไปหาลูกค้า 10 ราย**

---

## Phase 5 — แต้ม (2 สัปดาห์)

- [ ] `lib/loyalty/earn.ts` — สร้าง lot + ledger, idempotent
- [ ] `lib/loyalty/redeem.ts` — FIFO + `FOR UPDATE`
- [ ] `lib/loyalty/expire.ts` — cron รายวัน
- [ ] `lib/loyalty/reconcile.ts` — ตรวจ balance vs lot vs ledger รายวัน + alert
- [ ] หน้าดูแต้มใน LIFF
- [ ] ตั้งค่ากติกาแต้มในหลังบ้าน
- [ ] แจ้งเตือนแต้มใกล้หมดอายุ (ล่วงหน้า 30 วัน)

**Test ที่ห้ามขาด:** กดปุ่ม "เสร็จงาน" 2 ครั้ง → แต้มขึ้นครั้งเดียว

---

## Phase 6 — Tier + Reward (2 สัปดาห์)

- [ ] cron คำนวณ tier + grace period 30 วัน
- [ ] แคตตาล็อกของรางวัล + แลกแต้ม
- [ ] โค้ดแลกรางวัลให้พนักงานสแกน
- [ ] แจ้งเตือนเลื่อนขั้น + โบนัสวันเกิด

---

## Phase 7 — Package ตัดครั้ง (1 สัปดาห์)

- [ ] ขายแพ็กเกจ + ตัดครั้งตอนจบงาน
- [ ] แจ้งเตือนใกล้หมด / ใกล้หมดอายุ

---

## Phase 8 — ขัดเงา (3 สัปดาห์)

- [ ] มัดจำ + QR PromptPay + ตรวจสลิป
- [ ] รายงาน: ยอดขาย, ช่างคนไหนทำได้เท่าไหร่, อัตรา no-show, ลูกค้าหาย
- [ ] Subscription billing ของตัวคุณเอง (เก็บเงินร้าน)
- [ ] หน้า landing แยกตามวงการ (SEO)
- [ ] Sentry + uptime monitor + backup อัตโนมัติ

---

## Milestone ในอนาคต (ไม่ผูกกับ Phase เวลา — ทำเมื่อเงื่อนไขพร้อม)

**LINE Developer Partner Program — เปลี่ยนจาก manual wizard เป็นปุ่มเดียว**

เงื่อนไขก่อนสมัคร (อย่าเพิ่งสมัครถ้ายังไม่ครบ):
- [ ] มีร้านที่เชื่อม LINE OA แบบ manual สำเร็จแล้วอย่างน้อย 15 ร้าน (ใช้เป็นผลงานอ้างอิง)
- [ ] เก็บ metric ว่าร้านหลุดตรง step ไหนบ่อยสุดจาก `tenant_line_oa` (step_oa_created,
      step_api_enabled, step_token_saved, step_webhook_verified) — ถ้ามี pattern ชัดเจน
      ว่าคนหลุดเยอะ นี่คือหลักฐานสนับสนุนว่าทำไมต้องอัปเกรด

เมื่อได้รับอนุมัติ:
- [ ] implement OAuth consent flow ใหม่ (`connection_method = 'partner_oauth'`)
- [ ] ร้านเดิมที่เชื่อมแบบ manual ไว้แล้ว **ไม่ต้องทำอะไรซ้ำ** — schema รองรับ
      สองวิธีพร้อมกันอยู่แล้ว
- [ ] เสนอปุ่ม "อัปเกรดการเชื่อมต่อ" ให้ร้านเก่าเปลี่ยนได้ถ้าอยากได้ประสบการณ์ที่ง่ายขึ้น

---

## Metric ที่ต้องดูตั้งแต่วันแรก

| ตัวเลข | เป้า |
|---|---|
| เวลา query availability | < 300ms |
| อัตรา no-show ของร้านลูกค้า | ลดลง ≥ 30% |
| เวลา onboard ร้านใหม่ | < 30 นาที |
| ร้านที่ใช้ต่อหลัง 30 วัน | > 80% |
