# การ deploy

---

## สิ่งที่ฐานข้อมูลต้องมี

Chairtime พึ่งความสามารถของ Postgres ที่ managed service บางเจ้าไม่เปิดให้
**ตรวจก่อนสมัคร** อย่าเชื่อหน้าเว็บโฆษณา

| ต้องมี | ใช้ทำอะไร | ถ้าไม่มี |
|---|---|---|
| PostgreSQL 14+ | `tstzrange`, partial index | ใช้ไม่ได้ |
| extension `btree_gist` | **กันจองซ้อน** (กฎเหล็กข้อ 1) | ใช้ไม่ได้ — ระบบจองที่จองซ้อนได้ = ขายไม่ได้ |
| extension `pgcrypto` | `gen_random_uuid()` | ใช้ไม่ได้ (แก้ได้ถ้าเปลี่ยนไปใช้ uuid จากฝั่งแอป) |
| สร้าง role ได้ | แยก role แอปออกจาก role owner เพื่อให้ RLS ทำงาน | RLS ถูกข้าม — ข้อมูลรั่วข้ามร้านได้ |
| `CREATE FUNCTION` + `SECURITY DEFINER` | `staff_login_lookup` | ล็อกอินไม่ได้ |

### ตรวจด้วยคำสั่งเดียว

```bash
pnpm db:check "postgresql://user:pass@host:5432/dbname"
```

สคริปต์นี้ไม่ได้แค่ถามว่ามี extension ไหม — มัน**สร้าง EXCLUDE constraint จริง
แล้วลองจองซ้อนดู** ว่าถูกปฏิเสธด้วย error `23P01` หรือเปล่า
ถ้าข้อสุดท้ายผ่าน แปลว่าใช้ได้จริง

ออก exit code ไม่เป็น 0 ถ้าไม่ผ่าน — ใส่ใน CI ก่อน migrate ได้

---

## เตรียมฐานข้อมูล

```bash
# 1. ตรวจก่อน
pnpm db:check "$DATABASE_URL_ADMIN"

# 2. สร้าง role แอป + database
#    ตั้งรหัสผ่านจริง อย่าใช้ค่า default
APP_DB_PASSWORD='<รหัสผ่านที่สุ่มมา>' \
DATABASE_SUPERUSER_URL="$DATABASE_URL_ADMIN" \
APP_DB_NAMES=chairtime \
  pnpm tsx lib/db/bootstrap.ts

# 3. สร้างตาราง
pnpm db:migrate
```

ถ้า managed service ไม่ให้สร้าง role เอง ให้สร้างผ่านหน้าเว็บของเขา
โดยต้องเป็น role ที่ **ไม่ใช่ superuser และไม่มี `BYPASSRLS`** แล้วรัน

```sql
GRANT USAGE ON SCHEMA public TO <app_role>;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO <app_role>;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO <app_role>;
GRANT EXECUTE ON FUNCTION staff_login_lookup(text) TO <app_role>;
```

> **สำคัญ** ถ้าแอปต่อด้วย superuser หรือเจ้าของตาราง RLS จะถูกข้ามทั้งหมด
> และข้อมูลรั่วข้ามร้านจะไม่โผล่จนกว่าจะมีลูกค้าจริง
> ตรวจได้ด้วย `pnpm db:check` — ถ้าขึ้น `(superuser)` แปลว่า URL นั้นใช้เป็น
> `DATABASE_URL` ไม่ได้ ใช้ได้แค่ `DATABASE_URL_ADMIN`

---

## ตัวแปรที่ต้องตั้งบน production

```bash
DATABASE_URL=            # role แอป — ไม่ใช่ superuser
DATABASE_URL_ADMIN=      # role owner — ใช้ตอน migrate เท่านั้น

SECRET_ENCRYPTION_KEY=   # 32 bytes base64
SESSION_SECRET=          # 32 bytes base64
CRON_SECRET=             # สุ่มมา
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

สร้างคีย์:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> `SECRET_ENCRYPTION_KEY` เปลี่ยนไม่ได้ถ้าไม่ re-encrypt LINE token ทั้งหมดก่อน
> เก็บสำรองไว้ที่ปลอดภัย — หายแล้วอ่าน channel token เดิมไม่ได้
>
> `SESSION_SECRET` เปลี่ยนได้ตลอด ผลคือพนักงานทุกคนถูกเตะออกจากระบบ

---

## cron

ต้องมีตัวเดียว เรียกทุก 1 นาที

```
* * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.com/api/cron/notifications
```

worker ดึงงานด้วย `FOR UPDATE SKIP LOCKED` จึงรันซ้อนกันได้โดยไม่ส่งซ้ำ
ถ้า cron หยุดไป ข้อความจะค้างในคิว ไม่หาย — พอกลับมาจะทยอยส่งต่อ
(reminder ที่เลยเวลาไปแล้วจะถูกข้าม เพราะ worker เช็คสถานะ booking ตอนส่ง)

---

## ลำดับการ deploy

```
1. pnpm db:check      ← ต้องผ่านก่อน
2. pnpm db:migrate    ← รันด้วย DATABASE_URL_ADMIN
3. pnpm build
4. deploy / restart
```

migration ทั้งหมดเป็น additive — ยังไม่มีตัวไหนลบคอลัมน์
ถ้าจะเพิ่ม migration ที่ลบคอลัมน์ CLAUDE.md บังคับให้มี backup step ก่อน

---

## backup

อย่างน้อยต้องมี

```bash
pg_dump --format=custom "$DATABASE_URL_ADMIN" > chairtime-$(date +%F).dump
```

ตารางที่ห้ามหายเด็ดขาดคือ `point_ledger` และ `point_lot` — เป็น append-only
และเป็นหลักฐานเดียวว่าลูกค้ามีแต้มเท่าไร ถ้า managed service มี
point-in-time recovery ให้เปิดไว้

---

## เช็คหลัง deploy

```bash
# ฐานข้อมูลพร้อม
pnpm db:check

# หน้าจองขึ้น
curl -sS https://your-domain.com/<tenant-slug> -o /dev/null -w '%{http_code}\n'

# availability ตอบเร็วกว่า 300ms (เป้าใน docs/roadmap.md)
curl -sS -o /dev/null -w '%{time_total}s\n' \
  "https://your-domain.com/api/availability?tenantId=<id>&date=$(date +%F)&serviceIds=<id>"

# cron ผ่าน auth
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.com/api/cron/notifications

# cron ปฏิเสธคนอื่น — ต้องได้ 401
curl -sS -o /dev/null -w '%{http_code}\n' https://your-domain.com/api/cron/notifications
```
