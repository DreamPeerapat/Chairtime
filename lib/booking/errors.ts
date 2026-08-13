/** Postgres SQLSTATE for an EXCLUDE constraint violation. */
export const EXCLUSION_VIOLATION = '23P01';

export class SlotTakenError extends Error {
  readonly code = 'SLOT_TAKEN';
  constructor() {
    // User-facing copy is Thai; logs and comments stay English.
    super('ช่วงเวลานี้เพิ่งถูกจองไป กรุณาเลือกเวลาใหม่');
    this.name = 'SlotTakenError';
  }
}

export class SlotUnavailableError extends Error {
  readonly code = 'SLOT_UNAVAILABLE';
  constructor(message = 'ช่วงเวลาที่เลือกไม่ว่างแล้ว กรุณาเลือกเวลาใหม่') {
    super(message);
    this.name = 'SlotUnavailableError';
  }
}

export class BookingPolicyError extends Error {
  readonly code = 'POLICY';
  constructor(message: string) {
    super(message);
    this.name = 'BookingPolicyError';
  }
}

/**
 * Drizzle wraps driver errors in a DrizzleQueryError, so the SQLSTATE from
 * postgres.js sits on `cause` rather than on the error itself. Walk the chain
 * instead of trusting the top-level object — missing this is what lets a raw
 * 23P01 escape to the customer as a 500.
 */
export function isExclusionViolation(error: unknown): boolean {
  return findSqlState(error) === EXCLUSION_VIOLATION;
}

export function findSqlState(error: unknown, depth = 5): string | undefined {
  let current = error;
  for (let i = 0; i <= depth; i += 1) {
    if (typeof current !== 'object' || current === null) return undefined;
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
