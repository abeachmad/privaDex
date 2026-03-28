/**
 * useDarkPoolState — Fetches real dark pool epoch state from on-chain.
 */
import { useState, useEffect, useCallback } from 'react'
import { fetchEpochState, type EpochState } from '../lib/aleo'

export interface DarkPoolState {
  blockHeight: number
  currentEpoch: number
  secondsUntilNext: number
  epochState: EpochState | null
  loading: boolean
}

export function useDarkPoolState() {
  const [state, setState] = useState<DarkPoolState>({
    blockHeight: 0,
    currentEpoch: 0,
    secondsUntilNext: 300,
    epochState: null,
    loading: true,
  })

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('https://api.explorer.provable.com/v1/testnet/latest/height', {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return
      const height = parseInt(await res.text())
      const epochId = Math.floor(height / 120)
      const blocksLeft = 120 - (height % 120)
      // Aleo testnet: ~1 block per ~3-4 seconds
      const secondsLeft = Math.max(1, Math.ceil(blocksLeft * 3.5))

      let epochState: EpochState | null = null
      try {
        epochState = await fetchEpochState(epochId)
      } catch { /* no epoch data */ }

      setState({
        blockHeight: height,
        currentEpoch: epochId,
        secondsUntilNext: secondsLeft,
        epochState,
        loading: false,
      })
    } catch {
      setState(prev => ({ ...prev, loading: false }))
    }
  }, [])

  useEffect(() => {
    fetchState()
    const interval = setInterval(fetchState, 15_000) // refresh every 15s
    return () => clearInterval(interval)
  }, [fetchState])

  return state
}
