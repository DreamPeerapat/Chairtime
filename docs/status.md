# บันทึกสถานะ — หยุดพักที่ Phase 4

อัปเดต: 13 สิงหาคม 2026
branch: `claude/project-plan-wl774s`

> ⚠️ **เอกสาร spec ถูกอัปเดตหลังจากเขียนโค้ดไปแล้ว**
> `CLAUDE.md`, `docs/schema.sql`, `docs/logic.md`, `docs/roadmap.md`,
> `docs/prompts.md` เวอร์ชันใหม่เพิ่ม **กฎเหล็กข้อ 7 (OAuth เท่านั้น)**
> และ **Phase 2.5 (self-serve signup)** ซึ่งทำให้ระบบ auth ที่ทำไปแล้ว
> ใช้ไม่ได้ตามกฎใหม่ ดูหัวข้อ "สิ่งที่ spec ใหม่ทำให้ต้องรื้อ" ด้านล่าง
> **สถานะที่เขียนไว้ในเอกสารนี้เป็นสถานะ ณ ก่อนอัปเดต spec**

---

## สรุปสั้น

Phase 0–4 เสร็จแล้ว = **MVP ที่ขายได้** ตามเกณฑ์ใน `docs/roadmap.md`
Phase 5–8 ยังไม่ได้ทำ แต่ **ตารางในฐานข้อมูลสร้างครบแล้วตั้งแต่ Phase 0**

| Phase | สถานะ | หมายเหตุ |
|---|---|---|
| 0 — Setup | ⚠️ | ตารางครบตาม schema **เวอร์ชันเก่า** — ขาด 6 ตารางของ spec ใหม่ |
| 1 — Core booking | ✅ | ผ่านเกณฑ์ 50 request → สำเร็จ 1 · ไม่กระทบจาก spec ใหม่ |
| 2 — LINE | ⚠️ | pipeline ครบ แต่ตารางต้องเปลี่ยนเป็น `tenant_line_oa` |
| 2.5 — Self-serve signup | ❌ | **ใหม่ใน roadmap — ยังไม่ได้ทำเลย** |
| 3 — หลังบ้าน | ⚠️ | ใช้ได้ ยกเว้นส่วน auth ที่ขัดกฎข้อ 7 |
| 4 — ลูกค้า | ✅ | ไม่กระทบ |
| 5 — แต้ม | ⬜ | `lib/loyalty/` ยังว่าง |
| 6 — Tier + Reward | ⬜ | |
| 7 — Package | ⬜ | |
| 8 — ขัดเงา | ⬜ | |

**ผลทดสอบล่าสุด:** 103 unit + 51 integration + 20 e2e = **174 ผ่านหมด**
typecheck / lint / build ผ่านทั้งหมด

---

## ทำอะไรไปบ้าง

### ส่วนที่เป็นหัวใจ

`lib/availability/` — อัลกอริทึมตาม `docs/logic.md` ข้อ 1 ครบทุกขั้น
รองรับ segment active/passive ตั้งแต่แรก (ย้อมผม = ลงสี 30 → รอสีติด 40 → สระ 20
ช่างว่างช่วงกลาง), buffer ก่อน/หลัง, `duration_factor` รายช่าง, เวลาทำงานรายคน,
ร้านเปิดคาบเที่ยงคืน, พักเที่ยง

เขียน **test ก่อน implement** ตามที่ CLAUDE.md บังคับ — ครั้งแรก fail หมด
แล้วค่อยทำให้ผ่าน

`lib/booking/create.ts` — re-plan ก่อน insert เสมอ (ลูกค้ากรอกฟอร์มนาน
สถานะอาจเปลี่ยนไปแล้ว) แล้ว INSERT ตรงๆ ให้ DB ตัดสิน ไม่มี SELECT-แล้ว-INSERT
ไม่มี lock ระดับแอป จับ `23P01` → ตอบภาษาไทย 409 **ไม่ retry อัตโนมัติ**

### ส่วนที่เหลือ

