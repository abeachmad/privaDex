/**
 * useSwapExecute — Hook for executing on-chain swaps across all 6 pool types.
 * Handles: record preparation, input building, tx execution, status polling, trade history.
 */
import { useState, useCallback } from 'react'
import { useWallet } from '../context/WalletContext'
import {
  executeOnChain, pollTransactionStatus,
  resolveOnChainTransactionId, fetchTransactionBody,
  prepareCreditsRecordForTx, prepareExactCreditsRecord, prepareUsdcxForTx, prepareRegistryTokenForTx,
  fetchRecordsRobust, getRecordCredits, getPublicAleoBalance, fetchPoolReservesStrict, cpmmOutputWithFee,
  registryTokenIdForSymbol,
} from '../lib/aleo'
import { isRecordManuallySpent, markRecordSpent } from '../lib/spentRecords'
import {
  PROGRAMS, POOL_IDS, POOL_AMM_CONFIG,
  DARKPOOL_FNS, ORDERBOOK_FNS, ROUTER_FNS,
  buildSwapAleoForUsdcxInputs, buildSwapUsdcxForAleoInputs,
  buildSwapTokenForUsdcxInputs, buildSwapUsdcxForTokenInputs,
  buildSwapNativeForTokenInputs,
  buildPureTokenSwapInputs,
  buildRouterBtcxForEthxViaAleoInputs,
  buildRouterEthxForBtcxViaAleoInputs,
  buildRouterAleoForBtcxViaEthxInputs,
  buildRouterBtcxForAleoViaEthxInputs,
  buildRouterAleoForEthxViaBtcxInputs,
  buildRouterEthxForAleoViaBtcxInputs,
  buildDarkSellAleoInputs, buildDarkBuyAleoInputs,
  buildSellLimitInputs, buildBuyLimitInputs,
  randomNonce, currentEpochId, expiryInEpochs, priceToFixed,
} from '../lib/programs'
import { addTradeEntry } from '../lib/tradeHistory'
import type { Venue } from '../lib/router'
import type { TxStatus } from '../lib/aleo'

export type ProofStatus = 'idle' | 'preparing' | 'proving' | 'verified'

async function buildSwapRejectionMessage(
  txId: string,
  pairLabel: string,
  walletTransactionStatus?: (txId: string) => Promise<any>,
): Promise<string> {
  const resolvedTxId = await resolveOnChainTransactionId(txId, walletTransactionStatus)
  const body = resolvedTxId ? await fetchTransactionBody(resolvedTxId) : null
  const lowerBody = body?.toLowerCase() ?? ''
  const txSuffix = resolvedTxId ? ` TX: ${resolvedTxId}` : ''

  if (lowerBody.includes('input id') || lowerBody.includes('already exists in the ledger') || lowerBody.includes('spent')) {
    return `Swap rejected on-chain because one of the input records was already spent.${txSuffix}`
  }

  if (
    lowerBody.includes('freeze') ||
    lowerBody.includes('merkle') ||
    lowerBody.includes('compliance') ||
    lowerBody.includes('transfer_private_to_public') ||
    lowerBody.includes('test_usdcx_stablecoin')
  ) {
    return `Swap ${pairLabel} rejected during USDCx escrow. Compliance or freeze-list proof may have failed.${txSuffix}`
  }

  if (lowerBody.includes('assert') || lowerBody.includes('min_out') || lowerBody.includes('finalize_swap')) {
    return `Swap ${pairLabel} rejected on-chain because the live output fell below your minimum received setting.${txSuffix}`
  }

  return `Swap ${pairLabel} was rejected on-chain. This can come from reserve movement, input record state, or USDCx compliance checks.${txSuffix}`
}

interface AtomicRoutePlan {
  fnName: string
  inputs: string[]
  liveOut: bigint
  label: string
}

