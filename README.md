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

---

## โครงสร้าง

```
app/
  (booking)/[tenantSlug]/   หน้าจองสำหรับลูกค้า (LIFF)   ← ยังไม่ได้ทำ (Phase 2)
  (admin)/dashboard/        หลังบ้านร้าน                 ← ยังไม่ได้ทำ (Phase 3)
  api/
    availability/           GET  ช่วงเวลาว่าง
    bookings/               POST จอง / DELETE ยกเลิก
lib/
  availability/   ★ อัลกอริทึมหาช่วงว่าง (docs/logic.md ข้อ 1)
  booking/          สร้าง/ยกเลิกการจอง + จับ error 23P01
  db/               drizzle schema, migration, seed, withTenant
  time/             ★ helper timezone ทั้งหมด — ห้ามใช้ new Date() ที่อื่น
  loyalty/          ระบบแต้ม                              ← ยังไม่ได้ทำ (Phase 5)
  line/             LINE messaging                        ← ยังไม่ได้ทำ (Phase 2)
tests/
  unit/             ไม่ต้องมี DB
  integration/      ต้องมี DB — concurrency, RLS, ledger guard
  e2e/              Playwright ยิง HTTP จริง
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

---

## สถานะตาม roadmap

| Phase | สถานะ |
|---|---|
| 0 — Setup | ✅ เสร็จ |
| 1 — Core booking engine | ✅ เสร็จ |
| 2 — LINE | ⬜ |
| 3 — หลังบ้านร้าน | ⬜ |
| 4 — ลูกค้า | ⬜ |
| 5 — แต้ม | ⬜ (ตารางสร้างครบแล้ว) |
| 6 — Tier + Reward | ⬜ (ตารางสร้างครบแล้ว) |
| 7 — Package | ⬜ (ตารางสร้างครบแล้ว) |
| 8 — ขัดเงา | ⬜ |
