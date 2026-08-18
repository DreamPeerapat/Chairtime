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

export class RewardNotEligibleError extends Error {
  readonly code = 'REWARD_NOT_ELIGIBLE';
  constructor(message = 'ไม่สามารถแลกของรางวัลนี้ได้') {
    super(message);
    this.name = 'RewardNotEligibleError';
  }
}

export class RewardOutOfStockError extends Error {
  readonly code = 'REWARD_OUT_OF_STOCK';
  constructor() {
    super('ของรางวัลนี้หมดแล้ว');
    this.name = 'RewardOutOfStockError';
  }
}

export class RewardCodeNotFoundError extends Error {
  readonly code = 'REWARD_CODE_NOT_FOUND';
  constructor() {
    super('ไม่พบโค้ดนี้');
    this.name = 'RewardCodeNotFoundError';
  }
}

export class RewardCodeAlreadyUsedError extends Error {
  readonly code = 'REWARD_CODE_ALREADY_USED';
  constructor(status: string) {
    super(status === 'used' ? 'โค้ดนี้ถูกใช้ไปแล้ว' : 'โค้ดนี้ใช้ไม่ได้แล้ว');
    this.name = 'RewardCodeAlreadyUsedError';
  }
}

export class RewardCodeExpiredError extends Error {
  readonly code = 'REWARD_CODE_EXPIRED';
  constructor() {
    super('โค้ดนี้หมดอายุแล้ว');
    this.name = 'RewardCodeExpiredError';
  }
}
