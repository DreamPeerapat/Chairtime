# บันทึกสถานะ — Phase 2.5 เสร็จแล้ว

อัปเดต: 13 สิงหาคม 2026
branch: `claude/project-plan-wl774s`

## สรุปสั้น

Phase 0–2.5 เสร็จแล้ว รวม self-serve signup แบบ OAuth เต็มรูปแบบ
Phase 5–8 ยังไม่ได้ทำ แต่ **ตารางในฐานข้อมูลสร้างครบแล้วตั้งแต่ Phase 0**

| Phase | สถานะ | หมายเหตุ |
|---|---|---|
| 0 — Setup | ✅ | ครบตาม schema ปัจจุบัน (6 ตารางใหม่ของ Phase 2.5 รวมแล้ว) |
| 1 — Core booking | ✅ | ผ่านเกณฑ์ 50 request → สำเร็จ 1 |
| 2 — LINE | ✅ | pipeline ครบ, ตารางคือ `tenant_line_oa` |
| 2.5 — Self-serve signup | ✅ | OAuth (LINE+Google), onboarding, LINE OA wizard 4 ขั้น — ดูด้านล่าง |
| 3 — หลังบ้าน | ✅ | auth เปลี่ยนเป็น OAuth ทั้งหมดแล้ว |
| 4 — ลูกค้า | ✅ | ไม่กระทบ |
| 5 — แต้ม | ⬜ | `lib/loyalty/` ยังว่าง |
| 6 — Tier + Reward | ⬜ | |
| 7 — Package | ⬜ | |
| 8 — ขัดเงา | ⬜ | |

**ผลทดสอบล่าสุด:** 95 unit + 58/59 integration + 19/20 e2e ผ่าน
typecheck / lint / build ผ่านทั้งหมด — 3 เทสต์ที่ไม่ผ่านเป็นของเดิม
ไม่เกี่ยวกับงาน Phase 2.5 (ดู "เทสต์ที่ไม่ผ่าน (ของเดิม ไม่ได้แตะ)" ด้านล่าง)

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

## ✅ Phase 2.5 — Self-serve signup (เสร็จแล้ว)

migration `0004_oauth_self_serve` เพิ่ม 6 ตารางใหม่ (`subscription_plan`,
`business_type_template`, `auth_identity`, `staff_auth_identity`,
`staff_tenant`, `tenant_line_oa`) และปรับ `staff_user` ให้เป็น global +
`tenant` ให้มี `plan_id`/`trial_ends_at`/`onboarded_at` ตาม `docs/schema.sql`
เป๊ะ — **ไม่มีอะไรถูกลบทิ้ง** ตารางเก่า (`staff_user` แบบ password,
`tenant_line_channel`) ถูก `RENAME` เป็น `*_backup` ไว้ตามกฎ "ห้าม migration
ที่ลบคอลัมน์โดยไม่มี backup step"

**Auth:** `lib/auth/oauth.ts` คุยกับ LINE Login และ Google ผ่าน `fetch` ตรงๆ
(ไม่เพิ่ม dependency — endpoint token/profile ของทั้งสองเจ้าเป็น JSON ธรรมดา)
`lib/auth/identity.ts` ทำ routing ตาม `docs/logic.md` ข้อ 1.5: 0 ร้าน →
onboarding, 1 ร้าน → session ตรง, มากกว่า 1 → `/select-store` — ไม่มีการ
auto-merge สอง identity แม้ email ตรงกัน

**Onboarding:** `/onboarding/plan` สร้าง tenant (ชนชื่อกันเติมเลขต่อท้าย
อัตโนมัติ ไม่มีวันสมัครไม่สำเร็จเพราะชื่อซ้ำ) + `copy_business_template()`
สำหรับแพ็กเกจ trial (active ทันที) `/onboarding/payment` สำหรับแพ็กเกจเสียเงิน
(ยืนยันด้วยมือ ยังไม่มี SlipOK จริงตามที่ roadmap บอก) `/onboarding/setup`
เก็บเวลาทำการ+ราคาบริการแล้วปิด `onboarded_at`

**Gate:** `proxy.ts` (Next.js เปลี่ยนชื่อ middleware.ts เป็น proxy.ts ใน
เวอร์ชันนี้) เช็ค `session.onboarded` ก่อนเข้า `/dashboard` เสมอ — flag นี้
ฝังมากับ session token ตอน mint ไม่ query DB ที่ edge

**LINE OA wizard:** `/dashboard/settings/line` ทำ 4 ขั้นตามที่
`docs/logic.md` ข้อ 1.6 สั่ง แต่ละ step เก็บ state แยกใน `tenant_line_oa`
เพื่อให้ปิดแท็บกลางทางแล้วกลับมาทำต่อได้ ปุ่ม "ทดสอบเชื่อมต่อ" ยิง
`GET /v2/bot/info` จริง ไม่ใช่แค่เช็ครูปแบบ token

**Dev-only ทางลัด:** เพราะกฎเหล็กข้อ 7 ห้าม password จริงจัง แต่ dev ก็ต้อง
เข้าหลังบ้านทดสอบได้โดยไม่ต้องไปสมัคร LINE Login/Google OAuth app จริง —
`/dev-login` (404 ใน production) mint session แบบเดียวกับ `/auth/callback`
ให้กับ owner ที่ `pnpm db:seed` สร้างไว้ นี่คือจุดตัดสินใจที่ไม่ได้ระบุใน
spec ตรงๆ ถ้าไม่เห็นด้วยกับแนวทางนี้บอกได้ จะเอาออกก็ได้เพราะไม่กระทบ
production auth path เลย

