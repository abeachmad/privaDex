/**
 * useOnChainPools — Fetches real pool reserves from Aleo testnet.
 * Falls back to mock data when on-chain data unavailable.
 *
 * Volume tracking: detects swaps by monitoring reserve changes.
 * When one reserve goes up and the other goes down, it's a swap.
 * This captures ALL users' swaps since reserves are public mappings.
 */
import { useState, useEffect, useCallback } from 'react'
import { fetchPoolReserves, fetchPoolMetrics } from '../lib/aleo'
import { POOL_IDS, POOL_AMM_CONFIG } from '../lib/programs'
import { getCachedPrice, fetchTokenPrices } from '../lib/prices'
import { POOLS as MOCK_POOLS, type Pool } from '../data/tokens'

// Map string pool IDs to numeric POOL_IDS
const POOL_MAP: Record<string, { numericId: number; program: string; symbolA: string; symbolB: string }> = {
  'aleo-usdcx': { numericId: POOL_IDS.ALEO_USDCX, ...pick(POOL_AMM_CONFIG[POOL_IDS.ALEO_USDCX]) },
  'btcx-usdcx': { numericId: POOL_IDS.BTCX_USDCX, ...pick(POOL_AMM_CONFIG[POOL_IDS.BTCX_USDCX]) },
  'ethx-usdcx': { numericId: POOL_IDS.ETHX_USDCX, ...pick(POOL_AMM_CONFIG[POOL_IDS.ETHX_USDCX]) },
  'aleo-btcx':  { numericId: POOL_IDS.ALEO_BTCX,  ...pick(POOL_AMM_CONFIG[POOL_IDS.ALEO_BTCX]) },
  'aleo-ethx':  { numericId: POOL_IDS.ALEO_ETHX,  ...pick(POOL_AMM_CONFIG[POOL_IDS.ALEO_ETHX]) },
  'btcx-ethx':  { numericId: POOL_IDS.BTCX_ETHX,  ...pick(POOL_AMM_CONFIG[POOL_IDS.BTCX_ETHX]) },
}

function pick(config: any) {
  return { program: config?.program || '', symbolA: config?.symbolA || '', symbolB: config?.symbolB || '' }
}

// ─── Reserve snapshot volume tracker ────────────────────────────────────────
// Stores reserve snapshots and detects swaps from reserve deltas.
// A swap = one reserve increases, the other decreases.
// Volume = USD value of the token that was sold into the pool.

const SNAPSHOT_KEY = 'privadex_reserve_snapshots'
const VOLUME_LOG_KEY = 'privadex_volume_log'
const VERSION_KEY = 'privadex_program_version'

// Clear stale localStorage data when contracts change
// Version fingerprint includes all AMM programs
const CURRENT_VERSION = [
  POOL_AMM_CONFIG[POOL_IDS.ALEO_USDCX]?.program,
  POOL_AMM_CONFIG[POOL_IDS.BTCX_ETHX]?.program,
].join('|')
try {
  const storedVersion = localStorage.getItem(VERSION_KEY)
  if (storedVersion !== CURRENT_VERSION) {
    localStorage.removeItem(SNAPSHOT_KEY)
    localStorage.removeItem(VOLUME_LOG_KEY)
    localStorage.removeItem('privadex_pool_volume')
    localStorage.removeItem('privadex_tvl_history')
    localStorage.removeItem('privadex_vol_history')
    localStorage.setItem(VERSION_KEY, CURRENT_VERSION)
    console.log('[useOnChainPools] Cleared stale localStorage — contracts updated to', CURRENT_VERSION)
  }
} catch { /* ignore */ }

interface ReserveSnapshot {
  pool: string
  reserveA: number
  reserveB: number
  timestamp: number
}

interface VolumeLogEntry {
  pool: string
  usdValue: number
  timestamp: number
}

function getSnapshots(): Record<string, ReserveSnapshot> {
  try {
    return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || '{}')
  } catch { return {} }
}

function saveSnapshots(s: Record<string, ReserveSnapshot>) {
  localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(s))
}

function getVolumeLog(): VolumeLogEntry[] {
  try {
    return JSON.parse(localStorage.getItem(VOLUME_LOG_KEY) || '[]')
  } catch { return [] }
}

function saveVolumeLog(entries: VolumeLogEntry[]) {
  // Keep only last 7 days
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  localStorage.setItem(VOLUME_LOG_KEY, JSON.stringify(entries.filter(e => e.timestamp > cutoff)))
}

/** Detect swap volume from reserve changes and log it */
function detectAndLogVolume(
  poolId: string,
  newResA: number,
  newResB: number,
  symbolA: string,
  symbolB: string,
) {
  const snapshots = getSnapshots()
  const prev = snapshots[poolId]

  // Update snapshot
  snapshots[poolId] = { pool: poolId, reserveA: newResA, reserveB: newResB, timestamp: Date.now() }
  saveSnapshots(snapshots)

  if (!prev || prev.reserveA <= 0 || prev.reserveB <= 0) return

  const deltaA = newResA - prev.reserveA
  const deltaB = newResB - prev.reserveB

  // Ignore noise: require minimum 0.001 change to count as real trade
  const MIN_DELTA = 0.001
  if (Math.abs(deltaA) < MIN_DELTA && Math.abs(deltaB) < MIN_DELTA) return

  // Swap detection: one reserve goes up, the other goes down
  const isSwap = (deltaA > 0 && deltaB < 0) || (deltaA < 0 && deltaB > 0)
  if (!isSwap) return

  // Volume = USD value of the token sold into the pool (the one that increased)
  let usdValue = 0
  if (deltaA > 0) {
    usdValue = deltaA * getCachedPrice(symbolA)
  } else {
    usdValue = Math.abs(deltaB) * getCachedPrice(symbolB)
  }

  if (usdValue < 0.01) return // ignore dust

  const log = getVolumeLog()
  log.push({ pool: poolId, usdValue, timestamp: Date.now() })
  saveVolumeLog(log)
}