async function chooseAtomicRouterPlan(
  poolId: number,
  isAtoB: boolean,
  amountIn: bigint,
  minOut: bigint,
  inputRecord: string,
): Promise<AtomicRoutePlan | null> {
  if (poolId === POOL_IDS.ALEO_BTCX) {
    if (isAtoB) {
      const [aleoEthx, btcxEthx] = await Promise.all([
        fetchPoolReservesStrict(POOL_IDS.ALEO_ETHX, PROGRAMS.AMM_NATIVE_ETHX),
        fetchPoolReservesStrict(POOL_IDS.BTCX_ETHX, PROGRAMS.AMM_BTCX_ETHX),
      ])
      const midOut = cpmmOutputWithFee(amountIn, aleoEthx.reserveA, aleoEthx.reserveB, aleoEthx.feesBps)
      const liveOut = cpmmOutputWithFee(midOut, btcxEthx.reserveB, btcxEthx.reserveA, btcxEthx.feesBps)
      if (liveOut < minOut) return null
      return {
        fnName: ROUTER_FNS.SWAP_ALEO_FOR_BTCX_VIA_ETHX,
        inputs: buildRouterAleoForBtcxViaEthxInputs(inputRecord, amountIn, aleoEthx, btcxEthx, minOut),
        liveOut,
        label: 'ETHx',
      }
    }

    const [btcxEthx, aleoEthx] = await Promise.all([
      fetchPoolReservesStrict(POOL_IDS.BTCX_ETHX, PROGRAMS.AMM_BTCX_ETHX),
      fetchPoolReservesStrict(POOL_IDS.ALEO_ETHX, PROGRAMS.AMM_NATIVE_ETHX),
    ])
    const midOut = cpmmOutputWithFee(amountIn, btcxEthx.reserveA, btcxEthx.reserveB, btcxEthx.feesBps)
    const liveOut = cpmmOutputWithFee(midOut, aleoEthx.reserveB, aleoEthx.reserveA, aleoEthx.feesBps)
    if (liveOut < minOut) return null
    return {
      fnName: ROUTER_FNS.SWAP_BTCX_FOR_ALEO_VIA_ETHX,
      inputs: buildRouterBtcxForAleoViaEthxInputs(inputRecord, amountIn, btcxEthx, aleoEthx, minOut),
      liveOut,
      label: 'ETHx',
    }
  }

  if (poolId === POOL_IDS.ALEO_ETHX) {
    if (isAtoB) {
      const [aleoBtcx, btcxEthx] = await Promise.all([
        fetchPoolReservesStrict(POOL_IDS.ALEO_BTCX, PROGRAMS.AMM_NATIVE_BTCX),
        fetchPoolReservesStrict(POOL_IDS.BTCX_ETHX, PROGRAMS.AMM_BTCX_ETHX),
      ])
      const midOut = cpmmOutputWithFee(amountIn, aleoBtcx.reserveA, aleoBtcx.reserveB, aleoBtcx.feesBps)
      const liveOut = cpmmOutputWithFee(midOut, btcxEthx.reserveA, btcxEthx.reserveB, btcxEthx.feesBps)
      if (liveOut < minOut) return null
      return {
        fnName: ROUTER_FNS.SWAP_ALEO_FOR_ETHX_VIA_BTCX,
        inputs: buildRouterAleoForEthxViaBtcxInputs(inputRecord, amountIn, aleoBtcx, btcxEthx, minOut),
        liveOut,
        label: 'BTCx',
      }
    }

    const [btcxEthx, aleoBtcx] = await Promise.all([
      fetchPoolReservesStrict(POOL_IDS.BTCX_ETHX, PROGRAMS.AMM_BTCX_ETHX),
      fetchPoolReservesStrict(POOL_IDS.ALEO_BTCX, PROGRAMS.AMM_NATIVE_BTCX),
    ])
    const midOut = cpmmOutputWithFee(amountIn, btcxEthx.reserveB, btcxEthx.reserveA, btcxEthx.feesBps)
    const liveOut = cpmmOutputWithFee(midOut, aleoBtcx.reserveB, aleoBtcx.reserveA, aleoBtcx.feesBps)
    if (liveOut < minOut) return null
    return {
      fnName: ROUTER_FNS.SWAP_ETHX_FOR_ALEO_VIA_BTCX,
      inputs: buildRouterEthxForAleoViaBtcxInputs(inputRecord, amountIn, btcxEthx, aleoBtcx, minOut),
      liveOut,
      label: 'BTCx',
    }
  }

  if (poolId === POOL_IDS.BTCX_ETHX) {
    if (isAtoB) {
      const [aleoBtcx, aleoEthx] = await Promise.all([
        fetchPoolReservesStrict(POOL_IDS.ALEO_BTCX, PROGRAMS.AMM_NATIVE_BTCX),
        fetchPoolReservesStrict(POOL_IDS.ALEO_ETHX, PROGRAMS.AMM_NATIVE_ETHX),
      ])
      const midOut = cpmmOutputWithFee(amountIn, aleoBtcx.reserveB, aleoBtcx.reserveA, aleoBtcx.feesBps)
      const liveOut = cpmmOutputWithFee(midOut, aleoEthx.reserveA, aleoEthx.reserveB, aleoEthx.feesBps)
      if (liveOut < minOut) return null
      return {
        fnName: ROUTER_FNS.SWAP_BTCX_FOR_ETHX_VIA_ALEO,
        inputs: buildRouterBtcxForEthxViaAleoInputs(inputRecord, amountIn, aleoBtcx, aleoEthx, minOut),
        liveOut,
        label: 'ALEO',
      }
    }

    const [aleoEthx, aleoBtcx] = await Promise.all([
      fetchPoolReservesStrict(POOL_IDS.ALEO_ETHX, PROGRAMS.AMM_NATIVE_ETHX),
      fetchPoolReservesStrict(POOL_IDS.ALEO_BTCX, PROGRAMS.AMM_NATIVE_BTCX),
    ])
    const midOut = cpmmOutputWithFee(amountIn, aleoEthx.reserveB, aleoEthx.reserveA, aleoEthx.feesBps)
    const liveOut = cpmmOutputWithFee(midOut, aleoBtcx.reserveA, aleoBtcx.reserveB, aleoBtcx.feesBps)
    if (liveOut < minOut) return null
    return {
      fnName: ROUTER_FNS.SWAP_ETHX_FOR_BTCX_VIA_ALEO,
      inputs: buildRouterEthxForBtcxViaAleoInputs(inputRecord, amountIn, aleoEthx, aleoBtcx, minOut),
      liveOut,
      label: 'ALEO',
    }
  }

  return null
}

