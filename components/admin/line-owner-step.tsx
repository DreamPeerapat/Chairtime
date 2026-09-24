import type { OwnerLinkState } from '@/lib/line/owner-link';
import type { OwnerMenuState } from '@/lib/line/owner-menu';
import { GhostButton, NextButton, Step } from './line-wizard';

/**
 * Step 7 of the LINE wizard: the owner's own phone, and the back-office menu
 * only their chat gets. Split out of line-launch-steps.tsx for the 200-line
 * rule in CLAUDE.md; the server actions still arrive as props from the page.
 */
export function LineOwnerStep({
  isVerified,
  ownerLink,
  ownerMenu,
  newOwnerCode,
  buildOwnerMenu,
  dropOwnerMenu,
}: {
  isVerified: boolean;
  ownerLink: OwnerLinkState;
  ownerMenu: OwnerMenuState;
  newOwnerCode: () => Promise<void>;
  buildOwnerMenu: () => Promise<void>;
  dropOwnerMenu: () => Promise<void>;
}) {
  return (
    <Step
      n={7}
      title="ผูก LINE ของเจ้าของร้าน"
      done={ownerLink.linked}
      locked={!isVerified}
      summary="ลูกค้าจองหรือยกเลิก แล้วข้อความเข้าเครื่องนี้ทันที"
    >
      {ownerLink.linked ? (
        <>
          <p>
            เมื่อลูกค้าจองคิวเองหรือกดยกเลิก ระบบจะส่งข้อความเข้า LINE เครื่องที่ผูกไว้ให้อัตโนมัติ
          </p>
          <form action={newOwnerCode}>
            <GhostButton>เปลี่ยนไปใช้เครื่องอื่น</GhostButton>
          </form>

          {/* Only the owner's own chat gets this menu, so a customer is
              never offered a back-office button that refuses them. */}
          <div className="mt-2 flex flex-col gap-1.5 border-t border-line pt-3">
            <p className="text-sm font-medium">เมนูลัดในแชท LINE ของคุณ</p>
            <p className="text-sm text-muted">
              ใส่ปุ่ม ตารางคิว · สรุปยอด · ลูกค้า · จัดการร้าน ไว้ใต้ห้องแชท — เห็นเฉพาะเครื่องที่ผูกไว้
              ลูกค้ายังเห็นเมนูจองคิวเหมือนเดิม
            </p>

            {ownerMenu.installed ? (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="text-sm text-brand">ติดตั้งแล้ว</span>
                <form action={buildOwnerMenu}>
                  <GhostButton>สร้างใหม่</GhostButton>
                </form>
                <form action={dropOwnerMenu}>
                  <button type="submit" className="px-1 text-xs text-muted underline">
                    เอาออก
                  </button>
                </form>
              </div>
            ) : (
              <form action={buildOwnerMenu} className="mt-1">
                <NextButton>สร้างเมนูเจ้าของร้าน</NextButton>
              </form>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-muted">
            เปิดแชท LINE ของร้าน (แอด OA ของร้านเป็นเพื่อนก่อน) แล้วพิมพ์รหัสนี้ส่งเข้าไป
            จากเครื่องที่อยากให้แจ้งเตือน
          </p>
          <code className="w-fit rounded-xl border border-line bg-surface-muted px-4 py-2.5 font-mono text-lg tracking-widest select-all">
            {ownerLink.code ?? '—'}
          </code>
          <p className="text-xs text-muted">
            ส่งได้ครั้งเดียว หลังจากนั้นรหัสหมดอายุทันที — คนอื่นที่เห็นรหัสทีหลังแย่งการแจ้งเตือนไปไม่ได้
          </p>
        </>
      )}
    </Step>
  );
}
