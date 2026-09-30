import { Badge, Card, EmptyState, Rows, Row } from '@/components/ui/page';
import type { FeedbackRow } from '@/lib/feedback/queries';

/**
 * Every rating the shop has had, newest first.
 *
 * Hidden ones stay in the list rather than disappearing into a second tab: a
 * shop that has hidden a review should be reminded it did, and the customer's
 * words are not deleted by anyone here. Hiding only takes it off the public
 * page and out of the average.
 *
 * A server component with two plain forms — nothing on this screen needs to
 * change without a round trip.
 */
export function FeedbackList({
  rows,
  onSetPublished,
}: {
  rows: FeedbackRow[];
  onSetPublished: (formData: FormData) => Promise<void>;
}) {
  if (rows.length === 0) {
    return (
      <Card padded={false}>
        <EmptyState
          title="ยังไม่มีคะแนนจากลูกค้า"
          description="คะแนนจะเข้ามาหลังจากกดเสร็จสิ้นให้คิวที่ใช้บริการแล้ว — เปิดการส่งข้อความขอคะแนนได้ในหน้าตั้งค่า"
        />
      </Card>
    );
  }

  return (
    <Card padded={false}>
      <Rows>
        {rows.map((row) => (
          <Row
            key={row.id}
            title={
              <span className="flex items-center gap-2">
                <span aria-label={`${row.score} จาก 5 คะแนน`}>
                  {'★'.repeat(row.score)}
                  <span className="text-line">{'★'.repeat(5 - row.score)}</span>
                </span>
                {row.isPublished ? null : <Badge tone="warn">ซ่อนอยู่</Badge>}
              </span>
            }
            meta={[
              row.customerName ?? 'ลูกค้าหน้าร้าน',
              `คิว ${row.bookingCode}`,
              // Only when there was somebody to rate. The shop's own word for
              // the job is on the page heading, so it is not repeated here.
              row.staffScore === null ? null : `ผู้ให้บริการ ${row.staffScore}/5`,
              row.createdAt.toFormat('d LLL yy HH:mm'),
            ]
              .filter(Boolean)
              .join(' · ')}
            onClickAction={
              <form action={onSetPublished} className="shrink-0">
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="publish" value={row.isPublished ? 'false' : 'true'} />
                <button
                  type="submit"
                  className="ct-press h-11 rounded-xl border border-line px-4 text-xs whitespace-nowrap hover:bg-surface-muted"
                >
                  {row.isPublished ? 'ซ่อนจากหน้าร้าน' : 'แสดงอีกครั้ง'}
                </button>
              </form>
            }
          >
            {row.comment ? (
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{row.comment}</p>
            ) : null}
          </Row>
        ))}
      </Rows>
    </Card>
  );
}
