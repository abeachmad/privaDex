/**
 * useMyLpPositions — Fetches real LP share records from all AMM programs on-chain.
 *
 * For each AMM program, fetches the user's LP records via fetchRecordsRobust,
 * parses pool_id + amount (shares), then cross-references with pool reserves
 * to compute the user's token amounts and USD value.
 */
import { useState, useEffect, useCallback } from 'react'
import { useWallet } from '../context/WalletContext'
import {
  fetchRecordsRobust, fetchPoolReserves,
  getRecordField, getRecordAmount, parseLeoInt,
} from '../lib/aleo'
import { PROGRAMS, POOL_AMM_CONFIG, POOL_IDS } from '../lib/programs'
import { getCachedPrice, fetchTokenPrices } from '../lib/prices'
import { calculateFeeEarned } from '../lib/lpTracker'
import type { LPPosition } from '../data/tokens'

// All unique AMM programs that can hold LP share records
const AMM_PROGRAMS = [
  PROGRAMS.AMM,
  PROGRAMS.AMM_BTCX,
  PROGRAMS.AMM_ETHX,
  PROGRAMS.AMM_NATIVE_BTCX,
  PROGRAMS.AMM_NATIVE_ETHX,
  PROGRAMS.AMM_BTCX_ETHX,
] as const

// Map numeric pool IDs to string pool IDs used in the UI
const POOL_ID_TO_STRING: Record<number, string> = {
  [POOL_IDS.ALEO_USDCX]: 'aleo-usdcx',
  [POOL_IDS.BTCX_USDCX]: 'btcx-usdcx',
  [POOL_IDS.ETHX_USDCX]: 'ethx-usdcx',
  [POOL_IDS.ALEO_BTCX]:  'aleo-btcx',
  [POOL_IDS.ALEO_ETHX]:  'aleo-ethx',
  [POOL_IDS.BTCX_ETHX]:  'btcx-ethx',
}

// Map AMM program → which numeric pool IDs it can hold
const PROGRAM_POOL_IDS: Record<string, number[]> = {
  [PROGRAMS.AMM]:            [POOL_IDS.ALEO_USDCX],
  [PROGRAMS.AMM_BTCX]:       [POOL_IDS.BTCX_USDCX],
  [PROGRAMS.AMM_ETHX]:       [POOL_IDS.ETHX_USDCX],
  [PROGRAMS.AMM_NATIVE_BTCX]: [POOL_IDS.ALEO_BTCX],
  [PROGRAMS.AMM_NATIVE_ETHX]: [POOL_IDS.ALEO_ETHX],
  [PROGRAMS.AMM_BTCX_ETHX]:   [POOL_IDS.BTCX_ETHX],
}

export interface LpPositionWithRecord extends LPPosition {
  shares: bigint
  recordPlaintext: string
  numericPoolId: number
}

export function useMyLpPositions() {
  const { connected, address, requestRecords } = useWallet()
  const [positions, setPositions] = useState<LpPositionWithRecord[]>([])
  const [loading, setLoading] = useState(false)

  const fetchPositions = useCallback(async () => {
    if (!connected || !address || !requestRecords) {
      setPositions([])
      return
    }

    setLoading(true)
    try {
      await fetchTokenPrices()

      const results: LpPositionWithRecord[] = []

      // Fetch LP records from all AMM programs in parallel
      const recordsByProgram = await Promise.all(
        AMM_PROGRAMS.map(async (program) => {
          try {
            const recs = await fetchRecordsRobust(requestRecords, program)
            return { program, records: recs }
          } catch {
            return { program, records: [] }
          }
        })
      )

      for (const { program, records } of recordsByProgram) {
        // Filter for LP share records (unspent, with shares > 0)
        const lpRecords = records.filter((r: any) => {
          if (r.spent) return false
          const typeName = (r.recordName || r.type || '').toLowerCase()
          // LP records: old contracts use "LpShare", new contracts use "LPPosition"
          const hasPoolId = getRecordField(r, 'pool_id') !== undefined
          const isLpType = typeName.includes('lp') || typeName.includes('share') || typeName.includes('position')
          // If it has pool_id, it's likely an LP record regardless of type name
          return hasPoolId || isLpType
        })

        // Known pool IDs for this program
        const knownPoolIds = PROGRAM_POOL_IDS[program] || []

        for (const rec of lpRecords) {
          // Parse pool_id from record
          const poolIdRaw = getRecordField(rec, 'pool_id')
          let numericPoolId: number

          if (poolIdRaw) {
            numericPoolId = Number(parseLeoInt(poolIdRaw))
          } else if (knownPoolIds.length === 1) {
            // Single-pool AMM program: infer pool_id
            numericPoolId = knownPoolIds[0]
          } else {
            continue // Can't determine pool
          }

          // Get shares amount
          // New contracts use 'shares', old contracts use 'amount'
          const shares = getRecordAmount(rec, 'shares') || getRecordAmount(rec, 'amount')
          if (shares <= 0n) continue

          const stringPoolId = POOL_ID_TO_STRING[numericPoolId]
          if (!stringPoolId) continue

          const config = POOL_AMM_CONFIG[numericPoolId]
          if (!config) continue

          // Get record plaintext for remove_liquidity calls
          const recordPlaintext = rec.recordPlaintext ?? rec.plaintext ?? ''

          // Fetch pool reserves to calculate position value
          try {
            const reserves = await fetchPoolReserves(numericPoolId, config.program)

            if (reserves.totalShares <= 0n) continue

            const tokenAAmount = Number(shares * reserves.reserveA / reserves.totalShares) / 1e6
            const tokenBAmount = Number(shares * reserves.reserveB / reserves.totalShares) / 1e6
            const sharePercent = Number(shares * 10000n / reserves.totalShares) / 100 // percentage

            const priceA = getCachedPrice(config.symbolA)
            const priceB = getCachedPrice(config.symbolB)
            const valueUsd = tokenAAmount * priceA + tokenBAmount * priceB

            results.push({
              poolId: stringPoolId,
              tokenA: config.symbolA,
              tokenB: config.symbolB,
              sharePercent,
              valueUsd,
              earnedFees: address ? calculateFeeEarned(address, stringPoolId, valueUsd) : 0,
              tokenAAmount,
              tokenBAmount,
              shares,
              recordPlaintext,
              numericPoolId,
            })
          } catch {
            // Can't fetch reserves, skip this position
            console.warn(`[useMyLpPositions] Failed to fetch reserves for pool ${numericPoolId}`)
          }
        }
      }

      setPositions(results)
    } catch (e) {
      console.error('[useMyLpPositions] Failed:', e)
    } finally {
      setLoading(false)
    }
  }, [connected, address, requestRecords])

  useEffect(() => {
    fetchPositions()
    // Refresh when transactions complete
    const handler = () => setTimeout(fetchPositions, 5_000)
    window.addEventListener('privadex:balanceRefresh', handler)
    window.addEventListener('privadex:txEnd', handler)
    return () => {
      window.removeEventListener('privadex:balanceRefresh', handler)
      window.removeEventListener('privadex:txEnd', handler)
    }
  }, [fetchPositions])

  return { positions, loading, refetch: fetchPositions }
}