- `lib/time/` — เวลาทั้งหมดผ่าน Luxon ไม่มี `new Date()` ดิบในการคำนวณธุรกิจ
- `lib/notifications/` — คิว + worker (`FOR UPDATE SKIP LOCKED`)
- `lib/line/` — client, Flex message, webhook, สคริปต์ต่อ channel
- `lib/auth/` — scrypt + signed cookie จาก `node:crypto` ไม่เพิ่ม dependency
- `lib/admin/` — read model + server action
- `lib/customer/` — upsert จากเบอร์/LINE, รวมลูกค้าซ้ำ

---

## บั๊กที่เจอระหว่างทาง (เจอด้วย test ทั้งหมด)

บันทึกไว้เพราะทั้ง 4 ตัวเป็นบทเรียนที่จะเจอซ้ำได้

**1. Drizzle ห่อ error ของ driver**
SQLSTATE อยู่ที่ `error.cause` ไม่ใช่ `error.code` — โค้ดเดิมเช็ค `error.code`
ทำให้ `23P01` หลุดไปเป็น 500 ตอนมี concurrency จริง
แก้ด้วย `findSqlState()` ที่ไล่ chain — **ใช้ตัวนี้เสมอ อย่าเช็ค `.code` ตรงๆ**

**2. TRUNCATE ต้องเป็นเจ้าของตาราง**
role แอปไม่มีสิทธิ์ (ตั้งใจ) — seed จึงต้อง truncate ผ่าน connection admin

**3. ล็อกอินไม่ได้เลย เพราะ RLS**
`staff_user` อยู่ใต้ FORCE RLS แต่ตอนล็อกอินยังไม่รู้ว่าร้านไหน → query คืน 0 แถว
แก้ด้วย `staff_login_lookup` (SECURITY DEFINER + pinned search_path) ใน migration 0003
**ห้าม SELECT `staff_user` ตรงๆ นอก `withTenant`**

**4. Walk-in หาเวลาว่างไม่เจอ**
เดิมยกเว้น lead time ด้วยการแกล้งย้อนนาฬิกา 1 ปี ซึ่งดันไปทำให้ทุกวันเลย
horizon 60 วัน → กรองทิ้งหมด แก้เป็น flag `ignorePolicyWindow` ตรงๆ
**บทเรียน: อย่าปลอมนาฬิกาเพื่อเลี่ยงกฎ ให้ใส่ flag ที่บอกเจตนาชัดๆ**

---

## เรื่องที่ตัดสินใจไว้ ควรรู้ก่อนแก้ต่อ

**RLS ต้องใช้ 2 connection**
role แอปต้องไม่ใช่ superuser และไม่มี `BYPASSRLS` ไม่งั้น RLS ถูกข้ามเงียบๆ
ทุกตารางเปิด `FORCE ROW LEVEL SECURITY` — ตรวจได้ด้วย `pnpm db:check`

**`point_ledger` กันด้วย trigger ที่ DB**
เป็นการดัดกฎ "ห้าม business logic ใน trigger" เล็กน้อย แต่ trigger ตัวนี้
ไม่มี logic เลย มีแต่ `RAISE EXCEPTION` — และกฎข้อ 2 เขียนว่า "ห้ามทุกกรณี"
ซึ่งข้อตกลงที่อยู่แค่ในโค้ดไม่ใช่ "ทุกกรณี"

**FullCalendar ใช้ตัวฟรี**
resource timeline เป็น plugin เสียเงิน (~$480/ปี) — ใช้ timeGrid + ชิปกรองช่าง
พร้อมสีประจำตัวแทน ดูช่างหลายคนพร้อมกันได้จากสี ไม่ใช่จากคอลัมน์

**เวลาแสดงผลเป็น พ.ศ. ทั้งระบบ**
`lib/time/thai.ts` เป็นที่เดียว ทั้งหน้าจอและข้อความ LINE ใช้ตัวเดียวกัน
เพื่อไม่ให้หน้ายืนยันบอก 2026 แล้ว LINE บอก 2569

---

## ⚠️ ข้อจำกัดที่ยังค้างอยู่

