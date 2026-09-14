import Link from 'next/link';
import type { SetupProblem } from '@/lib/availability/diagnose';

/**
 * Where the owner goes to fix each kind of gap.
 *
 * `as const` rather than an annotated Record: typedRoutes checks Link hrefs
 * against the real route tree, and a widened `string` would not satisfy it.
 */
const FIX = {
  no_business_hours: { href: '/dashboard/settings', label: 'ตั้งเวลาทำการ' },
  no_services: { href: '/dashboard/services', label: 'เพิ่มบริการ' },
  no_resources: { href: '/dashboard/resources', label: 'เพิ่มช่างและอุปกรณ์' },
  missing_resource_type: { href: '/dashboard/resources', label: 'เพิ่มช่างและอุปกรณ์' },
  no_skilled_staff: { href: '/dashboard/resources', label: 'ระบุบริการที่ช่างทำได้' },
} as const satisfies Record<SetupProblem['code'], { href: string; label: string }>;

/**
 * The shop cannot be booked, and until this existed nothing said so — the
 * owner's calendar simply stayed empty while customers were told to try
 * another day. Rendered only when there is something to report.
 */
export function SetupWarning({ problems }: { problems: SetupProblem[] }) {
  if (problems.length === 0) return null;

  return (
    <div
      role="status"
      className="ct-enter rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/40"
    >
      <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
        ลูกค้ายังจองออนไลน์ไม่ได้
      </p>

      <ul className="mt-2 flex flex-col gap-1.5">
        {problems.map((problem) => (
          <li
            key={problem.code}
            className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-amber-800 dark:text-amber-300"
          >
            <span>• {problem.message}</span>
            <Link
              href={FIX[problem.code].href}
              className="font-medium text-amber-900 underline dark:text-amber-200"
            >
              {FIX[problem.code].label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
