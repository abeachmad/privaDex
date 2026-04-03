/**
 * LP Deposit Tracker — Tracks deposit value for fee earned calculation.
 *
 * When a user adds liquidity, we record the USD value of their deposit.
 * Fee earned = current position value - deposit value.
 */

const STORAGE_PREFIX = 'privadex_lp_deposits_'

export interface LpDepositRecord {
  poolId: string
  depositValueUsd: number
  depositTokenA: number
  depositTokenB: number
  shares: string // bigint as string
  timestamp: number
}

function getKey(address: string): string {
  return `${STORAGE_PREFIX}${address}`
}

export function getLpDeposits(address: string): LpDepositRecord[] {
  try {
    return JSON.parse(localStorage.getItem(getKey(address)) || '[]')
  } catch {
    return []
  }
}

export function recordLpDeposit(
  address: string,
  poolId: string,
  depositValueUsd: number,
  depositTokenA: number,
  depositTokenB: number,
  shares: bigint,
) {
  const deposits = getLpDeposits(address)
  deposits.push({
    poolId,
    depositValueUsd,
    depositTokenA,
    depositTokenB,
    shares: shares.toString(),
    timestamp: Date.now(),
  })
  localStorage.setItem(getKey(address), JSON.stringify(deposits))
}

export function getTotalDepositValue(address: string, poolId: string): number {
  return getLpDeposits(address)
    .filter(d => d.poolId === poolId)
    .reduce((sum, d) => sum + d.depositValueUsd, 0)
}

export function clearPoolDeposits(address: string, poolId: string) {
  const deposits = getLpDeposits(address).filter(d => d.poolId !== poolId)
  localStorage.setItem(getKey(address), JSON.stringify(deposits))
}

export function calculateFeeEarned(
  address: string,
  poolId: string,
  currentValueUsd: number,
): number {
  const totalDeposited = getTotalDepositValue(address, poolId)
  if (totalDeposited <= 0) return 0
  const earned = currentValueUsd - totalDeposited
  return earned > 0 ? earned : 0
}