**1. เวลาทำการรองรับวันละ 1 ช่วง**
หน้า "เวลาทำการ" ตั้งได้วันละช่วงเดียว ร้านที่พักเที่ยง (เช่น The Hair
ในข้อมูลตัวอย่าง เปิด 10:00–13:00 และ 14:00–20:00) ต้องเพิ่มช่วงที่สองผ่าน DB
**อัลกอริทึมรองรับหลายช่วงแล้ว ขาดแค่ UI**

**2. จองพร้อมกันเป๊ะๆ จะเหลือผู้ชนะคนเดียว แม้เก้าอี้ยังว่าง**
first-fit ทำให้ทุก request เลือกช่าง+เก้าอี้ตัวเดียวกัน `docs/logic.md` ข้อ 2
บอกไม่ให้ retry อัตโนมัติ ผมจึงทำตามเป๊ะ แต่เหตุผลที่เอกสารให้คือ
"ลูกค้าควรได้เห็นตัวเลือกใหม่ก่อนตัดสินใจ" — ซึ่งการเปลี่ยนไปเก้าอี้อื่น
*ในเวลาเดิมที่เขาเลือกไว้แล้ว* ไม่ได้เปลี่ยนการตัดสินใจของเขา
**ควรตัดสินใจเรื่องนี้ก่อนร้านที่คนเยอะเริ่มใช้จริง**

**3. LINE ยังไม่ได้ต่อของจริง**
pipeline ครบและ test ด้วย mock แล้ว แต่ยังไม่เคยส่งข้อความจริงสักครั้ง
ข้อความจะค้างในคิวจนกว่าจะใส่ credentials แล้วทยอยส่งเอง

**4. ยังไม่มีหน้าตั้งค่านโยบายการจอง**
`tenant_booking_policy` แก้ได้ผ่าน DB เท่านั้น หน้า settings แสดงค่าอย่างเดียว

**5. `service_segment` แก้ผ่าน UI ไม่ได้**
บริการหลายช่วง (ย้อมผม/กัดสี) แก้เวลาแต่ละช่วงต้องผ่าน DB
หน้าแก้บริการจงใจ disable ช่องเวลาไว้ เพื่อไม่ให้เผลอทำตารางช่างเพี้ยน

---

## ⛔ สิ่งที่ spec ใหม่ทำให้ต้องรื้อ

เอกสารเวอร์ชันใหม่ขัดกับโค้ดที่ merge ไปแล้วใน 3 เรื่องใหญ่

### 1. กฎเหล็กข้อ 7 — ห้ามมี password ในระบบ

> "Auth เป็น **OAuth เท่านั้น** (LINE Login + Google) — ❌ ห้ามมี password ในระบบ"

ระบบ auth ที่ทำไว้ใช้ scrypt + password ทั้งหมด ต้องรื้อ

ไฟล์ที่กระทบ:
`lib/auth/password.ts` (ลบทั้งไฟล์), `lib/auth/index.ts`, `app/(admin)/login/page.tsx`,
`lib/db/seed/index.ts`, `tests/unit/auth.test.ts`,
`tests/integration/tenant-isolation.test.ts`, `tests/e2e/admin.spec.ts`

migration `0003_staff_login_lookup` (SECURITY DEFINER function) จะไม่ต้องใช้อีก
เพราะไม่มีการ login ด้วย email/password แล้ว

### 2. `staff_user` เปลี่ยนโครงสร้างทั้งตาราง

| เดิม (โค้ดตอนนี้) | ใหม่ (schema.sql) |
|---|---|
| `tenant_id`, `email`, `password_hash`, `role`, `resource_id` | `primary_email`, `display_name`, `is_active` |
| 1 คน = 1 ร้าน | 1 คน = หลายร้านได้ ผ่าน `staff_tenant` |
| role อยู่บน staff_user | role ย้ายไป `staff_tenant` |

session payload ที่เก็บ `tenantId` + `role` ตรงๆ ต้องเปลี่ยนวิธีคิด
เพราะคนหนึ่งอาจมีหลายร้าน — ต้องมีหน้า `/select-store`

### 3. `tenant_line_channel` → `tenant_line_oa`

