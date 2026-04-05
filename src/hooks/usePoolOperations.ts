/**
 * usePoolOperations — Hook for add/remove liquidity across all 6 pool types.
 *
 * Key design: expected_shares is computed with a slippage buffer and reserves
 * are re-fetched just before the on-chain call to avoid stale-reserve rejections.
 */
import { useState, useCallback } from 'react'
import { useWallet } from '../context/WalletContext'
import {
  executeOnChain, pollTransactionStatus, parseLeoInt,
  resolveOnChainTransactionId, fetchTransactionBody,
  fetchPoolReservesStrict, prepareCreditsRecordForTx, prepareUsdcxForTx,
  prepareRegistryTokenForTx,
  getPublicAleoBalance, registryTokenIdForSymbol,
} from '../lib/aleo'
import { markRecordSpent } from '../lib/spentRecords'
import {
  POOL_AMM_CONFIG,
  buildAddLiquidityInputs, buildRemoveLiquidityInputs,
  buildTokenPairAddLiquidityInputs, buildTokenPairRemoveLiquidityInputs,
  buildCreditsTokenAddLiqInputs,
  buildPureTokenPairAddLiqInputs,
} from '../lib/programs'
import { addTradeEntry } from '../lib/tradeHistory'
import { recordLpDeposit } from '../lib/lpTracker'
import { getCachedPrice } from '../lib/prices'
import type { TxStatus } from '../lib/aleo'

// Slippage buffer for LP shares: request 2% fewer shares than calculated.
// This prevents on-chain rejection when reserves change between the
// frontend fetch and the finalize execution.
const LP_SLIPPAGE_BPS = 200n // 2%
const BPS_DENOM = 10_000n

function computeExpectedLpShares(
  amountA: bigint,
  amountB: bigint,
  reserves: { reserveA: bigint; reserveB: bigint; totalShares: bigint },
): bigint {
  if (amountA <= 0n || amountB <= 0n) return 0n
  if (reserves.totalShares === 0n) return amountA * amountB
  if (reserves.reserveA <= 0n || reserves.reserveB <= 0n) return 0n
  const sharesFromA = (amountA * reserves.totalShares) / reserves.reserveA
  const sharesFromB = (amountB * reserves.totalShares) / reserves.reserveB
  return sharesFromA <= sharesFromB ? sharesFromA : sharesFromB
}

function computeLpShareGap(
  amountA: bigint,
  amountB: bigint,
  reserves: { reserveA: bigint; reserveB: bigint; totalShares: bigint },
): bigint {
  if (reserves.totalShares === 0n || reserves.reserveA <= 0n || reserves.reserveB <= 0n) return 0n
  const sharesFromA = (amountA * reserves.totalShares) / reserves.reserveA
  const sharesFromB = (amountB * reserves.totalShares) / reserves.reserveB
  return sharesFromA >= sharesFromB ? sharesFromA - sharesFromB : sharesFromB - sharesFromA
}

function normalizeLpAmountsToPoolRatio(
  maxAmountA: bigint,
  maxAmountB: bigint,
  reserves: { reserveA: bigint; reserveB: bigint; totalShares: bigint },
): { amountA: bigint; amountB: bigint } {
  if (maxAmountA <= 0n || maxAmountB <= 0n) {
    return { amountA: 0n, amountB: 0n }
  }

  if (reserves.totalShares === 0n || reserves.reserveA <= 0n || reserves.reserveB <= 0n) {
    return { amountA: maxAmountA, amountB: maxAmountB }
  }

  const candidates: Array<{ amountA: bigint; amountB: bigint; shares: bigint; gap: bigint }> = []
  const pushCandidate = (amountA: bigint, amountB: bigint) => {
    if (amountA <= 0n || amountB <= 0n) return
    if (amountA > maxAmountA || amountB > maxAmountB) return
    const shares = computeExpectedLpShares(amountA, amountB, reserves)
    if (shares <= 0n) return
    candidates.push({
      amountA,
      amountB,
      shares,
      gap: computeLpShareGap(amountA, amountB, reserves),
    })
  }

  const fromA = (maxAmountA * reserves.reserveB) / reserves.reserveA
  const fromB = (maxAmountB * reserves.reserveA) / reserves.reserveB

  pushCandidate(maxAmountA, fromA)
  pushCandidate(maxAmountA, fromA + 1n)
  pushCandidate(fromB, maxAmountB)
  pushCandidate(fromB + 1n, maxAmountB)
  pushCandidate(maxAmountA, maxAmountB)

  candidates.sort((left, right) => {
    const leftAligned = left.gap <= 1n ? 1 : 0
    const rightAligned = right.gap <= 1n ? 1 : 0
    if (leftAligned !== rightAligned) return rightAligned - leftAligned
    if (left.shares !== right.shares) return left.shares > right.shares ? -1 : 1
    if (left.gap !== right.gap) return left.gap < right.gap ? -1 : 1
    return 0
  })

  const best = candidates[0]
  if (!best) {
    return { amountA: maxAmountA, amountB: maxAmountB }
  }

  return { amountA: best.amountA, amountB: best.amountB }
}

