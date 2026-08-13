# Chairtime

ระบบจองคิว + สะสมแต้ม แบบ multi-tenant สำหรับร้านบริการในไทย
(ร้านเล็บ / ร้านผม / ร้านนวด / คลินิก / สปา)

เอกสารออกแบบอยู่ใน [`docs/`](docs/) — `schema.sql`, `logic.md`, `roadmap.md`
กฎการพัฒนาอยู่ใน [`CLAUDE.md`](CLAUDE.md) **อ่านก่อนแตะโค้ด**

---

## เริ่มต้น

ต้องมี Node 22, pnpm และ PostgreSQL 14 ขึ้นไป (ต้องมี extension `pgcrypto` และ `btree_gist`)

```bash
pnpm install
cp .env.example .env.local          # แก้ค่าถ้า postgres ไม่ได้อยู่ที่ localhost

pnpm tsx lib/db/bootstrap.ts        # สร้าง role + database (รันด้วยสิทธิ์ superuser)
pnpm db:migrate                     # สร้างตารางทั้งหมด
pnpm db:seed                        # 3 ร้านตัวอย่าง + booking ย้อนหลัง 30 วัน / ล่วงหน้า 14 วัน

pnpm dev
```

เข้าหลังร้านที่ `/login` — seed สร้าง owner ให้ทั้ง 3 ร้าน

| อีเมล | รหัสผ่าน |
|---|---|
| `owner@nailbar-ari.test` | `chairtime123` |
| `owner@thehair-thonglor.test` | `chairtime123` |
| `owner@baanmalisa-spa.test` | `chairtime123` |

หน้าจองของลูกค้าอยู่ที่ `/<slug>` เช่น `/thehair-thonglor`

### ตัวแปรที่ต้องตั้ง

```bash
SECRET_ENCRYPTION_KEY   # 32 bytes base64 — เข้ารหัส LINE channel token
SESSION_SECRET          # 32 bytes base64 — เซ็น session cookie ของพนักงาน
CRON_SECRET             # กัน /api/cron/* ถูกเรียกจากภายนอก
NEXT_PUBLIC_APP_URL     # ใช้สร้างลิงก์ในข้อความ LINE

# สร้างคีย์:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### เชื่อม LINE Official Account

channel token เป็นความลับ จึงไม่มีฟอร์มให้กรอกในหน้าเว็บ — ผู้ดูแลระบบรันคำสั่งนี้

```bash
pnpm tsx lib/line/connect.ts \
  --slug thehair-thonglor \
  --channel-id 1234567890 \
  --token <channel access token> \
  --secret <channel secret> \
  --liff 1234567890-abcdefgh
```

แล้วตั้ง webhook URL ใน LINE Developers Console เป็น
`https://<domain>/api/webhooks/line/<slug>`

ถ้ายังไม่เชื่อม LINE ระบบยังใช้งานได้ปกติ — ข้อความจะค้างใน `notification_queue`
แล้วทยอยส่งเองเมื่อเชื่อมต่อแล้ว

### ทำไมต้องมี 2 connection string

| ตัวแปร | role | ใช้ทำอะไร |
|---|---|---|
| `DATABASE_URL` | `chairtime` (ไม่ใช่ superuser) | แอปและ test — **ถูกบังคับด้วย RLS** |
| `DATABASE_URL_ADMIN` | owner | migration และ truncate ตอน seed เท่านั้น |

Row-level security จะถูก **ข้าม** ถ้าต่อด้วย superuser หรือเจ้าของตาราง
ตารางทุกตัวจึงเปิด `FORCE ROW LEVEL SECURITY` และแอปต่อด้วย role ที่ไม่มีสิทธิ์พิเศษ
ไม่งั้นข้อมูลรั่วข้ามร้านจะไม่โผล่จนกว่าจะขึ้น production

---

## คำสั่งที่ใช้บ่อย

```bash
pnpm test              # unit + integration
pnpm test:unit         # เร็ว ไม่ต้องมี DB
pnpm test:integration  # ต้องมี DB (ใช้ database chairtime_test แยกต่างหาก)
pnpm test:e2e          # Playwright ยิง API จริง (ต้อง seed ก่อน)

pnpm typecheck
pnpm lint
pnpm build

pnpm db:generate       # สร้าง migration จาก lib/db/schema.ts
pnpm db:migrate
pnpm db:seed
```

### cron ที่ต้องตั้ง

```
* * * * *  curl -H "Authorization: Bearer $CRON_SECRET" https://<domain>/api/cron/notifications
```

worker ดึงจาก `notification_queue` ด้วย `FOR UPDATE SKIP LOCKED`
รันซ้อนกันได้ ไม่ส่งซ้ำ

---

## โครงสร้าง