export function useSwapExecute() {
  const { connected, address, executeTransaction: walletExecute, requestRecords, refreshBalances, transactionStatus: walletTxStatus } = useWallet()
  const [proofStatus, setProofStatus] = useState<ProofStatus>('idle')
  const [txStatus, setTxStatus] = useState<TxStatus | null>(null)
  const [txId, setTxId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const reset = useCallback(() => {
    setProofStatus('idle')
    setTxStatus(null)
    setTxId(null)
    setError(null)
    setStatusMsg(null)
  }, [])

  const executeSwap = useCallback(async (
    fromToken: string,
    toToken: string,
    amountIn: number, // human-readable (e.g. 100.5)
    venue: Venue,
    poolId: number,
    isAtoB: boolean,
    minOut: bigint,
    decimals: number = 6,
  ) => {
    if (!connected || !address || !walletExecute || !requestRecords) {
      setError('Wallet not connected')
      return false
    }

    reset()
    setProofStatus('preparing')
    window.dispatchEvent(new Event('privadex:txStart'))

    const amountInBig = BigInt(Math.round(amountIn * 10 ** decimals))
    let usedRecord: string | null = null
    let submittedTxId: string | null = null

    try {
      const config = POOL_AMM_CONFIG[poolId]
      if (!config) throw new Error(`Unknown pool ID: ${poolId}`)

      // Fee check
      const txFee = 1_500_000
      const pubBal = await getPublicAleoBalance(address)
      if (pubBal < BigInt(txFee)) {
        throw new Error(`Insufficient public ALEO for fee: have ${(Number(pubBal) / 1e6).toFixed(2)}, need ${(txFee / 1e6).toFixed(2)}`)
      }

      let inputs: string[] = []
      let program: string
      let fnName: string
      let recordIndices: number[]

      if (venue === 'amm') {
        // ─── AMM Swap ───
        program = config.program

        if (isAtoB) {
          // Token A → Token B
          if (config.tokenAIsCredits) {
            // ALEO → X
            setStatusMsg('Preparing ALEO record...')
            usedRecord = await prepareCreditsRecordForTx(
              walletExecute,
              requestRecords,
              amountInBig,
              address,
              (msg) => setStatusMsg(msg),
            )
            fnName = config.swapAForB
            recordIndices = [0]
          } else {
            // Registry/USDCx token → X
            const regId = registryTokenIdForSymbol(config.symbolA)
            if (regId) {
              setStatusMsg(`Preparing ${config.symbolA} record...`)
              usedRecord = await prepareRegistryTokenForTx(walletExecute, requestRecords, regId, amountInBig, address)
              fnName = config.swapAForB
              recordIndices = [0]
            } else {
              throw new Error(`Unsupported token A: ${config.symbolA}`)
            }
          }
        } else {
          // Token B → Token A
          if (config.symbolB === 'USDCx') {
            setStatusMsg('Preparing USDCx record...')
            const { tokenRecord: usdcxRec, merkleProofs } = await prepareUsdcxForTx(walletExecute, requestRecords, amountInBig, address)
            usedRecord = usdcxRec
            inputs = [usdcxRec, merkleProofs]
            fnName = config.swapBForA
            recordIndices = [0]
          } else {
            const regId = registryTokenIdForSymbol(config.symbolB)
            if (regId) {
              setStatusMsg(`Preparing ${config.symbolB} record...`)
              usedRecord = await prepareRegistryTokenForTx(walletExecute, requestRecords, regId, amountInBig, address)
              fnName = config.swapBForA
              recordIndices = [0]
            } else {
              throw new Error(`Unsupported token B: ${config.symbolB}`)
            }
          }
        }

        const liveReserves = await fetchPoolReservesStrict(poolId, config.program)
        const [reserveIn, reserveOut] = isAtoB
          ? [liveReserves.reserveA, liveReserves.reserveB]
          : [liveReserves.reserveB, liveReserves.reserveA]
        const liveOut = cpmmOutputWithFee(amountInBig, reserveIn, reserveOut, liveReserves.feesBps)
        let routerPlan: AtomicRoutePlan | null = null
        try {
          if (usedRecord) {
            routerPlan = await chooseAtomicRouterPlan(poolId, isAtoB, amountInBig, minOut, usedRecord)
          }
        } catch (routeError) {
          console.warn('[SwapExecute] Atomic router quote failed, falling back to direct AMM:', routeError)
        }

        const bestLiveOut = routerPlan && routerPlan.liveOut > liveOut ? routerPlan.liveOut : liveOut
        if (bestLiveOut < minOut) {
          throw new Error(
            `Swap output moved below your minimum received. Best live output is ${(Number(bestLiveOut) / 10 ** decimals).toFixed(6)} ${toToken}, minimum is ${(Number(minOut) / 10 ** decimals).toFixed(6)} ${toToken}.`
          )
        }

        if (routerPlan && routerPlan.liveOut > liveOut) {
          program = PROGRAMS.ROUTER
          fnName = routerPlan.fnName
          inputs = routerPlan.inputs
          setStatusMsg(`Routing shielded AMM swap via ${routerPlan.label}...`)
        } else if (isAtoB) {
          if (config.tokenAIsCredits) {
            inputs = config.symbolB === 'USDCx'
              ? buildSwapAleoForUsdcxInputs(usedRecord!, poolId, amountInBig, liveReserves, minOut)
              : buildSwapNativeForTokenInputs(usedRecord!, poolId, amountInBig, liveReserves, minOut)
          } else {
            inputs = config.symbolB === 'USDCx'
              ? buildSwapTokenForUsdcxInputs(usedRecord!, poolId, amountInBig, liveReserves, minOut)
              : buildPureTokenSwapInputs(usedRecord!, poolId, amountInBig, liveReserves, minOut)
          }
        } else if (config.symbolB === 'USDCx') {
          const [usdcxRec, merkleProofs] = inputs
          inputs = config.tokenAIsCredits
            ? buildSwapUsdcxForAleoInputs(usdcxRec, merkleProofs, poolId, amountInBig, liveReserves, minOut)
            : buildSwapUsdcxForTokenInputs(usdcxRec, merkleProofs, poolId, amountInBig, liveReserves, minOut)
        } else {
          inputs = buildPureTokenSwapInputs(usedRecord!, poolId, amountInBig, liveReserves, minOut)
        }

        setStatusMsg(null)
        setProofStatus('proving')
        const id = await executeOnChain(walletExecute, program, fnName, inputs, txFee, false, recordIndices)
        if (usedRecord) markRecordSpent(usedRecord)
        submittedTxId = id
        setTxId(id)
        setProofStatus('verified')
        setTxStatus('pending')
        const finalStatus = await pollTransactionStatus(id, setTxStatus, 3_000, 180_000, walletTxStatus)
        if (finalStatus === 'rejected') {
          setError(await buildSwapRejectionMessage(id, `${fromToken}/${toToken}`, walletTxStatus))
          setProofStatus('idle')
          window.dispatchEvent(new Event('privadex:txEnd'))
          return false
        }

      } else if (venue === 'darkpool') {
        // ─── Dark Pool (ALEO/USDCx only) ───
        if (poolId !== POOL_IDS.ALEO_USDCX) {
          throw new Error('Dark Pool only supports ALEO/USDCx pair. Use AMM for this trade.')
        }
        program = PROGRAMS.DARKPOOL
        const heightRes = await fetch('https://api.explorer.provable.com/v1/testnet/latest/height', { signal: AbortSignal.timeout(5000) })
        const height = parseInt(await heightRes.text())
        const epochId = currentEpochId(height)
        const nonce = randomNonce()

        if (isAtoB) {
          // SELL ALEO → USDCx
          setStatusMsg('Preparing ALEO record...')
          await prepareExactCreditsRecord(walletExecute, requestRecords, address, amountInBig, (msg) => setStatusMsg(msg))
          const freshCreds = await fetchRecordsRobust(requestRecords, 'credits.aleo')
          const exactCred = freshCreds.filter((r: any) => !r.spent && !isRecordManuallySpent(r)).find((r: any) => getRecordCredits(r) === amountInBig)
          if (!exactCred) throw new Error('Credits record not found.')
          usedRecord = exactCred.recordPlaintext || exactCred.plaintext
          inputs = buildDarkSellAleoInputs(usedRecord!, poolId, minOut, nonce, epochId)
          fnName = DARKPOOL_FNS.SUBMIT_SELL_ALEO
          recordIndices = [0]
        } else {
          // BUY ALEO ← USDCx
          setStatusMsg('Preparing USDCx record...')
          const { tokenRecord: usdcxRec, merkleProofs } = await prepareUsdcxForTx(walletExecute, requestRecords, amountInBig, address)
          usedRecord = usdcxRec
          inputs = buildDarkBuyAleoInputs(usdcxRec, merkleProofs, poolId, amountInBig, minOut, nonce, epochId)
          fnName = DARKPOOL_FNS.SUBMIT_BUY_ALEO
          recordIndices = [0]
        }

        setStatusMsg(null)
        setProofStatus('proving')
        const id = await executeOnChain(walletExecute, program, fnName, inputs, txFee, false, recordIndices)
        if (usedRecord) markRecordSpent(usedRecord)
        submittedTxId = id
        setTxId(id)
        setProofStatus('verified')
        setTxStatus('pending')
        const finalStatus = await pollTransactionStatus(id, setTxStatus, 3_000, 180_000, walletTxStatus)
        if (finalStatus === 'rejected') {
          setError(await buildSwapRejectionMessage(id, `${fromToken}/${toToken}`, walletTxStatus))
          setProofStatus('idle')
          window.dispatchEvent(new Event('privadex:txEnd'))
          return false
        }

      } else if (venue === 'orderbook') {
        // ─── Order Book (ALEO/USDCx only) ───
        if (poolId !== POOL_IDS.ALEO_USDCX) {
          throw new Error('Order Book only supports ALEO/USDCx pair. Use AMM for this trade.')
        }
        program = PROGRAMS.ORDERBOOK
        const heightRes = await fetch('https://api.explorer.provable.com/v1/testnet/latest/height', { signal: AbortSignal.timeout(5000) })
        const height = parseInt(await heightRes.text())
        const nonce = randomNonce()
        const expiryBl = expiryInEpochs(height, 2) // 2 epochs ≈ 4min
        const limitPrice = priceToFixed(Number(minOut) / Number(amountInBig) || 0.01)

        if (isAtoB) {
          setStatusMsg('Preparing ALEO record...')
          await prepareExactCreditsRecord(walletExecute, requestRecords, address, amountInBig, (msg) => setStatusMsg(msg))
          const freshCreds = await fetchRecordsRobust(requestRecords, 'credits.aleo')
          const exactCred = freshCreds.filter((r: any) => !r.spent && !isRecordManuallySpent(r)).find((r: any) => getRecordCredits(r) === amountInBig)
          if (!exactCred) throw new Error('Credits record not found.')
          usedRecord = exactCred.recordPlaintext || exactCred.plaintext
          inputs = buildSellLimitInputs(usedRecord!, poolId, limitPrice, expiryBl, nonce)
          fnName = ORDERBOOK_FNS.PLACE_SELL_LIMIT
          recordIndices = [0]
        } else {
          setStatusMsg('Preparing USDCx record...')
          const { tokenRecord: usdcxRec, merkleProofs } = await prepareUsdcxForTx(walletExecute, requestRecords, amountInBig, address)
          usedRecord = usdcxRec
          inputs = buildBuyLimitInputs(usdcxRec, merkleProofs, poolId, amountInBig, limitPrice, expiryBl, nonce)
          fnName = ORDERBOOK_FNS.PLACE_BUY_LIMIT
          recordIndices = [0]
        }

        setStatusMsg(null)
        setProofStatus('proving')
        const id = await executeOnChain(walletExecute, program, fnName, inputs, txFee, false, recordIndices)
        if (usedRecord) markRecordSpent(usedRecord)
        submittedTxId = id
        setTxId(id)
        setProofStatus('verified')
        setTxStatus('pending')
        const finalStatus = await pollTransactionStatus(id, setTxStatus, 3_000, 180_000, walletTxStatus)
        if (finalStatus === 'rejected') {
          setError(await buildSwapRejectionMessage(id, `${fromToken}/${toToken}`, walletTxStatus))
          setProofStatus('idle')
          window.dispatchEvent(new Event('privadex:txEnd'))
          return false
        }
      }

      setProofStatus('idle')
      setStatusMsg(null)

      // Record trade in history
      addTradeEntry(address, {
        type: venue === 'darkpool' ? 'Dark Pool' : venue === 'orderbook' ? 'Limit Order' : 'Swap',
        pair: `${fromToken}/${toToken}`,
        side: isAtoB ? 'SELL' : 'BUY',
        amountIn: `${amountIn} ${fromToken}`,
        amountOut: `${(Number(minOut) / 10 ** decimals).toFixed(4)} ${toToken}`,
        txId: submittedTxId || txId || 'pending',
        venue: venue === 'amm' ? 'AMM' : venue === 'darkpool' ? 'Dark Pool' : 'Order Book',
      })

      // Refresh balances
      window.dispatchEvent(new Event('privadex:txEnd'))
      window.dispatchEvent(new Event('privadex:balanceRefresh'))
      setTimeout(() => refreshBalances(), 10_000)

      return true
    } catch (err: any) {
      let msg = err?.message ?? 'Transaction failed.'
      if (msg.includes('already exists in the ledger') || msg.includes('input ID')) {
        msg = 'Record already spent on-chain. Disconnect and reconnect wallet.'
      }
      setError(msg)
      setProofStatus('idle')
      window.dispatchEvent(new Event('privadex:txEnd'))
      return false
    }
  }, [connected, address, walletExecute, requestRecords, refreshBalances, reset, walletTxStatus])

  return {
    proofStatus,
    txStatus,
    txId,
    error,
    statusMsg,
    executeSwap,
    reset,
  }
}
