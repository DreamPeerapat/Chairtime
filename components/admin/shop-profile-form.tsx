'use client';

/**
 * Name, phone and address.
 *
 * These are what the LINE "ติดต่อ" reply reads out to a customer and what the
 * generated rich menu points at. The columns and the settings loader were
 * there from the start, but nothing could write them — a shop could only get
 * a phone number onto its own contact card by editing the database.
 *
 * The map field takes whatever the shop has rather than latitude and
 * longitude, which no salon owner knows: the Google Maps link they already
 * send customers is parsed for the pin. What is saved is shown back as the
 * coordinates, so it is obvious the link was understood.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveShopProfile } from '@/lib/admin/actions';
import { ErrorText } from './ui';

const field =
  'rounded-lg border border-line px-3 py-2 text-sm';

export function ShopProfileForm({
  name,
  phone,
  address,
  latitude,
  longitude,
}: {
  name: string;
  phone: string | null;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pinned = latitude !== null && longitude !== null;

  function save(formData: FormData) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveShopProfile({
        name: formData.get('name'),
        phone: formData.get('phone'),
        address: formData.get('address'),
        mapLink: formData.get('mapLink'),
      });
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error ?? 'บันทึกไม่สำเร็จ');
      }
    });
  }

  return (
    <form
      action={save}
      className="flex flex-col gap-3 rounded-xl border border-line px-4 py-4"
    >
      <label className="flex flex-col gap-1 text-sm">
        ชื่อร้าน
        <input name="name" defaultValue={name} required maxLength={120} className={field} />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        เบอร์โทร
        <input
          name="phone"
          defaultValue={phone ?? ''}
          maxLength={30}
          placeholder="02-000-0000"
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        ที่อยู่
        <textarea
          name="address"
          defaultValue={address ?? ''}
          rows={2}
          maxLength={300}
          className={field}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        แผนที่ร้าน
        <input
          name="mapLink"
          defaultValue={pinned ? `${latitude}, ${longitude}` : ''}
          maxLength={2000}
          placeholder="วางลิงก์ Google Maps ของร้าน"
          className={field}
        />
      </label>

      <p className="text-xs text-muted">
        เปิด Google Maps → หาร้านของคุณ → กด <span className="font-medium">แชร์</span> →
        คัดลอกลิงก์ มาวางในช่องด้านบน (พิมพ์พิกัดเองก็ได้ เช่น 13.7563, 100.5018)
      </p>

      {pinned ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
          target="_blank"
          rel="noreferrer"
          className="w-fit text-xs text-brand underline"
        >
          ดูจุดที่บันทึกไว้บนแผนที่ — ตรวจว่าหมุดถูกที่
        </a>
      ) : null}

      <p className="text-xs text-muted">
        ลูกค้าเห็นข้อมูลนี้เมื่อกดปุ่ม ติดต่อ ใน LINE — ถ้าใส่แผนที่ไว้
        ระบบจะส่งการ์ดแผนที่ให้ด้วย กดแล้วนำทางไปร้านได้เลย
      </p>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {saved ? <p className="text-xs text-brand">บันทึกแล้ว</p> : null}

      <button
        type="submit"
        disabled={pending}
        className="ct-press w-fit rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-brand-contrast disabled:opacity-40"
      >
        {pending ? 'กำลังบันทึก…' : 'บันทึกข้อมูลร้าน'}
      </button>
    </form>
  );
}