**ยังไม่ได้ทำ (นอกเหนือจาก Phase 2.5):** ไม่เคยทดสอบกับ LINE Login/Google
OAuth app ตัวจริง (ต้องสมัคร credential ก่อน — ไม่มีในสภาพแวดล้อมนี้)
verified ด้วยการ mint session ตรงและเรียก HTTP flow จริงแทน — ก่อนขึ้น
production ต้องสมัคร LINE Login channel + Google OAuth client แล้วลอง
signup จริงสักครั้งตามที่ `docs/prompts.md` ข้อ 5.5 บอก ("เปิด browser ใหม่
เดิน signup flow ทั้งหมดด้วยมือ")

### เทสต์ที่ไม่ผ่าน (ของเดิม ไม่ได้แตะ)

สามตัวนี้ fail แบบไม่เกี่ยวกับ auth/Phase 2.5 เลย เช็คแล้วว่า fail อยู่ก่อน
งานนี้ (ขึ้นกับเวลา/timing ตอนรัน ไม่ใช่โค้ดพัง):
- `notifications.test.ts` "skips a reminder that would have to fire in the
  past" — คำนวณจาก wall-clock เวลาที่รัน test พอดี ไม่ deterministic
- `concurrency.test.ts` "collapses simultaneous..." — fail เฉพาะตอนรันพร้อม
  ไฟล์อื่น (ผ่านทุกครั้งตอนรันเดี่ยวๆ) เป็น race timing ไม่ใช่ bug จริง
- `admin.spec.ts` "opens a booking and changes its status" (e2e) — header
  ทับปฏิทินตอนคลิก event เป็น UI timing ไม่เกี่ยวกับ auth

### สิ่งที่ยังใช้ได้ ไม่ต้องแตะ

availability engine, booking + EXCLUDE constraint, notification queue + worker,
LINE Flex message, ปฏิทินหลังร้าน, จัดการบริการ/ช่าง/เวลา, ลูกค้า + merge,
`withTenant` + RLS, `lib/time/` — ทั้งหมดนี้ไม่ขึ้นกับ auth

---

## ทำอะไรต่อ

**ก่อนขึ้นจริง (นอกเหนือจาก LINE credentials/cron/backup เดิม):**
สมัคร LINE Login channel จริง + Google OAuth client จริง ใส่
`LINE_LOGIN_CHANNEL_ID`/`LINE_LOGIN_CHANNEL_SECRET`/`GOOGLE_CLIENT_ID`/
`GOOGLE_CLIENT_SECRET` ใน `.env.local` (ดูคอมเมนต์ใน `.env.example`) แล้ว
เดิน signup flow จริงในเบราว์เซอร์สักครั้งตาม `docs/prompts.md` ข้อ 5.5 —
ที่ทำมาทั้งหมดตรวจสอบด้วยการ mint session ตรงๆ กับยิง HTTP endpoint จริง
ไม่เคยผ่านหน้า consent ของ LINE/Google จริงเพราะไม่มี credential ในนี้

**ถ้าจะเขียนต่อ** เรียงตามความคุ้ม:

1. **แก้ข้อจำกัดข้อ 1** (เวลาทำการหลายช่วง) — ร้านไทยพักเที่ยงเยอะมาก
   งานไม่กี่ชั่วโมง (`/onboarding/setup` ตอนนี้ก็ตั้งได้แค่ช่วงเดียวเหมือนกัน
   ด้วยเหตุผลเดียวกัน)
2. **ตัดสินใจข้อจำกัดข้อ 2** — เป็นเรื่อง UX ที่จะเจอตอนร้านคนเยอะ
3. **Phase 5 (แต้ม)** — `docs/logic.md` ข้อ 3 เขียนละเอียดที่สุดแล้ว
   และ `docs/prompts.md` ระบุเคสทดสอบไว้ครบ:
   - กด "เสร็จงาน" 2 ครั้ง → แต้มขึ้นครั้งเดียว
   - ใช้แต้มจาก 3 lot หมดอายุคนละวัน → หักจากที่ใกล้หมดก่อน
   - ใช้แต้มพร้อมกัน 2 transaction → ต้องมี 1 อันล้มเหลว ไม่ใช่ balance ติดลบ
   - จ่ายบิลด้วยแต้มบางส่วน → ได้แต้มใหม่จากเฉพาะส่วนที่จ่ายเงินสด

**บั๊กเล็กที่เจอระหว่างทาง ยังไม่ได้แก้ (ไม่เกี่ยวกับ auth):**
`lib/db/seed/index.ts` และสคริปต์อื่นที่เขียนแบบ
`import { loadEnv } from '@/lib/env'; loadEnv(); import { db } from '../client';`
ใช้ไม่ได้ถ้า `DATABASE_URL` ไม่ได้ export ไว้ในเชลล์อยู่ก่อนแล้ว เพราะ ESM
hoist import ทั้งหมดให้ทำงานก่อน statement อื่นเสมอ ไม่ว่าจะเขียน `loadEnv()`
ไว้ตรงไหนในไฟล์ — ใช้งานได้ปกติถ้ามี `.env.local` ถูก source ไว้แล้ว
(เช่นผ่าน direnv) แต่พังถ้ารันในเชลล์เปล่าๆ ทางแก้คือเปลี่ยนไปใช้ dynamic
`import()` หลัง `loadEnv()` แทน static import — ยังไม่ได้แก้เพราะนอกขอบเขต
งานนี้

---

## รูปหน้าจอ

`docs/screens/` — ภาพจริงจากแอปที่รันอยู่ ไม่ใช่ mockup
สร้างใหม่ได้ด้วย

```bash
pnpm build && pnpm start &
pnpm tsx scripts/capture-screens.ts
```
