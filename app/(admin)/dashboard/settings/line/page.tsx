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
import { Banner, LineJourney, type JourneyStep } from '@/components/admin/line-wizard';
import { LineConnectSteps } from '@/components/admin/line-connect-steps';
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

      <LineConnectSteps
        state={state}
        webhookUrl={webhookUrl}
        markOaCreated={step.bind(null, 'stepOaCreated')}
        markApiEnabled={step.bind(null, 'stepApiEnabled')}
        saveToken={saveToken}
        runTest={runTest}
      />

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
