import { useState, useCallback, useRef, useEffect } from 'react'
import { findBestRoute, type RoutingResult, type Venue } from '../lib/router'
import { POOL_IDS } from '../lib/programs'

// Map token pair to pool ID
const PAIR_TO_POOL: Record<string, number> = {
  'ALEO-USDCx': POOL_IDS.ALEO_USDCX,
  'USDCx-ALEO': POOL_IDS.ALEO_USDCX,
  'BTCx-USDCx': POOL_IDS.BTCX_USDCX,
  'USDCx-BTCx': POOL_IDS.BTCX_USDCX,
  'ETHx-USDCx': POOL_IDS.ETHX_USDCX,
  'USDCx-ETHx': POOL_IDS.ETHX_USDCX,
  'ALEO-BTCx': POOL_IDS.ALEO_BTCX,
  'BTCx-ALEO': POOL_IDS.ALEO_BTCX,
  'ALEO-ETHx': POOL_IDS.ALEO_ETHX,
  'ETHx-ALEO': POOL_IDS.ALEO_ETHX,
  'BTCx-ETHx': POOL_IDS.BTCX_ETHX,
  'ETHx-BTCx': POOL_IDS.BTCX_ETHX,
}

// Determine if swapping A→B for a given pool's token ordering
function isAtoB(fromToken: string, _toToken: string, poolId: number): boolean {
  // Pool token order: A is always the "first" token in the pair name
  const orderMap: Record<number, string> = {
    [POOL_IDS.ALEO_USDCX]: 'ALEO',
    [POOL_IDS.BTCX_USDCX]: 'BTCx',
    [POOL_IDS.ETHX_USDCX]: 'ETHx',
    [POOL_IDS.ALEO_BTCX]: 'ALEO',
    [POOL_IDS.ALEO_ETHX]: 'ALEO',
    [POOL_IDS.BTCX_ETHX]: 'BTCx',
  }
  return fromToken === orderMap[poolId]
}

export interface RouteQuoteDisplay {
  venue: Venue
  label: string
  amountOut: number
  priceImpact: number
  speed: string
  privacyLevel: 'full' | 'high' | 'standard'
  recommended: boolean
  available: boolean
  reason?: string
}

export function useBlindRouter() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RoutingResult | null>(null)
  const [quotes, setQuotes] = useState<RouteQuoteDisplay[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout>>()

  const evaluate = useCallback((
    fromToken: string,
    toToken: string,
    amountRaw: string,
    decimals: number = 6,
  ) => {
    // Clear previous debounce
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const amountNum = parseFloat(amountRaw)
    if (!amountRaw || isNaN(amountNum) || amountNum <= 0) {
      setResult(null)
      setQuotes([])
      return
    }

    // Debounce 500ms
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const pairKey = `${fromToken}-${toToken}`
        const poolId = PAIR_TO_POOL[pairKey]
        if (poolId === undefined) {
          console.warn(`[BlindRouter] No pool for pair ${pairKey}`)
          setResult(null)
          setQuotes([])
          return
        }

        const amountIn = BigInt(Math.round(amountNum * 10 ** decimals))
        const aToB = isAtoB(fromToken, toToken, poolId)
        const routingResult = await findBestRoute(amountIn, aToB, poolId)

        setResult(routingResult)

        // Convert to display quotes
        const displayQuotes: RouteQuoteDisplay[] = routingResult.quotes.map(q => ({
          venue: q.venue,
          label: q.venue === 'amm' ? 'Shielded AMM' : q.venue === 'darkpool' ? 'Dark Pool' : 'Order Book',
          amountOut: Number(q.amountOut) / 10 ** decimals,
          priceImpact: q.priceImpact,
          speed: q.settlementTime,
          privacyLevel: 'full' as const,
          recommended: q.venue === routingResult.selectedVenue,
          available: q.available,
          reason: q.reason,
        }))

        setQuotes(displayQuotes)
      } catch (e) {
        console.error('[BlindRouter] Evaluation failed:', e)
      } finally {
        setLoading(false)
      }
    }, 500)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return {
    loading,
    result,
    quotes,
    evaluate,
    selectedVenue: result?.selectedVenue || 'amm' as Venue,
    analysis: result?.analysis || '',
  }
}
