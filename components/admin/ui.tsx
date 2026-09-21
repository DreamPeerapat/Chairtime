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
  'w-full rounded-lg border border-line px-3 py-2.5 text-sm disabled:opacity-50';
export const primaryButton =
  'flex-1 rounded-xl bg-brand py-3 text-sm font-medium text-brand-contrast disabled:opacity-40';
export const secondaryButton =
  'rounded-xl border border-line px-5 py-3 text-sm';
export const activeChip =
  'border-brand bg-brand text-brand-contrast';
export const idleChip = 'border-line';

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
      {children}
    </p>
  );
}