/** Apply slippage: return shares * (1 - slippageBps/10000) */
function applySlippage(shares: bigint): bigint {
  if (shares <= 0n) return shares
  const adjusted = (shares * (BPS_DENOM - LP_SLIPPAGE_BPS)) / BPS_DENOM
  return adjusted > 0n ? adjusted : 1n
}

async function buildLiquidityRejectionMessage(
  txId: string,
  poolLabel: string,
  walletTransactionStatus?: (txId: string) => Promise<any>,
): Promise<string> {
  const resolvedTxId = await resolveOnChainTransactionId(txId, walletTransactionStatus)
  const body = resolvedTxId ? await fetchTransactionBody(resolvedTxId) : null
  const lowerBody = body?.toLowerCase() ?? ''
  const txSuffix = resolvedTxId ? ` TX: ${resolvedTxId}` : ''

  if (lowerBody.includes('input id') || lowerBody.includes('already exists in the ledger') || lowerBody.includes('spent')) {
    return `Transaction rejected on-chain because one of the input records was already spent.${txSuffix}`
  }

  if (
    lowerBody.includes('integer subtraction failed') ||
    lowerBody.includes('subtraction failed on')
  ) {
    return `Transaction rejected on-chain because the LP call tried to spend more from a prepared record than that record contained. This usually happens when the deposit ratio is recalculated after record preparation.${txSuffix}`
  }

  if (
    lowerBody.includes('freeze') ||
    lowerBody.includes('merkle') ||
    lowerBody.includes('compliance') ||
    lowerBody.includes('transfer_private_to_public') ||
    lowerBody.includes('test_usdcx_stablecoin')
  ) {
    return `Transaction rejected during ${poolLabel} token escrow. USDCx compliance or freeze-list proof may have failed.${txSuffix}`
  }

  if (lowerBody.includes('assert') || lowerBody.includes('expected_shares') || lowerBody.includes('finalize_add_liq')) {
    return `Transaction rejected on-chain while finalizing LP shares. Pool reserves may have changed before confirmation.${txSuffix}`
  }

  return `Transaction rejected on-chain during add liquidity. This is not always a reserve issue; it can also come from record state or USDCx compliance checks.${txSuffix}`
}

