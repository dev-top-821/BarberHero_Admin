// Single source of truth for the manual-withdraw economics. The Flutter
// wallet UI fetches these from /api/v1/wallet so it doesn't have to keep
// its own copy in sync.

export const MIN_WITHDRAWAL_PENCE = 1000; // £10
export const WITHDRAWAL_FEE_PENCE = 50;   // 50p — flat fee on the instant path.
