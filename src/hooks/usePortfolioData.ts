/**
 * usePortfolioData — Fetches real on-chain portfolio data (balances, LP positions, trade history).
 */
import { useState, useCallback, useEffect } from 'react'
import { useWallet } from '../context/WalletContext'
import {
  fetchPoolReserves, fetchRecordsRobust, getRecordType, getRecordAmount,
  getRecordCredits, getRecordField, parseLeoInt,
  fetchUsdcxTokenRecords, totalUsdcxBalance,
  fetchRegistryTokenRecords, totalRegistryTokenBalance,
  getPublicAleoBalance, getMappingValue,
} from '../lib/aleo'
import { PROGRAMS, POOL_IDS, POOL_AMM_CONFIG, REGISTRY_TOKEN_IDS } from '../lib/programs'
import { isRecordManuallySpent } from '../lib/spentRecords'
import { getTradeHistory, type TradeEntry } from '../lib/tradeHistory'
import { fetchTokenPrices, getCachedPrice } from '../lib/prices'

export interface LPPositionData {
  poolId: number
  tokenA: string
  tokenB: string
  shares: bigint
  valueUsd: number
  tokenAAmount: number
  tokenBAmount: number
  sharePercent: number
}

export function usePortfolioData() {
  const { connected, address, requestRecords } = useWallet()
  const [loading, setLoading] = useState(false)
  const [lpPositions, setLpPositions] = useState<LPPositionData[]>([])
  const [trades, setTrades] = useState<TradeEntry[]>([])

  const fetchData = useCallback(async () => {
    if (!connected || !address || !requestRecords) return
    setLoading(true)

    try {
      await fetchTokenPrices()

      // Fetch LP positions from all AMM programs
      const lpResults: LPPositionData[] = []

      for (const [poolIdStr, config] of Object.entries(POOL_AMM_CONFIG)) {
        const poolId = Number(poolIdStr)
        try {
          const recs = await fetchRecordsRobust(requestRecords, config.program)
          const lpRecs = recs.filter((r: any) => {
            if (r.spent || isRecordManuallySpent(r)) return false
            const t = getRecordType(r)
            return t === 'LPPosition' || t === 'LP'
          })

          for (const lp of lpRecs) {
            const shares = getRecordAmount(lp, 'shares') || getRecordAmount(lp)
            if (shares <= 0n) continue

            try {
              const reserves = await fetchPoolReserves(poolId, config.program)
              if (reserves.totalShares > 0n) {
                const tokenAAmount = Number(shares * reserves.reserveA / reserves.totalShares) / 1e6
                const tokenBAmount = Number(shares * reserves.reserveB / reserves.totalShares) / 1e6
                const priceA = getCachedPrice(config.symbolA)
                const priceB = getCachedPrice(config.symbolB)
                const valueUsd = tokenAAmount * priceA + tokenBAmount * priceB
                const sharePercent = Number(shares * 10000n / reserves.totalShares) / 100

                lpResults.push({
                  poolId,
                  tokenA: config.symbolA,
                  tokenB: config.symbolB,
                  shares,
                  valueUsd,
                  tokenAAmount,
                  tokenBAmount,
                  sharePercent,
                })
              }
            } catch { /* pool reserves unavailable */ }
          }
        } catch { /* program records unavailable */ }
      }

      setLpPositions(lpResults)

      // Fetch trade history
      setTrades(getTradeHistory(address))

    } catch (e) {
      console.error('[Portfolio] Data fetch failed:', e)
    } finally {
      setLoading(false)
    }
  }, [connected, address, requestRecords])

  useEffect(() => {
    if (connected && address) {
      fetchData()
    }
  }, [connected, address, fetchData])

  return { loading, lpPositions, trades, refetch: fetchData }
}