ตอน Phase 2 ผมสร้างตาราง `tenant_line_channel` ขึ้นมาเอง เพราะ schema เดิม
ไม่มีที่เก็บ token (และได้แจ้งไว้ว่าเป็นการเพิ่มตารางนอก spec)

schema ใหม่นิยามตารางนี้อย่างเป็นทางการในชื่อ `tenant_line_oa` พร้อม
คอลัมน์ที่ผมไม่ได้ทำ: `connection_method`, `oa_basic_id`, `webhook_url`,
`step_oa_created`, `step_api_enabled`, `step_token_saved`,
`step_webhook_verified`, `is_verified`, `connected_at`, `last_verified_at`,
`last_error`

ต้อง migrate ข้อมูลเดิม (ถ้ามี) แล้วเปลี่ยนชื่อ + เพิ่มคอลัมน์

### 4. ตารางและคอลัมน์ที่ยังไม่มีเลย

ตารางใหม่ 6 ตัว: `subscription_plan`, `business_type_template`,
`auth_identity`, `staff_auth_identity`, `staff_tenant`, `tenant_line_oa`

คอลัมน์ใหม่ใน `tenant`: `plan_id`, `trial_ends_at`, `onboarded_at`
และ `status` เพิ่มค่า `pending_payment` (เป็น default ใหม่ด้วย)

### 5. Phase 2.5 ที่ยังไม่ได้ทำ

roadmap ใหม่แทรก Phase 2.5 ไว้ระหว่าง Phase 2 กับ 3 — ผมข้ามไปทำ 3 กับ 4
โดยไม่มีตรงนี้ ประกอบด้วย OAuth 2 provider, หน้าเลือกแพ็กเกจ, ชำระเงิน,
onboarding wizard, wizard เชื่อม LINE OA 4 ขั้น, `/select-store`,
cron trial หมดอายุ

### สิ่งที่ยังใช้ได้ ไม่ต้องแตะ

availability engine, booking + EXCLUDE constraint, notification queue + worker,
LINE Flex message, ปฏิทินหลังร้าน, จัดการบริการ/ช่าง/เวลา, ลูกค้า + merge,
`withTenant` + RLS, `lib/time/` — ทั้งหมดนี้ไม่ขึ้นกับ auth

---

## ทำอะไรต่อ

**ถ้าจะไปหาลูกค้า** — พอแล้ว หยุดเขียนโค้ดตามที่ roadmap บอก
ต้องทำก่อนขึ้นจริง: ใส่ LINE credentials, ตั้ง cron, ตั้ง backup
(ดู `docs/deploy.md`)

**ถ้าจะเขียนต่อ** เรียงตามความคุ้ม:

1. **แก้ข้อจำกัดข้อ 1** (เวลาทำการหลายช่วง) — ร้านไทยพักเที่ยงเยอะมาก
   งานไม่กี่ชั่วโมง
2. **ตัดสินใจข้อจำกัดข้อ 2** — เป็นเรื่อง UX ที่จะเจอตอนร้านคนเยอะ
3. **Phase 5 (แต้ม)** — `docs/logic.md` ข้อ 3 เขียนละเอียดที่สุดแล้ว
   และ `docs/prompts.md` ระบุเคสทดสอบไว้ครบ:
   - กด "เสร็จงาน" 2 ครั้ง → แต้มขึ้นครั้งเดียว
   - ใช้แต้มจาก 3 lot หมดอายุคนละวัน → หักจากที่ใกล้หมดก่อน
   - ใช้แต้มพร้อมกัน 2 transaction → ต้องมี 1 อันล้มเหลว ไม่ใช่ balance ติดลบ
   - จ่ายบิลด้วยแต้มบางส่วน → ได้แต้มใหม่จากเฉพาะส่วนที่จ่ายเงินสด

---

## รูปหน้าจอ

`docs/screens/` — ภาพจริงจากแอปที่รันอยู่ ไม่ใช่ mockup
สร้างใหม่ได้ด้วย

```bash
pnpm build && pnpm start &
pnpm tsx scripts/capture-screens.ts
```