/** Get observed 24h volume per pool from reserve changes seen by this browser. */
function get24hVolumeFromLog(): Record<string, number> {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000

  const deltaVolume: Record<string, number> = {}
  for (const e of getVolumeLog()) {
    if (e.timestamp > cutoff) {
      deltaVolume[e.pool] = (deltaVolume[e.pool] || 0) + e.usdValue
    }
  }
  return deltaVolume
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export interface OnChainPool extends Pool {
  hasLiquidity: boolean
  totalShares: bigint
  onChain: boolean // true = real data, false = mock fallback
  metricsMode: 'onchain' | 'observed' | 'mock'
  lastSwapBlock: number | null
}

export function useOnChainPools() {
  const [pools, setPools] = useState<OnChainPool[]>([])
  const [loading, setLoading] = useState(true)
  const [totalTVL, setTotalTVL] = useState(0)
  const [metricsCoverage, setMetricsCoverage] = useState<'none' | 'partial' | 'full'>('none')

  const fetchPools = useCallback(async () => {
    setLoading(true)
    try {
      await fetchTokenPrices()

      const results: OnChainPool[] = []

      for (const mockPool of MOCK_POOLS) {
        const mapping = POOL_MAP[mockPool.id]
        if (!mapping) {
          results.push({ ...mockPool, hasLiquidity: false, totalShares: 0n, onChain: false, metricsMode: 'mock', lastSwapBlock: null })
          continue
        }

        try {
          const [reserves, metrics] = await Promise.all([
            fetchPoolReserves(mapping.numericId, mapping.program),
            fetchPoolMetrics(mapping.numericId, mapping.program),
          ])

          if (reserves.reserveA > 0n && reserves.reserveB > 0n) {
            const resA = Number(reserves.reserveA) / 1e6
            const resB = Number(reserves.reserveB) / 1e6
            const priceA = getCachedPrice(mapping.symbolA)
            const priceB = getCachedPrice(mapping.symbolB)
            const tvl = resA * priceA + resB * priceB

            // Detect swap volume from reserve changes (all users)
            detectAndLogVolume(mockPool.id, resA, resB, mapping.symbolA, mapping.symbolB)

            const volumes = get24hVolumeFromLog()
            const vol24h = volumes[mockPool.id] || 0
            const feeRate = (reserves.feesBps || 30) / 10_000
            const apr = tvl > 0 ? (vol24h * feeRate * 365) / tvl * 100 : 0
            const metricsMode = metrics.available ? 'onchain' as const : 'observed' as const

            results.push({
              ...mockPool,
              reserveA: resA,
              reserveB: resB,
              tvl,
              volume24h: vol24h,
              apr: Math.round(apr * 10) / 10,
              hasLiquidity: true,
              totalShares: reserves.totalShares,
              onChain: true,
              metricsMode,
              lastSwapBlock: metrics.lastSwapBlock,
            })
          } else {
            const volumes = get24hVolumeFromLog()
            const metricsMode = metrics.available ? 'onchain' as const : 'observed' as const
            results.push({
              ...mockPool,
              reserveA: 0,
              reserveB: 0,
              tvl: 0,
              volume24h: volumes[mockPool.id] || 0,
              apr: 0,
              hasLiquidity: false,
              totalShares: 0n,
              onChain: true,
              metricsMode,
              lastSwapBlock: metrics.lastSwapBlock,
            })
          }
        } catch {
          results.push({ ...mockPool, hasLiquidity: true, totalShares: 0n, onChain: false, metricsMode: 'mock', lastSwapBlock: null })
        }
      }

      setPools(results)
      setTotalTVL(results.reduce((s, p) => s + p.tvl, 0))
      const livePools = results.filter((p) => p.onChain)
      const poolsWithMetrics = livePools.filter((p) => p.metricsMode === 'onchain')
      setMetricsCoverage(
        livePools.length === 0
          ? 'none'
          : poolsWithMetrics.length === 0
            ? 'none'
            : poolsWithMetrics.length === livePools.length
              ? 'full'
              : 'partial'
      )
    } catch (e) {
      console.error('[useOnChainPools] Failed:', e)
      setPools(MOCK_POOLS.map(p => ({ ...p, hasLiquidity: true, totalShares: 0n, onChain: false, metricsMode: 'mock', lastSwapBlock: null })))
      setMetricsCoverage('none')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPools()
    const interval = setInterval(fetchPools, 60_000) // refresh every 60s
    return () => clearInterval(interval)
  }, [fetchPools])

  return { pools, loading, totalTVL, metricsCoverage, refetch: fetchPools }
}
