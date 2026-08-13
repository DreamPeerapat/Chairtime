import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireSession } from '@/lib/auth';
import { loadWizardState, markStepDone, saveCredentials, testConnection, webhookUrlFor } from '@/lib/line/wizard';

export const dynamic = 'force-dynamic';

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

  async function runTest() {
    'use server';
    const active = await requireSession('manager');
    const result = await testConnection(active.tenantId);
    redirect(result.ok ? '/dashboard/settings/line?ok=1' : '/dashboard/settings/line?error=test');
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">เชื่อมต่อ LINE Official Account</h1>

      {ok ? <Banner tone="ok">ทดสอบสำเร็จ! ระบบเชื่อมต่อ LINE OA ของร้านแล้ว</Banner> : null}
      {error === 'invalid' ? <Banner tone="error">กรุณากรอก Token และ Secret ให้ครบ</Banner> : null}
      {error === 'test' ? <Banner tone="error">{state.lastError ?? 'ทดสอบเชื่อมต่อไม่สำเร็จ'}</Banner> : null}

      <Step n={1} title="สร้าง LINE Official Account" done={state.stepOaCreated}>
        <p>ถ้ายังไม่มี OA ของร้าน สร้างได้ที่ manager.line.biz</p>
        <a href="https://manager.line.biz/" target="_blank" rel="noreferrer" className="text-teal-700 underline">
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
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
            <input
              name="channelSecret"
              placeholder="Channel Secret"
              required
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-800 dark:bg-slate-900"
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
            <p className="text-teal-700 dark:text-teal-400">เชื่อมต่อสำเร็จ</p>
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
    </div>
  );
}

function Step(props: { n: number; title: string; done: boolean; locked?: boolean; children: React.ReactNode }) {
  return (
    <section
      className={`rounded-xl border px-4 py-3 text-sm ${props.done ? 'border-teal-600' : 'border-slate-200 dark:border-slate-800'} ${props.locked ? 'opacity-50' : ''}`}
    >
      <h2 className="mb-2 font-medium">
        {props.done ? '✓' : props.n}. {props.title}
      </h2>
      <div className="flex flex-col gap-2 text-xs text-slate-600 dark:text-slate-400">{props.children}</div>
    </section>
  );
}

function NextButton({ children }: { children: React.ReactNode }) {
  return <button type="submit" className="w-fit rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white">{children}</button>;
}

function Banner({ tone, children }: { tone: 'ok' | 'error'; children: React.ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300'
      : 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300';
  return <p className={`rounded-lg px-3 py-2 text-sm ${cls}`}>{children}</p>;
}
