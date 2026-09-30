import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth';
import { db, schema } from '@/lib/db/client';
import { listFeedbackForAdmin } from '@/lib/feedback/queries';
import { setFeedbackPublished } from '@/lib/feedback/actions';
import { FeedbackList } from '@/components/admin/feedback-list';
import { PageBody, PageHeader, Stat } from '@/components/ui/page';

export const dynamic = 'force-dynamic';

export default async function FeedbackPage() {
  const session = await requireSession('manager');

  const [tenant] = await db
    .select({ timezone: schema.tenant.timezone })
    .from(schema.tenant)
    .where(eq(schema.tenant.id, session.tenantId));

  const rows = await listFeedbackForAdmin(session.tenantId, tenant?.timezone ?? 'Asia/Bangkok');

  // The average a customer sees, worked out the same way publicRating does:
  // published rows only, so the number here and the number on the shop's page
  // can never disagree.
  const published = rows.filter((r) => r.isPublished);
  const average =
    published.length === 0
      ? null
      : Math.round((published.reduce((sum, r) => sum + r.score, 0) / published.length) * 10) / 10;

  return (
    <PageBody>
      <PageHeader
        title="คะแนนจากลูกค้า"
        description="คะแนนที่ลูกค้าให้หลังใช้บริการ — คะแนนและความเห็นที่แสดงอยู่ ลูกค้าคนอื่นเห็นบนหน้าจองของร้าน"
      />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="คะแนนเฉลี่ย"
          value={average === null ? '—' : average.toFixed(1)}
          hint={average === null ? 'ยังไม่มีคะแนน' : `จาก ${published.length} รีวิวที่แสดงอยู่`}
          tone="brand"
        />
        <Stat label="ทั้งหมด" value={String(rows.length)} hint="รวมที่ซ่อนไว้" />
        <Stat
          label="ซ่อนไว้"
          value={String(rows.length - published.length)}
          hint="ไม่นับในคะแนนเฉลี่ย"
        />
      </dl>

      <FeedbackList rows={rows} onSetPublished={setFeedbackPublished} />
    </PageBody>
  );
}
