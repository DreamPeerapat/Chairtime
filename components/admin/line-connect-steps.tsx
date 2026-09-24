import type { WizardState } from '@/lib/line/wizard';
import { Copy, NextButton, Phase, Step, Steps, Term } from './line-wizard';

/**
 * The first half of the LINE wizard: the plumbing between Chairtime and the
 * shop's own OA, none of which a customer sees.
 *
 * Split out of the page for the 200-line rule in CLAUDE.md, the same way as
 * LineLaunchSteps. The server actions arrive as props, defined next to the
 * session check that authorises them.
 */
export function LineConnectSteps({
  state,
  webhookUrl,
  markOaCreated,
  markApiEnabled,
  saveToken,
  runTest,
}: {
  state: WizardState;
  webhookUrl: string;
  markOaCreated: () => Promise<void>;
  markApiEnabled: () => Promise<void>;
  saveToken: (formData: FormData) => Promise<void>;
  runTest: () => Promise<void>;
}) {
  return (
    <>
      <Phase label="ช่วงที่ 1 · ต่อท่อกับ LINE OA ของร้าน" hint="ลูกค้ายังไม่เห็นอะไรในช่วงนี้" />

      <Step
        n={1}
        title="สร้าง LINE Official Account ของร้าน"
        done={state.stepOaCreated}
        summary="บัญชี LINE ที่ลูกค้าจะแอดเป็นเพื่อนและคุยกับร้าน"
      >
        <p className="text-muted">ถ้ายังไม่มี OA ของร้าน สร้างฟรีได้ที่ LINE Official Account Manager</p>
        <a
          href="https://manager.line.biz/"
          target="_blank"
          rel="noreferrer"
          className="w-fit text-sm text-brand underline"
        >
          เปิด manager.line.biz
        </a>
        {!state.stepOaCreated ? (
          <form action={markOaCreated} className="mt-1">
            <NextButton>มี OA แล้ว ไปขั้นถัดไป</NextButton>
          </form>
        ) : null}
      </Step>

      <Step
        n={2}
        title="เปิด Messaging API"
        done={state.stepApiEnabled}
        locked={!state.stepOaCreated}
        summary="สิ่งที่ทำให้ระบบส่งข้อความในชื่อร้านได้"
      >
        <Steps>
          <li>
            ใน manager.line.biz → <Term>Settings</Term> → <Term>Messaging API</Term> →{' '}
            <Term>Enable Messaging API</Term>
          </li>
          <li>เลือก Provider เดิม หรือสร้างใหม่ก็ได้</li>
        </Steps>
        <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          แนะนำให้ปิด <span className="font-medium">Auto-reply messages</span> และ{' '}
          <span className="font-medium">Greeting messages</span> ใน OA Manager
          ไม่งั้นจะชนกับข้อความที่ระบบส่งเอง ลูกค้าจะได้สองข้อความทุกครั้ง
        </p>
        {state.stepOaCreated && !state.stepApiEnabled ? (
          <form action={markApiEnabled} className="mt-1">
            <NextButton>เปิดแล้ว ไปขั้นถัดไป</NextButton>
          </form>
        ) : null}
      </Step>

      <Step
        n={3}
        title="วาง Webhook URL แล้วคัดลอก Token กับ Secret"
        done={state.stepTokenSaved}
        locked={!state.stepApiEnabled}
        summary="กุญแจของร้าน — ระบบเก็บแบบเข้ารหัส ไม่มีใครอ่านย้อนได้"
      >
        <p className="text-muted">
          ใน <Term>developers.line.biz</Term> → Messaging API → วาง Webhook URL นี้ แล้วเปิด{' '}
          <Term>Use webhook</Term>
        </p>
        <Copy value={webhookUrl} />

        {state.stepApiEnabled ? (
          <form action={saveToken} className="mt-1 flex flex-col gap-2">
            <input
              name="channelAccessToken"
              placeholder="Channel Access Token"
              required
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm"
            />
            <input
              name="channelSecret"
              placeholder="Channel Secret"
              required
              className="w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-sm"
            />
            <NextButton>บันทึก Token และ Secret</NextButton>
          </form>
        ) : null}
      </Step>

      <Step
        n={4}
        title="ทดสอบเชื่อมต่อ"
        done={state.isVerified}
        locked={!state.stepTokenSaved}
        summary="ยิงจริงหนึ่งครั้ง ให้รู้ตอนนี้ว่าใช้ได้ ไม่ใช่รู้ตอนลูกค้าจอง"
      >
        {state.isVerified ? (
          <>
            <p>เชื่อมต่อสำเร็จ — ระบบส่งข้อความในชื่อ OA ของร้านได้แล้ว</p>
            {state.oaBasicId ? (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted">QR ให้ลูกค้าแอด OA ของร้าน</p>
                <img
                  alt="QR code สำหรับแอด LINE OA ของร้าน"
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`https://line.me/R/ti/p/${state.oaBasicId}`)}`}
                  width={180}
                  height={180}
                  className="rounded-xl border border-line bg-surface p-2"
                />
              </div>
            ) : null}
            <form action={runTest} className="mt-1">
              <NextButton>ทดสอบอีกครั้ง</NextButton>
            </form>
          </>
        ) : (
          <form action={runTest}>
            <NextButton>ทดสอบเชื่อมต่อ</NextButton>
          </form>
        )}
      </Step>
    </>
  );
}
