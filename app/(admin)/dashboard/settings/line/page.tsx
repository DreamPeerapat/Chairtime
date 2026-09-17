import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import {
  liffEndpointFor,
  liffUrlFor,
  loadWizardState,
  markStepDone,
  saveCredentials,
  saveLiffId,
  testConnection,
  webhookUrlFor,
} from '@/lib/line/wizard';
import { ownerLinkState, regenerateOwnerLink } from '@/lib/line/owner-link';
import { installOwnerMenu, ownerMenuState, removeOwnerMenu } from '@/lib/line/owner-menu';

export const dynamic = 'force-dynamic';

const liffIdSchema = z
  .string()
  .trim()
  .regex(/^\d{10}-[0-9a-zA-Z]+$/, 'รูปแบบ LIFF ID ไม่ถูกต้อง');

const credentialsSchema = z.object({
  channelAccessToken: z.string().trim().min(10, 'กรุณาวาง Channel Access Token ให้ครบ'),
  channelSecret: z.string().trim().min(10, 'กรุณาวาง Channel Secret ให้ครบ'),
});

export default async function LineConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession('manager');
  const { error, ok } = await searchParams;
  const state = await loadWizardState(session.tenantId);
  const webhookUrl = state.webhookUrl ?? webhookUrlFor(session.tenantSlug);
  const liffEndpoint = liffEndpointFor(session.tenantSlug);
  const liffUrl = state.liffId ? liffUrlFor(state.liffId) : null;
  const ownerLink = await ownerLinkState(session.tenantId);
  const ownerMenu = await ownerMenuState(session.tenantId);

  async function step(name: 'stepOaCreated' | 'stepApiEnabled') {
    'use server';
    const active = await requireSession('manager');
    await markStepDone(active.tenantId, name);
    redirect('/dashboard/settings/line');
  }

  async function saveToken(formData: FormData) {
    'use server';
    const active = await requireSession('manager');
    const parsed = credentialsSchema.safeParse({
      channelAccessToken: formData.get('channelAccessToken'),
      channelSecret: formData.get('channelSecret'),
    });
    if (!parsed.success) redirect('/dashboard/settings/line?error=invalid');
    await saveCredentials(active.tenantId, active.tenantSlug, parsed.data.channelAccessToken, parsed.data.channelSecret);
    redirect('/dashboard/settings/line');
  }

  async function saveLiff(formData: FormData) {
    'use server';
    const active = await requireSession('manager');
    // A LIFF id looks like "1234567890-abcdefgh". Rejecting anything else here
    // saves the shop from a silently broken link they cannot see is broken.
    const parsed = liffIdSchema.safeParse(formData.get('liffId'));
    if (!parsed.success) redirect('/dashboard/settings/line?error=liff');
    await saveLiffId(active.tenantId, parsed.data);
    redirect('/dashboard/settings/line');
  }

  async function runTest() {
    'use server';
    const active = await requireSession('manager');
    const result = await testConnection(active.tenantId);
    redirect(result.ok ? '/dashboard/settings/line?ok=1' : '/dashboard/settings/line?error=test');
  }

  async function newOwnerCode() {
    'use server';
    const active = await requireSession('owner');
    await regenerateOwnerLink(active.tenantId);
    redirect('/dashboard/settings/line');
  }

  async function buildOwnerMenu() {
    'use server';
    const active = await requireSession('owner');
    const result = await installOwnerMenu(active.tenantId);
    redirect(`/dashboard/settings/line?${result.ok ? 'ok=menu' : 'error=menu'}`);
  }

  async function dropOwnerMenu() {
    'use server';
    const active = await requireSession('owner');
    await removeOwnerMenu(active.tenantId);
    redirect('/dashboard/settings/line');
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">เชื่อมต่อ LINE Official Account</h1>

      {ok === 'menu' ? (
        <Banner tone="ok">สร้างเมนูเจ้าของร้านแล้ว เปิดแชท LINE ของร้านดูได้เลย</Banner>
      ) : ok ? (
        <Banner tone="ok">ทดสอบสำเร็จ! ระบบเชื่อมต่อ LINE OA ของร้านแล้ว</Banner>
      ) : null}
      {error === 'menu' ? (
        <Banner tone="error">
          สร้างเมนูไม่สำเร็จ — ตรวจว่าเชื่อม LINE OA และผูกบัญชีเจ้าของร้านครบแล้ว
        </Banner>
      ) : null}
      {error === 'invalid' ? <Banner tone="error">กรุณากรอก Token และ Secret ให้ครบ</Banner> : null}
      {error === 'test' ? <Banner tone="error">{state.lastError ?? 'ทดสอบเชื่อมต่อไม่สำเร็จ'}</Banner> : null}
      {error === 'liff' ? (
        <Banner tone="error">LIFF ID ไม่ถูกต้อง ต้องเป็นรูปแบบ 1234567890-abcdefgh</Banner>
      ) : null}

      <Step n={1} title="สร้าง LINE Official Account" done={state.stepOaCreated}>
        <p>ถ้ายังไม่มี OA ของร้าน สร้างได้ที่ manager.line.biz</p>
        <a href="https://manager.line.biz/" target="_blank" rel="noreferrer" className="text-brand underline">
          เปิด LINE Official Account Manager
        </a>
        {!state.stepOaCreated && (
          <form action={step.bind(null, 'stepOaCreated')}>
            <NextButton>ทำแล้ว ถัดไป</NextButton>
          </form>
        )}
      </Step>

      <Step n={2} title="เปิด Messaging API" done={state.stepApiEnabled} locked={!state.stepOaCreated}>
        <p>ไปที่ Settings → Messaging API → Enable Messaging API แล้วเลือกหรือสร้าง Provider</p>
        <p className="text-amber-600 dark:text-amber-400">
          แนะนำให้ปิด &quot;Auto-reply messages&quot; และ &quot;Greeting messages&quot; ใน LINE OA Manager
          ไม่งั้นจะชนกับข้อความที่ระบบส่งเอง
        </p>
        {state.stepOaCreated && !state.stepApiEnabled && (
          <form action={step.bind(null, 'stepApiEnabled')}>
            <NextButton>ทำแล้ว ถัดไป</NextButton>
          </form>
        )}
      </Step>

      <Step n={3} title="คัดลอก Token และ Secret" done={state.stepTokenSaved} locked={!state.stepApiEnabled}>
        <p>
          วาง Webhook URL นี้ใน LINE Developers Console → Messaging API → Webhook URL แล้วเปิด &quot;Use webhook&quot;
        </p>
        <code className="block break-all rounded-lg bg-slate-100 px-3 py-2 text-xs dark:bg-slate-900">{webhookUrl}</code>
        {state.stepApiEnabled && (
          <form action={saveToken} className="flex flex-col gap-2">
            <input
              name="channelAccessToken"
              placeholder="Channel Access Token"
              required
              className="rounded-lg border border-line px-3 py-2 text-sm dark:bg-slate-900"
            />
            <input
              name="channelSecret"
              placeholder="Channel Secret"
              required
              className="rounded-lg border border-line px-3 py-2 text-sm dark:bg-slate-900"
            />
            <NextButton>บันทึก</NextButton>
          </form>
        )}
      </Step>

      <Step n={4} title="ทดสอบเชื่อมต่อ" done={state.isVerified} locked={!state.stepTokenSaved}>
        {state.stepTokenSaved && !state.isVerified && (
          <form action={runTest}>
            <NextButton>ทดสอบเชื่อมต่อ</NextButton>
          </form>
        )}
        {state.isVerified && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-brand dark:text-teal-400">เชื่อมต่อสำเร็จ</p>
            {state.oaBasicId && (
              <img
                alt="QR code สำหรับร้าน"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`https://line.me/R/ti/p/${state.oaBasicId}`)}`}
                width={180}
                height={180}
              />
            )}
            <form action={runTest}>
              <NextButton>ทดสอบอีกครั้ง</NextButton>
            </form>
          </div>
        )}
      </Step>

      {/* Without this the OA still sends a booking link, but it opens an
          ordinary browser — the booking then carries no LINE identity, so the
          shop ends up with a phone number and no way to reply on LINE. */}
      <Step n={5} title="เปิดหน้าจองใน LINE (LIFF)" done={Boolean(state.liffId)} locked={!state.isVerified}>
        <p className="mb-2 text-muted">
          ขั้นนี้ทำให้ลูกค้าจองในแอป LINE ได้เลย ร้านจะได้บัญชี LINE ของลูกค้าไว้ส่งคำยืนยัน
          เตือนนัด และตอบกลับ — ถ้าไม่ทำ ลูกค้ายังจองได้ แต่ร้านจะได้แค่เบอร์โทร
        </p>

        <ol className="mb-3 list-decimal space-y-1 pl-4 text-xs text-muted">
          <li>
            เปิด <span className="font-medium">developers.line.biz</span> → เลือก Provider →
            แท็บ <span className="font-medium">LIFF</span> → Add
          </li>
          <li>
            Size เลือก <span className="font-medium">Full</span>, Scope ติ๊ก{' '}
            <span className="font-medium">profile</span> และ{' '}
            <span className="font-medium">openid</span>
          </li>
          <li>
            Endpoint URL ใส่ค่านี้
            <code className="mt-1 block rounded bg-slate-100 px-2 py-1 break-all dark:bg-slate-800">
              {liffEndpoint}
            </code>
          </li>
          <li>คัดลอก LIFF ID ที่ได้มาวางด้านล่าง</li>
        </ol>

        {state.isVerified && (
          <form action={saveLiff} className="flex flex-col gap-2">
            <input
              name="liffId"
              defaultValue={state.liffId ?? ''}
              placeholder="1234567890-abcdefgh"
              className="w-full rounded-lg border border-line px-3 py-2 font-mono text-sm dark:bg-slate-900"
            />
            <NextButton>{state.liffId ? 'บันทึกใหม่' : 'บันทึก LIFF ID'}</NextButton>
          </form>
        )}
      </Step>

      {/* The owner's own phone. Their staff login is a LINE identity too, but
          one issued by our provider — the shop's OA cannot address it. So the
          owner proves which chat is theirs by sending a code to it. */}
      {state.isVerified ? (
        <Step n={6} title="ให้ร้านรู้ทันเมื่อลูกค้าจองหรือยกเลิก" done={ownerLink.linked}>
          {ownerLink.linked ? (
            <>
              <p className="text-brand dark:text-teal-400">
                เชื่อมกับ LINE ของเจ้าของร้านแล้ว
              </p>
              <p>
                เมื่อลูกค้าจองคิวเองหรือกดยกเลิกคิว ระบบจะส่งข้อความเข้า LINE เครื่องนั้นให้อัตโนมัติ
              </p>
              <form action={newOwnerCode}>
                <button
                  type="submit"
                  className="w-fit rounded-lg border border-line px-3 py-1.5 text-xs"
                >
                  เปลี่ยนไปใช้เครื่องอื่น
                </button>
              </form>

              {/* Only the owner's own chat gets this menu, so a customer is
                  never offered a back-office button that refuses them. */}
              <div className="mt-2 border-t border-line pt-3">
                <p className="font-medium text-slate-700 dark:text-slate-200">
                  เมนูลัดในแชท LINE ของคุณ
                </p>
                <p className="mt-0.5">
                  ใส่ปุ่ม ตารางคิว · สรุปยอด · ลูกค้า · จัดการร้าน ไว้ใต้ห้องแชท
                  — เห็นเฉพาะเครื่องที่ผูกไว้ ลูกค้ายังเห็นเมนูจองคิวเหมือนเดิม
                </p>

                {ownerMenu.installed ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-brand dark:text-teal-400">ติดตั้งแล้ว</span>
                    <form action={buildOwnerMenu}>
                      <button
                        type="submit"
                        className="rounded-lg border border-line px-3 py-1.5 text-xs"
                      >
                        สร้างใหม่
                      </button>
                    </form>
                    <form action={dropOwnerMenu}>
                      <button type="submit" className="px-1 text-xs text-muted underline">
                        เอาออก
                      </button>
                    </form>
                  </div>
                ) : (
                  <form action={buildOwnerMenu} className="mt-2">
                    <button
                      type="submit"
                      className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-contrast"
                    >
                      สร้างเมนูเจ้าของร้าน
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : (
            <>
              <p>
                เปิดแชท LINE ของร้าน (แอด OA ของร้านเป็นเพื่อนก่อน)
                แล้วพิมพ์รหัสนี้ส่งเข้าไปจากเครื่องที่อยากให้แจ้งเตือน
              </p>
              <code className="block w-fit rounded-lg bg-slate-100 px-4 py-2 font-mono text-lg tracking-widest dark:bg-slate-900">
                {ownerLink.code ?? '—'}
              </code>
              <p className="text-muted">
                ส่งได้ครั้งเดียว หลังจากนั้นรหัสจะหมดอายุทันที
                — คนอื่นที่เห็นรหัสทีหลังจะแย่งการแจ้งเตือนไปไม่ได้
              </p>
            </>
          )}
        </Step>
      ) : null}

      {/* The last mile. Everything above is plumbing the shop cannot see the
          point of until a customer can actually reach the booking page, and a
          rich menu is how they reach it — a button that sits under the chat
          permanently rather than a keyword nobody knows to type. */}
      {state.liffId ? (
        <Step n={7} title="ใส่ปุ่มจองคิวใน Rich menu" done={false}>
          <p className="mb-2 text-muted">
            ปุ่มนี้จะค้างอยู่ใต้ห้องแชทตลอด ลูกค้าจึงกดจองได้โดยไม่ต้องจำว่าต้องพิมพ์อะไร
          </p>

          <p className="mb-1 text-xs font-medium text-muted">
            ลิงก์สำหรับวางใน Rich menu
          </p>
          <code className="mb-3 block rounded-lg bg-slate-100 px-3 py-2 text-xs break-all dark:bg-slate-900">
            {liffUrl}
          </code>

          {/* The step used to stop here, at "upload a 2500x1686 image" — which
              for a salon owner with no design tool is where the setup ends.
              The product draws one, labelled to match the keywords the webhook
              already answers. */}
          <p className="mb-1 text-xs font-medium text-muted">
            รูปปุ่มสำหรับ Rich menu
          </p>
          <a
            href="/dashboard/settings/line/rich-menu.png"
            download="chairtime-rich-menu.png"
            className="mb-3 inline-block rounded-lg border border-line px-3 py-2 text-xs"
          >
            ดาวน์โหลดรูปปุ่ม (2500 × 1686)
          </a>

          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted">
            <li>
              เปิด <span className="font-medium">manager.line.biz</span> → เลือก OA ของร้าน
            </li>
            <li>
              เมนูซ้าย <span className="font-medium">Rich menu</span> → <span className="font-medium">Create</span>
            </li>
            <li>
              เลือก Template แบบ <span className="font-medium">แถบบนเต็ม 1 ช่อง + แถวล่าง 3 ช่อง</span>{' '}
              ให้ตรงกับรูป แล้วอัปโหลดรูปที่ดาวน์มา
              — ถ้าไม่มี ให้ใช้แบบ 6 ช่อง แล้วตั้งสามช่องบนให้ชี้ไปที่ลิงก์เดียวกัน
            </li>
            <li>
              ช่องที่จะให้กดจอง เลือก Action เป็น <span className="font-medium">Link</span> แล้ววาง URL ด้านบน
            </li>
            <li>
              ตั้ง <span className="font-medium">Display period</span> ให้ครอบวันนี้ แล้วกด Save —
              ถ้าไม่ตั้ง เมนูจะไม่ขึ้น
            </li>
          </ol>

          <a
            href="https://manager.line.biz/"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-brand underline dark:text-teal-400"
          >
            เปิด LINE Official Account Manager
          </a>
        </Step>
      ) : null}
    </div>
  );
}

function Step(props: { n: number; title: string; done: boolean; locked?: boolean; children: React.ReactNode }) {
  return (
    <section
      className={`rounded-xl border px-4 py-3 text-sm ${props.done ? 'border-brand' : 'border-line'} ${props.locked ? 'opacity-50' : ''}`}
    >
      <h2 className="mb-2 font-medium">
        {props.done ? '✓' : props.n}. {props.title}
      </h2>
      <div className="flex flex-col gap-2 text-xs text-muted">{props.children}</div>
    </section>
  );
}

function NextButton({ children }: { children: React.ReactNode }) {
  return <button type="submit" className="w-fit rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-brand-contrast">{children}</button>;
}

function Banner({ tone, children }: { tone: 'ok' | 'error'; children: React.ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'bg-teal-50 text-brand dark:bg-teal-950 dark:text-teal-300'
      : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
  return <p className={`rounded-lg px-3 py-2 text-sm ${cls}`}>{children}</p>;
}
