'use client';

/**
 * The rules that decide what a customer is allowed to book.
 *
 * They were already on this page — as five read-only boxes. A shop could see
 * that it released slots every 15 minutes and had no way at all to make it
 * 30, short of someone editing the database.
 *
 * Values are offered as chips rather than a number box because every one of
 * them has a consequence the shop cares about more than the number itself,
 * and the sentence under each row spells that consequence out using whatever
 * is selected right now. "60 นาที" means nothing on its own; "ลูกค้าจองคิว
 * ที่เริ่มในอีกไม่ถึง 1 ชั่วโมงไม่ได้" is the rule.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveBookingPolicy } from '@/lib/admin/actions';
import { ErrorText } from './ui';
import { Chip, Choices, Field, saySpan, slotExample } from './policy-choices';

export interface BookingPolicy {
  slotGranularityMin: number;
  minLeadTimeMin: number;
  maxAdvanceDays: number;
  cancelCutoffMin: number;
  allowCustomerPickStaff: boolean;
}

export function BookingPolicyForm({ policy }: { policy: BookingPolicy }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState(policy);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof BookingPolicy>(key: K, next: BookingPolicy[K]) {
    setSaved(false);
    setValue((prev) => ({ ...prev, [key]: next }));
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveBookingPolicy(value);
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error ?? 'บันทึกไม่สำเร็จ');
      }
    });
  }

  return (
    <form action={save} className="flex flex-col divide-y divide-line">
      <Field
        label="ปล่อยช่องจองทุก"
        explain={`ลูกค้าเห็นเวลาเริ่มเป็น ${slotExample(value.slotGranularityMin)} — ยิ่งถี่ยิ่งจองได้พอดีตัว แต่ตารางจะดูแน่นขึ้น`}
      >
        <Choices
          options={[10, 15, 20, 30, 60]}
          value={value.slotGranularityMin}
          onSelect={(n) => set('slotGranularityMin', n)}
          say={(n) => `${n} นาที`}
        />
      </Field>

      <Field
        label="จองล่วงหน้าอย่างน้อย"
        explain={
          value.minLeadTimeMin === 0
            ? 'ลูกค้าจองคิวที่เริ่มอีกเดี๋ยวเดียวได้ — เหมาะกับร้านที่รับวอล์กอินอยู่แล้ว'
            : `ลูกค้าจองคิวที่เริ่มในอีกไม่ถึง ${saySpan(value.minLeadTimeMin)} ไม่ได้ ร้านจะมีเวลาเตรียมตัว`
        }
      >
        <Choices
          options={[0, 30, 60, 120, 180]}
          value={value.minLeadTimeMin}
          onSelect={(n) => set('minLeadTimeMin', n)}
          say={(n) => (n === 0 ? 'จองทันทีได้' : saySpan(n))}
        />
      </Field>

      <Field
        label="จองล่วงหน้าได้ไกลสุด"
        explain={`ปฏิทินของลูกค้าเปิดถึง ${value.maxAdvanceDays} วันข้างหน้า เลยจากนั้นยังเลือกไม่ได้`}
      >
        <Choices
          options={[7, 14, 30, 60, 90]}
          value={value.maxAdvanceDays}
          onSelect={(n) => set('maxAdvanceDays', n)}
          say={(n) => `${n} วัน`}
        />
      </Field>

      <Field
        label="ยกเลิกฟรีก่อนถึงคิว"
        explain={
          value.cancelCutoffMin === 0
            ? 'ลูกค้ายกเลิกเองได้จนถึงเวลาคิว — ช่องที่ว่างกะทันหันจะกลับมาขายได้ยาก'
            : `ลูกค้ายกเลิกเองได้จนถึง ${saySpan(value.cancelCutoffMin)} ก่อนคิว หลังจากนั้นต้องโทรมาที่ร้าน`
        }
      >
        <Choices
          options={[0, 60, 180, 360, 720, 1440]}
          value={value.cancelCutoffMin}
          onSelect={(n) => set('cancelCutoffMin', n)}
          say={(n) => (n === 0 ? 'ยกเลิกได้ถึงเวลาคิว' : saySpan(n))}
        />
      </Field>

      <Field
        label="ลูกค้าเลือกช่างได้"
        explain={
          value.allowCustomerPickStaff
            ? 'หน้าจองจะมีขั้นเลือกช่าง ลูกค้าประจำจะได้คนเดิม'
            : 'ร้านเป็นคนจัดช่างให้เอง หน้าจองจะสั้นลงหนึ่งขั้น'
        }
      >
        {[true, false].map((on) => (
          <Chip
            key={String(on)}
            selected={value.allowCustomerPickStaff === on}
            onSelect={() => set('allowCustomerPickStaff', on)}
            label={on ? 'เลือกได้' : 'ร้านจัดให้'}
          />
        ))}
      </Field>

      <div className="flex flex-wrap items-center gap-3 pt-4">
        <button
          type="submit"
          disabled={pending}
          className="ct-press rounded-xl bg-brand px-5 py-2.5 text-sm font-medium text-brand-contrast disabled:opacity-40"
        >
          {pending ? 'กำลังบันทึก…' : 'บันทึกนโยบาย'}
        </button>
        {saved ? <p className="text-xs text-brand">บันทึกแล้ว — มีผลกับคิวที่จองเข้ามาหลังจากนี้</p> : null}
        {error ? <ErrorText>{error}</ErrorText> : null}
      </div>
    </form>
  );
}
