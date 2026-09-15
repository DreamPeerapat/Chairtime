/**
 * The handful of class strings and small pieces the admin screens share.
 *
 * They used to live at the bottom of resource-manager.tsx, which was fine
 * while that file held every tab. The hours editor moved out to keep each
 * component under the 200-line limit CLAUDE.md sets, and two files copying the
 * same class strings is how they drift apart.
 */
export const WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

export const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-800 dark:bg-slate-900 disabled:opacity-50';
export const primaryButton =
  'flex-1 rounded-xl bg-teal-700 py-3 text-sm font-medium text-white disabled:opacity-40';
export const secondaryButton =
  'rounded-xl border border-slate-200 px-5 py-3 text-sm dark:border-slate-800';
export const activeChip =
  'border-slate-900 bg-slate-900 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-900';
export const idleChip = 'border-slate-200 dark:border-slate-700';

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {children}
    </p>
  );
}
