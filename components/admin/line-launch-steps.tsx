import type { OwnerLinkState } from '@/lib/line/owner-link';
import type { OwnerMenuState } from '@/lib/line/owner-menu';
import { Copy, NextButton, Phase, Step, Steps, Term } from './line-wizard';
import { LineOwnerStep } from './line-owner-step';

/**
 * The half of the LINE wizard that happens after the plumbing works: a
 * customer who can book inside LINE, a button that puts the booking page
 * under the chat, and the shop's own phone buzzing when a queue comes in.
 *
 * Split out of the page for the 200-line rule in CLAUDE.md. The server
 * actions arrive as props, defined next to the session check that authorises
 * them.
 */
export function LineLaunchSteps({
  isVerified,
  liffId,
  liffEndpoint,
  liffUrl,
  ownerLink,
  ownerMenu,
  saveLiff,
  newOwnerCode,
  buildOwnerMenu,
  dropOwnerMenu,
}: {
  isVerified: boolean;
  liffId: string | null;
  liffEndpoint: string;
  /** null until a LIFF id is saved — there is nothing to point a menu at yet */
  liffUrl: string | null;
  ownerLink: OwnerLinkState;
  ownerMenu: OwnerMenuState;
  saveLiff: (formData: FormData) => Promise<void>;
  newOwnerCode: () => Promise<void>;
  buildOwnerMenu: () => Promise<void>;
  dropOwnerMenu: () => Promise<void>;
}) {
  return (
    <>
      <Phase label="ช่วงที่ 2 · เปิดให้ลูกค้าจองใน LINE" hint="ส่วนที่ลูกค้าเห็น" />

      <Step
        n={5}
        title="เปิดหน้าจองในแอป LINE (LIFF)"
        done={Boolean(liffId)}
        locked={!isVerified}
        summary="ลูกค้าจองจบในแชท ร้านได้บัญชี LINE ไว้ตอบกลับและเตือนนัด"
      >
        <p className="text-muted">
          ถ้าไม่ทำขั้นนี้ ลูกค้ายังจองได้ แต่หน้าจองจะเปิดในเบราว์เซอร์ธรรมดา — ร้านจะได้แค่เบอร์โทร
          ส่งคำยืนยันหรือเตือนนัดทาง LINE ไม่ได้
        </p>

        <Steps>
          <li>
            เปิด <Term>developers.line.biz</Term> → เลือก Provider → แท็บ <Term>LIFF</Term> →{' '}
            <Term>Add</Term>
          </li>
          <li>
            Size เลือก <Term>Full</Term> · Scope ติ๊ก <Term>profile</Term> และ <Term>openid</Term>
          </li>
          <li>Endpoint URL ใส่ค่านี้</li>
        </Steps>

        <Copy value={liffEndpoint} />

        {isVerified ? (
          <form action={saveLiff} className="mt-1 flex flex-col gap-2">
            <label className="text-xs font-medium text-muted">
              LIFF ID ที่ได้มา
              <input
                name="liffId"
                defaultValue={liffId ?? ''}
                placeholder="1234567890-abcdefgh"
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2.5 font-mono text-sm"
              />
            </label>
            <NextButton>{liffId ? 'บันทึกใหม่' : 'บันทึก LIFF ID' }</NextButton>
          </form>
        ) : null}
      </Step>

      {/* The last mile. Everything above is plumbing the shop cannot see the
          point of until a customer can actually reach the booking page, and a
          rich menu is how they reach it — a button that sits under the chat
          permanently rather than a keyword nobody knows to type. */}
      <Step
        n={6}
        title="ใส่ปุ่มจองคิวใน Rich menu"
        done={false}
        locked={!liffId}
        summary="ปุ่มค้างอยู่ใต้ห้องแชท ลูกค้าไม่ต้องจำว่าต้องพิมพ์อะไร"
      >
        <Copy label="ลิงก์สำหรับวางใน Rich menu" value={liffUrl ?? ''} />

        {/* The step used to stop at "upload a 2500x1686 image" — which for a
            salon owner with no design tool is where the setup ends. The
            product draws one, labelled to match the keywords the webhook
            already answers. */}
        <div className="mt-1 flex flex-col gap-1">
          <p className="text-xs font-medium text-muted">รูปปุ่มสำหรับ Rich menu</p>
          <a
            href="/dashboard/settings/line/rich-menu.png"
            download="chairtime-rich-menu.png"
            className="ct-press w-fit rounded-xl border border-line px-4 py-2 text-xs"
          >
            ดาวน์โหลดรูปปุ่ม (2500 × 1686)
          </a>
        </div>

        <Steps>
          <li>
            เปิด <Term>manager.line.biz</Term> → เลือก OA ของร้าน
          </li>
          <li>
            เมนูซ้าย <Term>Rich menu</Term> → <Term>Create</Term>
          </li>
          <li>
            เลือก Template แบบ <Term>แถบบนเต็ม 1 ช่อง + แถวล่าง 3 ช่อง</Term> ให้ตรงกับรูป
            แล้วอัปโหลดรูปที่ดาวน์โหลดมา — ถ้าไม่มี ใช้แบบ 6 ช่อง แล้วตั้งสามช่องบนให้ชี้ลิงก์เดียวกัน
          </li>
          <li>
            ช่องที่จะให้กดจอง เลือก Action เป็น <Term>Link</Term> แล้ววาง URL ด้านบน
          </li>
          <li>
            ตั้ง <Term>Display period</Term> ให้ครอบวันนี้ แล้วกด Save — ถ้าไม่ตั้ง เมนูจะไม่ขึ้น
          </li>
        </Steps>

        <a
          href="https://manager.line.biz/"
          target="_blank"
          rel="noreferrer"
          className="w-fit text-sm text-brand underline"
        >
          เปิด LINE Official Account Manager
        </a>
      </Step>

      <Phase label="ช่วงที่ 3 · ให้ร้านรู้ทันเมื่อมีคิว" hint="ส่วนที่ร้านใช้" />

      {/* The owner's own phone. Their staff login is a LINE identity too, but
          one issued by our provider — the shop's OA cannot address it. So the
          owner proves which chat is theirs by sending a code to it. */}
      <LineOwnerStep
        isVerified={isVerified}
        ownerLink={ownerLink}
        ownerMenu={ownerMenu}
        newOwnerCode={newOwnerCode}
        buildOwnerMenu={buildOwnerMenu}
        dropOwnerMenu={dropOwnerMenu}
      />
    </>
  );
}
