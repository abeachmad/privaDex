/**
 * useDarkPoolState — Fetches real dark pool epoch state from on-chain.
 */
import { useState, useEffect, useCallback } from 'react'
import { fetchDarkPoolInitializationState, fetchEpochState, API_BASE, type EpochState } from '../lib/aleo'
import { POOL_IDS, getDarkPoolConfig } from '../lib/programs'

export interface DarkPoolState {
  blockHeight: number
  currentEpoch: number
  secondsUntilNext: number
  epochState: EpochState | null
  initialized: boolean | null
  loading: boolean
}

export function useDarkPoolState(poolId: number = POOL_IDS.ALEO_USDCX) {
  const [state, setState] = useState<DarkPoolState>({
    blockHeight: 0,
    currentEpoch: 0,
    secondsUntilNext: 300,
    epochState: null,
    initialized: null,
    loading: true,
  })

  const fetchState = useCallback(async () => {
    try {
      const darkPoolConfig = getDarkPoolConfig(poolId)
      if (!darkPoolConfig) {
        setState(prev => ({ ...prev, initialized: false, loading: false }))
        return
      }
      const res = await fetch(`${API_BASE}/latest/height`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return
      const height = parseInt(await res.text())
      const epochId = Math.floor(height / 120)
      const blocksLeft = 120 - (height % 120)
      // Aleo testnet: ~1 block per ~3-4 seconds
      const secondsLeft = Math.max(1, Math.ceil(blocksLeft * 3.5))

      const initState = await fetchDarkPoolInitializationState(darkPoolConfig.program)
      let epochState: EpochState | null = null
      if (initState.initialized) {
        try {
          epochState = await fetchEpochState(epochId, poolId, darkPoolConfig.program)
        } catch { /* no epoch data */ }
      }

      setState({
        blockHeight: height,
        currentEpoch: epochId,
        secondsUntilNext: secondsLeft,
        epochState,
        initialized: initState.reachable ? initState.initialized : null,
        loading: false,
      })
    } catch {
      setState(prev => ({ ...prev, loading: false }))
    }
  }, [poolId])

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 15_000) // refresh every 15s
    return () => clearInterval(interval)
  }, [fetchState])

  return state
}