export function usePoolOperations() {
  const { connected, address, executeTransaction: walletExecute, requestRecords, refreshBalances, transactionStatus: walletTxStatus } = useWallet()
  const [loading, setLoading] = useState(false)
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null)
  const [txId, setTxId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const reset = useCallback(() => {
    setLoading(false); setTxStatus(null); setTxId(null); setError(null); setStatusMsg(null)
  }, [])

  const addLiquidity = useCallback(async (
    poolId: number,
    amountA: number, // human-readable
    amountB: number,
    decimals: number = 6,
  ) => {
    if (!connected || !address || !walletExecute || !requestRecords) return false
    reset(); setLoading(true)
    window.dispatchEvent(new Event('privadex:txStart'))

    const config = POOL_AMM_CONFIG[poolId]
    if (!config) { setError(`Unknown pool: ${poolId}`); setLoading(false); return false }

    const requestedAmtA = BigInt(Math.round(amountA * 10 ** decimals))
    const requestedAmtB = BigInt(Math.round(amountB * 10 ** decimals))
    let amtA = requestedAmtA
    let amtB = requestedAmtB
    let usedRecA: string | null = null
    let usedRecB: string | null = null

    try {
      let merkleProofs: string | undefined
      const prepareRecordsForAmounts = async (
        amountForA: bigint,
        amountForB: bigint,
        exclusions?: { recordA?: Set<string>; recordB?: Set<string> },
      ) => {
        let nextRecA: string | null = null
        let nextRecB: string | null = null
        let nextMerkleProofs: string | undefined
        const prepTxIds: string[] = []
        const rememberPrepTx = (txId: string) => {
          prepTxIds.push(txId)
        }

        if (config.tokenAIsCredits && config.symbolB === 'USDCx') {
          setStatusMsg('Preparing ALEO record...')
          nextRecA = await prepareCreditsRecordForTx(
            walletExecute, requestRecords, amountForA, address, (m) => setStatusMsg(m), exclusions?.recordA, rememberPrepTx,
          )

          setStatusMsg('Preparing USDCx record...')
          const usdcxResult = await prepareUsdcxForTx(
            walletExecute, requestRecords, amountForB, address, exclusions?.recordB, rememberPrepTx,
          )
          nextRecB = usdcxResult.tokenRecord
          nextMerkleProofs = usdcxResult.merkleProofs

        } else if (config.tokenAIsCredits) {
          setStatusMsg('Preparing ALEO record...')
          nextRecA = await prepareCreditsRecordForTx(
            walletExecute, requestRecords, amountForA, address, (m) => setStatusMsg(m),
          )

          const regId = registryTokenIdForSymbol(config.symbolB)!
          setStatusMsg(`Preparing ${config.symbolB} record...`)
          nextRecB = await prepareRegistryTokenForTx(walletExecute, requestRecords, regId, amountForB, address)

        } else if (config.symbolB === 'USDCx') {
          const regId = registryTokenIdForSymbol(config.symbolA)!
          setStatusMsg(`Preparing ${config.symbolA} record...`)
          nextRecA = await prepareRegistryTokenForTx(walletExecute, requestRecords, regId, amountForA, address)

          setStatusMsg('Preparing USDCx record...')
          const usdcxResult = await prepareUsdcxForTx(
            walletExecute, requestRecords, amountForB, address, exclusions?.recordB, rememberPrepTx,
          )
          nextRecB = usdcxResult.tokenRecord
          nextMerkleProofs = usdcxResult.merkleProofs

        } else {
          const regA = registryTokenIdForSymbol(config.symbolA)!
          const regB = registryTokenIdForSymbol(config.symbolB)!
          setStatusMsg(`Preparing ${config.symbolA} record...`)
          nextRecA = await prepareRegistryTokenForTx(walletExecute, requestRecords, regA, amountForA, address)
          setStatusMsg(`Preparing ${config.symbolB} record...`)
          nextRecB = await prepareRegistryTokenForTx(walletExecute, requestRecords, regB, amountForB, address)
        }

        return { usedRecA: nextRecA, usedRecB: nextRecB, merkleProofs: nextMerkleProofs, prepTxIds }
      }

      const waitForPrepTransactions = async (prepTxIds: string[]) => {
        const uniqueTxIds = [...new Set(prepTxIds.filter(Boolean))]
        for (const prepTxId of uniqueTxIds) {
          setStatusMsg('Waiting for record preparation to finalize...')
          const status = await pollTransactionStatus(prepTxId, undefined, 3_000, 180_000, walletTxStatus)
          if (status === 'rejected') {
            throw new Error('A record preparation transaction was rejected on-chain.')
          }
        }
      }

      // Initial fee check (preparatory txs may reduce this)
      const pubBal = await getPublicAleoBalance(address)
      if (pubBal < 1_500_000n) throw new Error('Insufficient public ALEO for fee.')

      // Early sanity check — will be re-computed right before execution
      const earlyReserves = await fetchPoolReservesStrict(poolId, config.program)
      const earlyShares = computeExpectedLpShares(requestedAmtA, requestedAmtB, earlyReserves)
      if (earlyShares <= 0n) {
        throw new Error('Deposit too small to mint LP shares.')
      }

      // ── Phase 1: Prepare records (may involve multiple on-chain txs) ────
      // Credits-based pools now accept amount_a explicitly, so the wallet only
      // needs a spendable credits record with balance >= the requested amount.
      {
        const prepared = await prepareRecordsForAmounts(amtA, amtB)
        usedRecA = prepared.usedRecA
        usedRecB = prepared.usedRecB
        merkleProofs = prepared.merkleProofs
        await waitForPrepTransactions(prepared.prepTxIds)
      }

      // ── Phase 2: Re-fetch reserves & re-compute with BigInt precision ────
      // Reserves may have changed during the lengthy record preparation phase.
      // IMPORTANT: never increase the execution amounts above the original user
      // request after records are prepared, or the contract can attempt to spend
      // more from a record than the wallet actually prepared for this tx.
      setStatusMsg('Refreshing pool state...')
      const freshReserves = await fetchPoolReservesStrict(poolId, config.program)

      const normalizedAmounts = normalizeLpAmountsToPoolRatio(requestedAmtA, requestedAmtB, freshReserves)
      if (normalizedAmounts.amountA !== requestedAmtA || normalizedAmounts.amountB !== requestedAmtB) {
        setStatusMsg('Adjusting deposit ratio to latest pool state...')
        console.log(
          `[addLiquidity] Adjusting deposit amounts: A ${requestedAmtA} → ${normalizedAmounts.amountA}, ` +
          `B ${requestedAmtB} → ${normalizedAmounts.amountB}`
        )
      }
      amtA = normalizedAmounts.amountA
      amtB = normalizedAmounts.amountB

      const freshShares = computeExpectedLpShares(amtA, amtB, freshReserves)
      if (freshShares <= 0n) {
        throw new Error('Deposit too small to mint LP shares (reserves may have changed).')
      }
      const expectedShares = applySlippage(freshShares)
      console.log(`[addLiquidity] Intended amtA: ${amtA}, amtB: ${amtB}, fresh shares: ${freshShares}, with slippage: ${expectedShares}`)

      // Re-select records for the final on-chain amounts. This avoids using a
      // record chosen before reserve refresh if Shield Wallet has since merged
      // or replaced it in the background.
      setStatusMsg('Refreshing input records...')
      {
        const prepared = await prepareRecordsForAmounts(amtA, amtB)
        usedRecA = prepared.usedRecA
        usedRecB = prepared.usedRecB
        merkleProofs = prepared.merkleProofs
        await waitForPrepTransactions(prepared.prepTxIds)
      }

      // Re-check fee after preparatory transactions
      const feeBalance = await getPublicAleoBalance(address)
      if (feeBalance < 1_500_000n) {
        throw new Error(
          `Insufficient public ALEO for fee after record preparation. ` +
          `Have ${(Number(feeBalance) / 1e6).toFixed(2)} ALEO, need 1.5 ALEO.`
        )
      }

      // ── Phase 3: Build inputs & execute ─────────────────────────────────
      const recordIndices = [0, 1]
      const buildInputs = () => {
        if (config.tokenAIsCredits && config.symbolB === 'USDCx') {
          return buildAddLiquidityInputs(usedRecA!, usedRecB!, merkleProofs!, poolId, amtA, amtB, freshReserves, expectedShares)
        }
        if (config.tokenAIsCredits) {
          return buildCreditsTokenAddLiqInputs(usedRecA!, usedRecB!, poolId, amtA, amtB, freshReserves, expectedShares)
        }
        if (config.symbolB === 'USDCx') {
          return buildTokenPairAddLiquidityInputs(usedRecA!, usedRecB!, merkleProofs!, poolId, amtA, amtB, freshReserves, expectedShares)
        }
        return buildPureTokenPairAddLiqInputs(usedRecA!, usedRecB!, poolId, amtA, amtB, freshReserves, expectedShares)
      }

      let inputs = buildInputs()

      // ── Pre-execution record validation ────────────────────────────────
      // Verify token records have sufficient balance before submitting
      if (!config.tokenAIsCredits && usedRecA) {
        const recAmtA = parseLeoInt((usedRecA.match(/amount:\s*(\d+u128)/)?.[1]) ?? '0u128')
        if (recAmtA < amtA) {
          throw new Error(`${config.symbolA} record has ${Number(recAmtA)/1e6} but need ${Number(amtA)/1e6}. Disconnect wallet and reconnect.`)
        }
      }
      if (usedRecB && config.symbolB !== 'USDCx') {
        const recAmtB = parseLeoInt((usedRecB.match(/amount:\s*(\d+u128)/)?.[1]) ?? '0u128')
        if (recAmtB < amtB) {
          throw new Error(`${config.symbolB} record has ${Number(recAmtB)/1e6} but need ${Number(amtB)/1e6}. Disconnect wallet and reconnect.`)
        }
      }

      // ── Diagnostic logging ──────────────────────────────────────────────
      console.log('[addLiquidity] === DIAGNOSTIC DUMP ===')
      console.log('[addLiquidity] Pool:', config.program, 'fn:', config.addLiquidity, 'poolId:', poolId)
      console.log(
        '[addLiquidity] requested:',
        { amountA: requestedAmtA.toString(), amountB: requestedAmtB.toString() },
        'executing:',
        { amountA: amtA.toString(), amountB: amtB.toString() },
        'expectedShares:',
        expectedShares.toString(),
      )
      console.log('[addLiquidity] Reserves:', JSON.stringify({
        reserveA: freshReserves.reserveA.toString(),
        reserveB: freshReserves.reserveB.toString(),
        totalShares: freshReserves.totalShares.toString(),
      }))
      console.log('[addLiquidity] Credits record (first 200):', usedRecA?.substring(0, 200))
      console.log('[addLiquidity] Token record (first 200):', usedRecB?.substring(0, 200))
      console.log('[addLiquidity] MerkleProofs:', merkleProofs?.substring(0, 100))
      inputs.forEach((inp, i) => console.log(`[addLiquidity] Input[${i}] (${inp.length} chars):`, inp.substring(0, 150)))

      setStatusMsg('Executing on-chain...')
      let id: string
      try {
        id = await executeOnChain(walletExecute, config.program, config.addLiquidity, inputs, 1_500_000, false, recordIndices)
      } catch (execErr: any) {
        const execMsg = execErr?.message ?? 'Add liquidity failed.'
        const isStaleInput =
          execMsg.includes('already exists in the ledger') ||
          execMsg.includes('input ID') ||
          execMsg.includes('spent')

        if (!isStaleInput) throw execErr

        console.warn('[addLiquidity] Stale input detected, retrying with refreshed records', execMsg)
        setStatusMsg('Refreshing records after stale-input error...')
        const exclusionA = usedRecA ? new Set([usedRecA]) : undefined
        const exclusionB = usedRecB ? new Set([usedRecB]) : undefined
        {
          const prepared = await prepareRecordsForAmounts(amtA, amtB, {
            recordA: exclusionA,
            recordB: exclusionB,
          })
          usedRecA = prepared.usedRecA
          usedRecB = prepared.usedRecB
          merkleProofs = prepared.merkleProofs
          await waitForPrepTransactions(prepared.prepTxIds)
        }
        inputs = buildInputs()
        setStatusMsg('Retrying on-chain execution...')
        id = await executeOnChain(walletExecute, config.program, config.addLiquidity, inputs, 1_500_000, false, recordIndices)
      }
      if (usedRecA) markRecordSpent(usedRecA)
      if (usedRecB) markRecordSpent(usedRecB)

      setTxId(id)
      setTxStatus('pending')
      setStatusMsg('Waiting for on-chain confirmation...')
      // Use wallet's transactionStatus API for Shield temp IDs, explorer API for real IDs
      const finalStatus = await pollTransactionStatus(id, setTxStatus, 3_000, 180_000, walletTxStatus)
      if (finalStatus === 'rejected') {
        const poolLabel = `${config.symbolA}/${config.symbolB}`
        setError(await buildLiquidityRejectionMessage(id, poolLabel, walletTxStatus))
        window.dispatchEvent(new Event('privadex:txEnd'))
        return false
      }

      addTradeEntry(address, {
        type: 'Add Liquidity', pair: `${config.symbolA}/${config.symbolB}`,
        side: 'BUY',
        amountIn:
          `${(Number(amtA) / 10 ** decimals).toFixed(decimals).replace(/\.?0+$/, '')} ${config.symbolA} + ` +
          `${(Number(amtB) / 10 ** decimals).toFixed(decimals).replace(/\.?0+$/, '')} ${config.symbolB}`,
        amountOut: 'LP shares', txId: id, venue: 'AMM',
      })

      // Record deposit value for fee tracking
      const depA = Number(amtA) / 10 ** decimals
      const depB = Number(amtB) / 10 ** decimals
      const priceA = getCachedPrice(config.symbolA)
      const priceB = getCachedPrice(config.symbolB)
      const depositUsd = depA * priceA + depB * priceB
      const poolStringId = `${config.symbolA.toLowerCase()}-${config.symbolB.toLowerCase()}`
        .replace('usdcx', 'usdcx').replace('btcx', 'btcx').replace('ethx', 'ethx')
      recordLpDeposit(address, poolStringId, depositUsd, depA, depB, expectedShares)

      window.dispatchEvent(new Event('privadex:txEnd'))
      window.dispatchEvent(new Event('privadex:balanceRefresh'))
      setTimeout(() => refreshBalances(), 10_000)
      return true

    } catch (err: any) {
      let msg = err?.message ?? 'Add liquidity failed.'
      if (msg.includes('already exists in the ledger') || msg.includes('input ID')) {
        msg = 'Record already spent on-chain. Disconnect and reconnect wallet.'
      }
      setError(msg)
      window.dispatchEvent(new Event('privadex:txEnd'))
      return false
    } finally {
      setLoading(false)
      setStatusMsg(null)
    }
  }, [connected, address, walletExecute, requestRecords, refreshBalances, reset, walletTxStatus])

  const removeLiquidity = useCallback(async (
    poolId: number,
    lpRecordPlaintext: string,
    _sharesToRemove: bigint,
    amountAOut: bigint,
    amountBOut: bigint,
  ) => {
    if (!connected || !address || !walletExecute) return false
    reset(); setLoading(true)
    window.dispatchEvent(new Event('privadex:txStart'))

    const config = POOL_AMM_CONFIG[poolId]
    if (!config) { setError(`Unknown pool: ${poolId}`); setLoading(false); return false }

    try {
      let inputs: string[]
      const liveReserves = await fetchPoolReservesStrict(poolId, config.program)
      if (config.tokenAIsCredits && config.symbolB === 'USDCx') {
        inputs = buildRemoveLiquidityInputs(lpRecordPlaintext, liveReserves, amountAOut, amountBOut)
      } else {
        inputs = buildTokenPairRemoveLiquidityInputs(lpRecordPlaintext, liveReserves, amountAOut, amountBOut)
      }

      const id = await executeOnChain(walletExecute, config.program, config.removeLiquidity, inputs, 1_500_000, false, [0])
      markRecordSpent(lpRecordPlaintext)

      setTxId(id); setTxStatus('pending')
      const finalStatus = await pollTransactionStatus(id, setTxStatus, 3_000, 180_000, walletTxStatus)
      if (finalStatus === 'rejected') {
        setError('Remove liquidity was rejected on-chain.')
        window.dispatchEvent(new Event('privadex:txEnd'))
        return false
      }

      window.dispatchEvent(new Event('privadex:txEnd'))
      window.dispatchEvent(new Event('privadex:balanceRefresh'))
      return true

    } catch (err: any) {
      let msg = err?.message ?? 'Remove liquidity failed.'
      if (msg.includes('already exists in the ledger') || msg.includes('input ID')) {
        msg = 'LP record already spent on-chain. Disconnect and reconnect wallet.'
      }
      setError(msg)
      window.dispatchEvent(new Event('privadex:txEnd'))
      return false
    } finally {
      setLoading(false)
    }
  }, [connected, address, walletExecute, reset, walletTxStatus])

  return { loading, txStatus, txId, error, statusMsg, reset, addLiquidity, removeLiquidity }
}
