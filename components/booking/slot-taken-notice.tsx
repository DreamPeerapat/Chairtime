/**
 * Somebody took the slot while the customer was filling in the form. It
 * carries a way out rather than only an apology: with staff selection on, a
 * different stylist may still be free at the time they wanted.
 */
export function SlotTakenNotice({
  staffStepEnabled,
  onPickOtherStaff,
}: {
  staffStepEnabled: boolean;
  onPickOtherStaff: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    >
      <p className="font-medium">ช่วงเวลานี้เพิ่งถูกจองไปเมื่อสักครู่</p>
      <p className="mt-0.5">
        {staffStepEnabled
          ? 'กรุณาเลือกเวลาอื่นจากรายการด้านล่าง หรือเลือกช่างคนอื่นที่ยังว่างในเวลาเดิม'
          : 'กรุณาเลือกเวลาอื่นจากรายการด้านล่าง'}
      </p>
      {staffStepEnabled ? (
        <button
          type="button"
          onClick={onPickOtherStaff}
          className="mt-2 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium dark:border-amber-800"
        >
          เลือกช่างคนอื่น
        </button>
      ) : null}
    </div>
  );
}
