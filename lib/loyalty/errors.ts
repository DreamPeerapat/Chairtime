export class BelowMinimumRedeemError extends Error {
  readonly code = 'BELOW_MIN_REDEEM';
  constructor(minPoints: number) {
    super(`ใช้แต้มขั้นต่ำ ${minPoints} แต้ม`);
    this.name = 'BelowMinimumRedeemError';
  }
}

export class ExceedsMaxRedeemPercentError extends Error {
  readonly code = 'EXCEEDS_MAX_REDEEM';
  constructor(maxPercent: number) {
    super(`ใช้แต้มได้ไม่เกิน ${maxPercent}% ของยอดบิล`);
    this.name = 'ExceedsMaxRedeemPercentError';
  }
}

export class InsufficientPointsError extends Error {
  readonly code = 'INSUFFICIENT_POINTS';
  constructor() {
    super('แต้มไม่พอ');
    this.name = 'InsufficientPointsError';
  }
}

/**
 * The pre-check said the customer had enough points, but summing the lots
 * that are actually still spendable came up short — `customer.point_balance`
 * has drifted from `point_lot`. Iron rule #2 requires the two to always
 * agree, so this means a bug elsewhere, not a normal "not enough points".
 */
export class PointBalanceMismatchError extends Error {
  readonly code = 'POINT_BALANCE_MISMATCH';
  constructor(customerId: string) {
    super(`point_balance ไม่ตรงกับ point_lot ของลูกค้า ${customerId}`);
    this.name = 'PointBalanceMismatchError';
  }
}
