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
import { PageBody, PageHeader } from '@/components/ui/page';
import {
  Banner,
  Copy,
  LineJourney,
  NextButton,
  Phase,
  Step,
  Steps,
  Term,
  type JourneyStep,
} from '@/components/admin/line-wizard';
import { LineLaunchSteps } from '@/components/admin/line-launch-steps';

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

  const journey: JourneyStep[] = [
    { n: 1, label: 'สร้าง OA', done: state.stepOaCreated },
    { n: 2, label: 'เปิด Messaging API', done: state.stepApiEnabled },
    { n: 3, label: 'ใส่ Token', done: state.stepTokenSaved },
    { n: 4, label: 'ทดสอบ', done: state.isVerified },
    { n: 5, label: 'หน้าจองใน LINE', done: Boolean(state.liffId) },
    { n: 6, label: 'ปุ่มจองในแชท', done: null },
    { n: 7, label: 'แจ้งเตือนเจ้าของร้าน', done: ownerLink.linked },
  ];

  return (
    <PageBody>
      <PageHeader
        title="เชื่อมต่อ LINE Official Account"
        description="ทำครั้งเดียว ทำตามลำดับได้เลย — ขั้นที่เสร็จแล้วจะพับเก็บให้ กดดูย้อนหลังได้ตลอด"
      />

      <LineJourney steps={journey} />

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
          <form action={step.bind(null, 'stepOaCreated')} className="mt-1">
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
          <form action={step.bind(null, 'stepApiEnabled')} className="mt-1">
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

      <LineLaunchSteps
        isVerified={state.isVerified}
        liffId={state.liffId}
        liffEndpoint={liffEndpoint}
        liffUrl={liffUrl}
        ownerLink={ownerLink}
        ownerMenu={ownerMenu}
        saveLiff={saveLiff}
        newOwnerCode={newOwnerCode}
        buildOwnerMenu={buildOwnerMenu}
        dropOwnerMenu={dropOwnerMenu}
      />
    </PageBody>
  );
}