```
app/
  (booking)/[tenantSlug]/   หน้าจองลูกค้า (LIFF) + หน้าดู/ยกเลิกคิว
  (admin)/
    login/                  เข้าสู่ระบบพนักงาน
    dashboard/              ปฏิทินวันนี้, ลูกค้า, บริการ, ช่าง, ตั้งค่า
  api/
    availability/           GET  ช่วงเวลาว่าง (สาธารณะ)
    admin/availability/     GET  เหมือนกัน แต่อ่าน tenant จาก session
    bookings/               POST จอง / DELETE ยกเลิก
    webhooks/line/[slug]/   POST รับ webhook จาก LINE
    cron/notifications/     GET  worker ส่งข้อความ
lib/
  availability/   ★ อัลกอริทึมหาช่วงว่าง (docs/logic.md ข้อ 1)
  booking/          สร้าง/ยกเลิกการจอง + จับ error 23P01
  notifications/    คิวข้อความ + worker
  line/             client, Flex message, webhook, ต่อ channel
  admin/            read model + server action ของหลังร้าน
  auth/             scrypt + session cookie (ไม่มี dependency เพิ่ม)
  customer/         upsert จากเบอร์/LINE, รวมลูกค้าซ้ำ
  crypto.ts         AES-256-GCM สำหรับ channel token
  db/               drizzle schema, migration, seed, withTenant
  time/             ★ helper timezone ทั้งหมด — ห้ามใช้ new Date() ที่อื่น
  loyalty/          ระบบแต้ม                              ← ยังไม่ได้ทำ (Phase 5)
tests/
  unit/             ไม่ต้องมี DB
  integration/      ต้องมี DB — concurrency, RLS, ledger, คิวข้อความ, webhook
  e2e/              Playwright ยิง HTTP จริง + ขับ UI หลังร้าน
```

---

## จุดที่ต้องเข้าใจก่อนแก้โค้ด

**การกันจองซ้อนอยู่ที่ฐานข้อมูล ไม่ใช่ที่แอป**
`resource_allocation` มี `EXCLUDE USING gist (resource_id WITH =, period WITH &&) WHERE (is_released = false)`
โค้ดแค่ `INSERT` ตรงๆ แล้วจับ error `23P01` — ห้ามเช็คก่อน insert เด็ดขาด
ดู `lib/booking/create.ts` และ test ที่ `tests/integration/concurrency.test.ts`

> หมายเหตุ: Drizzle ห่อ error ของ driver ไว้ใน `DrizzleQueryError`
> ตัว SQLSTATE จึงอยู่ที่ `error.cause` ไม่ใช่ `error.code` — ใช้ `findSqlState()` เสมอ

**ทุก query ต้องผ่าน `withTenant()`**
ตัวนี้เปิด transaction แล้ว `SET LOCAL app.tenant_id` ให้ RLS ทำงาน
job ที่ต้องวนหลายร้าน ใช้ `forEachTenant()` — ไม่มีทางลัดข้าม RLS ในระบบนี้

**เวลาทั้งหมดคำนวณด้วย Luxon ผ่าน `lib/time/`**
`business_hour` เก็บเป็น `time` เปล่าๆ ต้องผูกกับวันที่ตาม timezone ของร้านก่อนใช้เสมอ
ร้านที่เปิด 18:00–02:00 จะมีช่วงเปิดคาบเกี่ยว 2 วัน — `expandWeeklyHours()` จัดการให้แล้ว

**`point_ledger` แก้ไม่ได้ ลบไม่ได้**
มี trigger กันไว้ที่ระดับฐานข้อมูล ไม่ใช่แค่ข้อตกลงในทีม

**ห้ามยิง LINE API จาก request handler**
ทุกข้อความลง `notification_queue` ก่อน แล้ว worker เป็นคนส่ง
ยกเว้น reply message ใน webhook — reply ฟรีและ token หมดอายุเร็ว จึงตอบทันที

**การล็อกอินใช้ฟังก์ชัน `staff_login_lookup`**
`staff_user` อยู่ใต้ RLS เหมือนตารางอื่น แต่ตอนล็อกอินยังไม่รู้ว่าเป็นร้านไหน
จึงต้องผ่าน SECURITY DEFINER function ที่คืนเฉพาะคอลัมน์ที่ใช้ล็อกอิน
— ห้าม `SELECT` ตาราง `staff_user` ตรงๆ นอก `withTenant`

**FullCalendar ใช้ตัวฟรี (timeGrid)**
resource timeline เป็น plugin เสียเงิน หน้าปฏิทินจึงใช้ timeGrid + ชิปกรองช่าง
พร้อมสีประจำตัวแทน — ดูช่างหลายคนพร้อมกันได้จากสี ไม่ใช่จากคอลัมน์

---

## สถานะตาม roadmap

| Phase | สถานะ |
|---|---|
| 0 — Setup | ✅ เสร็จ |
| 1 — Core booking engine | ✅ เสร็จ |
| 2 — LINE | ✅ เสร็จ (ต้องใส่ credentials ของร้านเอง) |
| 3 — หลังบ้านร้าน | ✅ เสร็จ |
| 4 — ลูกค้า | ✅ เสร็จ |
| 5 — แต้ม | ⬜ (ตารางสร้างครบแล้ว) |
| 6 — Tier + Reward | ⬜ (ตารางสร้างครบแล้ว) |
| 7 — Package | ⬜ (ตารางสร้างครบแล้ว) |
| 8 — ขัดเงา | ⬜ |

**🎯 Phase 1–4 = MVP ที่ขายได้แล้ว** ตาม docs/roadmap.md
