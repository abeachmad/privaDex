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
  fetchRecordsForTx, getRecordCredits, getPublicAleoBalance, fetchPoolReservesStrict, cpmmOutputWithFee,
  registryTokenIdForSymbol, fetchDarkPoolInitializationState, extractWalletTransactionError,
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

const TESTNET_HEIGHT_URL = 'https://api.explorer.provable.com/v1/testnet/latest/height'
const DARKPOOL_EPOCH_DURATION = 120
const DARKPOOL_MIN_BLOCKS_LEFT = 45

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isLikelyStaleInputError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('already exists in the ledger') ||
    lower.includes('input id') ||
    lower.includes('spent')
  )
}

function isLikelyWalletTransportError(message?: string | null): boolean {
  const lower = String(message || '').toLowerCase()
  return (
    lower.includes('network error') ||
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('imported program') ||
    lower.includes('program-fetch') ||
    lower.includes('could not create transaction')
  )
}

async function fetchLatestTestnetHeight(): Promise<number> {
  const res = await fetch(TESTNET_HEIGHT_URL, { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error('Failed to fetch latest Aleo block height.')

  const height = parseInt(await res.text(), 10)
  if (!Number.isFinite(height)) {
    throw new Error('Latest Aleo block height was invalid.')
  }

  return height
}

async function waitForPreparationTransactions(
  prepTxIds: string[],
  walletTransactionStatus?: (txId: string) => Promise<any>,
  onStatus?: (msg: string | null) => void,
) {
  const uniqueTxIds = [...new Set(prepTxIds.filter(Boolean))]
  for (const prepTxId of uniqueTxIds) {
    onStatus?.('Waiting for record preparation to finalize...')
    const status = await pollTransactionStatus(prepTxId, undefined, 3_000, 180_000, walletTransactionStatus)
    if (status === 'rejected') {
      throw new Error('A record preparation transaction was rejected on-chain.')
    }
  }
}

async function waitForSafeDarkPoolEpochWindow(
  onStatus?: (msg: string | null) => void,
  minBlocksLeft = DARKPOOL_MIN_BLOCKS_LEFT,
  maxWaitMs = 180_000,
): Promise<{ height: number; epochId: number; blocksLeft: number }> {
  const start = Date.now()

  while (true) {
    const height = await fetchLatestTestnetHeight()
    const blocksLeft = DARKPOOL_EPOCH_DURATION - (height % DARKPOOL_EPOCH_DURATION)
    const epochId = currentEpochId(height, DARKPOOL_EPOCH_DURATION)

    if (blocksLeft > minBlocksLeft) {
      return { height, epochId, blocksLeft }
    }

    const approxSeconds = Math.max(5, Math.ceil(blocksLeft * 3.5))
    onStatus?.(`Waiting for the next dark pool epoch window (~${approxSeconds}s)...`)
    if (Date.now() - start >= maxWaitMs) {
      throw new Error(`Dark Pool epoch is rotating right now. Please retry in about ${approxSeconds} seconds.`)
    }

    await sleep(2_500)
  }
}

async function buildSwapRejectionMessage(
  txId: string,
  pairLabel: string,
  venue: Venue,
  walletTransactionStatus?: (txId: string) => Promise<any>,
): Promise<string> {
  const walletStatus = walletTransactionStatus ? await walletTransactionStatus(txId).catch(() => null) : null
  const resolvedTxId = await resolveOnChainTransactionId(txId, walletTransactionStatus)
  const body = resolvedTxId ? await fetchTransactionBody(resolvedTxId) : null
  const lowerBody = body?.toLowerCase() ?? ''
  const txSuffix = resolvedTxId ? ` TX: ${resolvedTxId}` : ''
  const walletError = extractWalletTransactionError(walletStatus)

  if (!resolvedTxId) {
    if (venue === 'darkpool') {
      const detailSuffix = walletError ? ` Wallet detail: ${walletError}` : ''
      return `Dark Pool submission ${pairLabel} was rejected before the wallet exposed a real on-chain tx id. This is usually a Shield Wallet / proving / program-fetch failure, not a finalized on-chain reject. Reconnect the wallet, refresh records, and retry in a fresh epoch window.${detailSuffix}`
    }

    if (venue === 'orderbook') {
      const detailSuffix = walletError ? ` Wallet detail: ${walletError}` : ''
      return `Order Book submission ${pairLabel} was rejected before the wallet exposed a real on-chain tx id. This usually points to a wallet-side proving or program-fetch failure. Reconnect the wallet and retry.${detailSuffix}`
    }

    const detailSuffix = walletError ? ` Wallet detail: ${walletError}` : ''
    return `Swap ${pairLabel} was rejected before the wallet exposed a real on-chain tx id. This usually points to a wallet-side proving, import fetch, or signing failure. Reconnect the wallet and retry.${detailSuffix}`
  }

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

  if (venue === 'darkpool') {
    const darkPoolInit = await fetchDarkPoolInitializationState()
    if (darkPoolInit.reachable && !darkPoolInit.initialized) {
      return `Dark Pool contract ${PROGRAMS.DARKPOOL} is not initialized on-chain yet. Ask an admin to run initialize(admin) before submitting intents.${txSuffix}`
    }

    if (
      lowerBody.includes('epoch_id') ||
      lowerBody.includes('current_epoch') ||
      lowerBody.includes('epoch_closed') ||
      lowerBody.includes('submit_buy_aleo') ||
      lowerBody.includes('submit_sell_aleo') ||
      lowerBody.includes('finalize_submit') ||
      lowerBody.includes('closed')
    ) {
      return `Dark Pool intent ${pairLabel} missed the active epoch window or that epoch was already closed.${txSuffix}`
    }

    if (lowerBody.includes('assert')) {
      return `Dark Pool intent ${pairLabel} was rejected during epoch admission. The epoch may have rolled over before the transaction finalized.${txSuffix}`
    }

    return `Dark Pool intent ${pairLabel} was rejected on-chain. This usually comes from epoch rollover, input record state, or USDCx escrow checks.${txSuffix}`
  }

  if (venue === 'orderbook') {
    if (lowerBody.includes('assert') || lowerBody.includes('expiry') || lowerBody.includes('limit')) {
      return `Order Book submission ${pairLabel} was rejected on-chain. The order window or limit-order constraints may have changed before confirmation.${txSuffix}`
    }

    return `Order Book submission ${pairLabel} was rejected on-chain. This can come from input record state, order constraints, or USDCx escrow checks.${txSuffix}`
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
  const {
    connected,
    address,
    walletName,
    executeTransaction: walletExecute,
    requestRecords,
    refreshBalances,
    transactionStatus: walletTxStatus,
    ensureShieldPrograms,
  } = useWallet()
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
      const prepareUsdcxInput = async (
        amountRequired: bigint,
        exclusions?: Set<string>,
      ) => {
        const prepTxIds: string[] = []
        const rememberPrepTx = (txId: string) => {
          prepTxIds.push(txId)
        }

        const prepared = await prepareUsdcxForTx(
          walletExecute,
          requestRecords,
          amountRequired,
          address,
          exclusions,
          rememberPrepTx,
        )
        await waitForPreparationTransactions(prepTxIds, walletTxStatus, setStatusMsg)
        return prepared
      }

      const maybeRetryWalletSideFailure = async (
        failedTxId: string,
        scope: 'darkpool' | 'orderbook',
        rebuildSubmission: (reason: 'transport' | 'stale') => Promise<void>,
      ): Promise<string | null> => {
        if (walletName !== 'Shield Wallet') return null

        const walletStatus = walletTxStatus ? await walletTxStatus(failedTxId).catch(() => null) : null
        const resolvedTxId = await resolveOnChainTransactionId(failedTxId, walletTxStatus)
        const walletError = extractWalletTransactionError(walletStatus)
        const isTransportFailure = !resolvedTxId && isLikelyWalletTransportError(walletError)
        const isStaleFailure = !resolvedTxId && isLikelyStaleInputError(walletError || '')

        if (!isTransportFailure && !isStaleFailure) {
          return null
        }

        setStatusMsg(isStaleFailure
          ? 'Refreshing records after stale wallet rejection...'
          : 'Refreshing Shield Wallet session and retrying...')
        setProofStatus('preparing')

        if (isTransportFailure) {
          try {
            await ensureShieldPrograms(scope)
          } catch (refreshErr) {
            console.warn('[SwapExecute] Shield program refresh failed before retry', refreshErr)
            return null
          }
        }

        await rebuildSubmission(isStaleFailure ? 'stale' : 'transport')
        setStatusMsg(null)
        setProofStatus('proving')

        const retriedTxId = await executeOnChain(walletExecute, program, fnName, inputs, txFee, false, recordIndices)
        setTxId(retriedTxId)
        submittedTxId = retriedTxId
        return retriedTxId
      }

      const prepareRegistryTokenInput = async (
        regId: string,
        amountRequired: bigint,
        exclusions?: Set<string>,
      ) => {
        const prepTxIds: string[] = []
        const rememberPrepTx = (txId: string) => {
          prepTxIds.push(txId)
        }

        const tokenRecord = await prepareRegistryTokenForTx(
          walletExecute,
          requestRecords,
          regId,
          amountRequired,
          address,
          exclusions,
          rememberPrepTx,
        )
        await waitForPreparationTransactions(prepTxIds, walletTxStatus, setStatusMsg)
        return tokenRecord
      }

      const config = POOL_AMM_CONFIG[poolId]
      if (!config) throw new Error(`Unknown pool ID: ${poolId}`)

      // Fee check
      const txFee = 1_500_000
      const pubBal = await getPublicAleoBalance(address)
      if (pubBal < BigInt(txFee)) {
        throw new Error(`Insufficient public ALEO for fee: have ${(Number(pubBal) / 1e6).toFixed(2)}, need ${(txFee / 1e6).toFixed(2)}`)
      }

      let inputs: string[] = []
      let program = ''
      let fnName = ''
      let recordIndices: number[] = []

      if (venue === 'amm') {
        // ─── AMM Swap ───
        const buildAmmSubmission = async (excludedRecord?: Set<string>) => {
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
                excludedRecord,
              )
              fnName = config.swapAForB
              recordIndices = [0]
            } else {
              const regId = registryTokenIdForSymbol(config.symbolA)
              if (!regId) throw new Error(`Unsupported token A: ${config.symbolA}`)
              setStatusMsg(`Preparing ${config.symbolA} record...`)
              usedRecord = await prepareRegistryTokenInput(regId, amountInBig, excludedRecord)
              fnName = config.swapAForB
              recordIndices = [0]
            }
          } else {
            // Token B → Token A
            if (config.symbolB === 'USDCx') {
              setStatusMsg('Preparing USDCx record...')
              const { tokenRecord: usdcxRec, merkleProofs } = await prepareUsdcxInput(amountInBig, excludedRecord)
              usedRecord = usdcxRec
              inputs = [usdcxRec, merkleProofs]
              fnName = config.swapBForA
              recordIndices = [0]
            } else {
              const regId = registryTokenIdForSymbol(config.symbolB)
              if (!regId) throw new Error(`Unsupported token B: ${config.symbolB}`)
              setStatusMsg(`Preparing ${config.symbolB} record...`)
              usedRecord = await prepareRegistryTokenInput(regId, amountInBig, excludedRecord)
              fnName = config.swapBForA
              recordIndices = [0]
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
        }

        await buildAmmSubmission()

        setStatusMsg(null)
        setProofStatus('proving')
        let id: string
        try {
          id = await executeOnChain(walletExecute, program, fnName, inputs, txFee, false, recordIndices)
        } catch (execErr: any) {
          const execMsg = execErr?.message ?? 'Swap failed.'
          const isStaleInput = isLikelyStaleInputError(execMsg)

          if (!isStaleInput) throw execErr

          console.warn('[SwapExecute] AMM stale input detected, retrying with refreshed records', execMsg)
          setStatusMsg('Refreshing records after stale-input error...')
          await buildAmmSubmission(usedRecord ? new Set([usedRecord]) : undefined)
          setStatusMsg(null)
          setProofStatus('proving')
          id = await executeOnChain(walletExecute, program, fnName, inputs, txFee, false, recordIndices)
        }
        if (usedRecord) markRecordSpent(usedRecord)
        submittedTxId = id
        setTxId(id)
        setProofStatus('verified')
        setTxStatus('pending')
        const finalStatus = await pollTransactionStatus(id, setTxStatus, 3_000, 180_000, walletTxStatus)
        if (finalStatus === 'rejected') {
          setError(await buildSwapRejectionMessage(id, `${fromToken}/${toToken}`, venue, walletTxStatus))
          setProofStatus('idle')
          window.dispatchEvent(new Event('privadex:txEnd'))
          return false
        }

      } else if (venue === 'darkpool') {
        // ─── Dark Pool (ALEO/USDCx only) ───
        if (poolId !== POOL_IDS.ALEO_USDCX) {
          throw new Error('Dark Pool only supports ALEO/USDCx pair. Use AMM for this trade.')
        }
        setStatusMsg('Checking dark pool readiness...')
        const darkPoolInit = await fetchDarkPoolInitializationState()
        if (darkPoolInit.reachable && !darkPoolInit.initialized) {
          throw new Error(`Dark Pool contract ${PROGRAMS.DARKPOOL} is not initialized on-chain yet. Ask an admin to run initialize(admin) before submitting intents.`)
        }
        program = PROGRAMS.DARKPOOL
        const buildDarkPoolSubmission = async (exclusions?: { credits?: Set<string>; usdcx?: Set<string> }) => {
          const nonce = randomNonce()

          if (isAtoB) {
            // SELL ALEO → USDCx
            setStatusMsg('Preparing ALEO record...')
            await prepareExactCreditsRecord(
              walletExecute,
              requestRecords,
              address,
              amountInBig,
              (msg) => setStatusMsg(msg),
              exclusions?.credits,
            )
            const freshCreds = await fetchRecordsForTx(requestRecords, 'credits.aleo')
            const exactCred = freshCreds
              .filter((r: any) => !r.spent && !isRecordManuallySpent(r))
              .find((r: any) => {
                const plaintext = r.recordPlaintext || r.plaintext
                return !exclusions?.credits?.has(plaintext) && getRecordCredits(r) === amountInBig
              })
            if (!exactCred) throw new Error('Credits record not found.')
            usedRecord = exactCred.recordPlaintext || exactCred.plaintext
            setStatusMsg('Checking dark pool epoch...')
            const { epochId } = await waitForSafeDarkPoolEpochWindow(setStatusMsg)
            inputs = buildDarkSellAleoInputs(usedRecord!, poolId, minOut, nonce, epochId)
            fnName = DARKPOOL_FNS.SUBMIT_SELL_ALEO
            recordIndices = [0]
            return
          }

          // BUY ALEO ← USDCx
          setStatusMsg('Preparing USDCx record...')
          const { tokenRecord: usdcxRec, merkleProofs } = await prepareUsdcxInput(amountInBig, exclusions?.usdcx)
          usedRecord = usdcxRec
          setStatusMsg('Checking dark pool epoch...')
          const { epochId } = await waitForSafeDarkPoolEpochWindow(setStatusMsg)
          inputs = buildDarkBuyAleoInputs(usdcxRec, merkleProofs, poolId, amountInBig, minOut, nonce, epochId)
          fnName = DARKPOOL_FNS.SUBMIT_BUY_ALEO
          recordIndices = [0]
        }

        await buildDarkPoolSubmission()

        setStatusMsg(null)
        setProofStatus('proving')
        if (walletName === 'Shield Wallet') {
          await ensureShieldPrograms('darkpool').catch((refreshErr) => {
            console.warn('[SwapExecute] Pre-submit Shield refresh skipped for dark pool', refreshErr)
          })
        }
        let id: string
        try {
          id = await executeOnChain(walletExecute, program, fnName, inputs, txFee, false, recordIndices)
        } catch (execErr: any) {
          const execMsg = execErr?.message ?? 'Dark Pool submission failed.'
          const isStaleInput = isLikelyStaleInputError(execMsg)

          if (!isStaleInput) throw execErr

          console.warn('[SwapExecute] Dark Pool stale input detected, retrying with refreshed records', execMsg)
          if (usedRecord) markRecordSpent(usedRecord)
          setStatusMsg('Refreshing records after stale-input error...')
          await buildDarkPoolSubmission(
            isAtoB
              ? { credits: usedRecord ? new Set([usedRecord]) : undefined }
              : { usdcx: usedRecord ? new Set([usedRecord]) : undefined }
          )
          setStatusMsg(null)
          setProofStatus('proving')
          if (walletName === 'Shield Wallet') {
            await ensureShieldPrograms('darkpool').catch((refreshErr) => {
              console.warn('[SwapExecute] Shield refresh skipped during stale-input retry', refreshErr)
            })
          }
          id = await executeOnChain(walletExecute, program, fnName, inputs, txFee, false, recordIndices)
        }
        submittedTxId = id
        setTxId(id)
        setProofStatus('verified')
        setTxStatus('pending')
        let finalStatus = await pollTransactionStatus(id, setTxStatus, 3_000, 180_000, walletTxStatus)
        if (finalStatus === 'rejected') {
          const lastUsedRecord = usedRecord
          const retriedTxId = await maybeRetryWalletSideFailure(id, 'darkpool', async (reason) => {
            if (reason === 'stale' && lastUsedRecord) {
              markRecordSpent(lastUsedRecord)
            }
            await buildDarkPoolSubmission(
              reason === 'stale'
                ? (
                  isAtoB
                    ? { credits: lastUsedRecord ? new Set([lastUsedRecord]) : undefined }
                    : { usdcx: lastUsedRecord ? new Set([lastUsedRecord]) : undefined }
                )
                : undefined
            )
          })
          if (retriedTxId) {
            id = retriedTxId
            finalStatus = await pollTransactionStatus(id, setTxStatus, 3_000, 180_000, walletTxStatus)
          }
        }
        if (finalStatus === 'rejected') {
          setError(await buildSwapRejectionMessage(id, `${fromToken}/${toToken}`, venue, walletTxStatus))
          setProofStatus('idle')
          window.dispatchEvent(new Event('privadex:txEnd'))
          return false
        }
        if (usedRecord) markRecordSpent(usedRecord)

      } else if (venue === 'orderbook') {
        // ─── Order Book (ALEO/USDCx only) ───
        if (poolId !== POOL_IDS.ALEO_USDCX) {
          throw new Error('Order Book only supports ALEO/USDCx pair. Use AMM for this trade.')
        }
        program = PROGRAMS.ORDERBOOK
        const buildOrderBookSubmission = async (exclusions?: { credits?: Set<string>; usdcx?: Set<string> }) => {
          const height = await fetchLatestTestnetHeight()
          const nonce = randomNonce()
          const expiryBl = expiryInEpochs(height, 2) // 2 epochs ≈ 4min
          const limitPrice = priceToFixed(Number(minOut) / Number(amountInBig) || 0.01)

          if (isAtoB) {
            setStatusMsg('Preparing ALEO record...')
            await prepareExactCreditsRecord(
              walletExecute,
              requestRecords,
              address,
              amountInBig,
              (msg) => setStatusMsg(msg),
              exclusions?.credits,
            )
            const freshCreds = await fetchRecordsForTx(requestRecords, 'credits.aleo')
            const exactCred = freshCreds
              .filter((r: any) => !r.spent && !isRecordManuallySpent(r))
              .find((r: any) => {
                const plaintext = r.recordPlaintext || r.plaintext
                return !exclusions?.credits?.has(plaintext) && getRecordCredits(r) === amountInBig
              })
            if (!exactCred) throw new Error('Credits record not found.')
            usedRecord = exactCred.recordPlaintext || exactCred.plaintext
            inputs = buildSellLimitInputs(usedRecord!, poolId, limitPrice, expiryBl, nonce)
            fnName = ORDERBOOK_FNS.PLACE_SELL_LIMIT
            recordIndices = [0]
            return
          }

          setStatusMsg('Preparing USDCx record...')
          const { tokenRecord: usdcxRec, merkleProofs } = await prepareUsdcxInput(amountInBig, exclusions?.usdcx)
          usedRecord = usdcxRec
          inputs = buildBuyLimitInputs(usdcxRec, merkleProofs, poolId, amountInBig, limitPrice, expiryBl, nonce)
          fnName = ORDERBOOK_FNS.PLACE_BUY_LIMIT
          recordIndices = [0]
        }

        await buildOrderBookSubmission()

        setStatusMsg(null)
        setProofStatus('proving')
        if (walletName === 'Shield Wallet') {
          await ensureShieldPrograms('orderbook').catch((refreshErr) => {
            console.warn('[SwapExecute] Pre-submit Shield refresh skipped for order book', refreshErr)
          })
        }
        let id: string
        try {
          id = await executeOnChain(walletExecute, program, fnName, inputs, txFee, false, recordIndices)
        } catch (execErr: any) {
          const execMsg = execErr?.message ?? 'Order Book submission failed.'
          const isStaleInput = isLikelyStaleInputError(execMsg)

          if (!isStaleInput) throw execErr

          console.warn('[SwapExecute] Order Book stale input detected, retrying with refreshed records', execMsg)
          if (usedRecord) markRecordSpent(usedRecord)
          setStatusMsg('Refreshing records after stale-input error...')
          await buildOrderBookSubmission(
            isAtoB
              ? { credits: usedRecord ? new Set([usedRecord]) : undefined }
              : { usdcx: usedRecord ? new Set([usedRecord]) : undefined }
          )
          setStatusMsg(null)
          setProofStatus('proving')
          if (walletName === 'Shield Wallet') {
            await ensureShieldPrograms('orderbook').catch((refreshErr) => {
              console.warn('[SwapExecute] Shield refresh skipped during stale-input retry', refreshErr)
            })
          }
          id = await executeOnChain(walletExecute, program, fnName, inputs, txFee, false, recordIndices)
        }
        submittedTxId = id
        setTxId(id)
        setProofStatus('verified')
        setTxStatus('pending')
        let finalStatus = await pollTransactionStatus(id, setTxStatus, 3_000, 180_000, walletTxStatus)
        if (finalStatus === 'rejected') {
          const lastUsedRecord = usedRecord
          const retriedTxId = await maybeRetryWalletSideFailure(id, 'orderbook', async (reason) => {
            if (reason === 'stale' && lastUsedRecord) {
              markRecordSpent(lastUsedRecord)
            }
            await buildOrderBookSubmission(
              reason === 'stale'
                ? (
                  isAtoB
                    ? { credits: lastUsedRecord ? new Set([lastUsedRecord]) : undefined }
                    : { usdcx: lastUsedRecord ? new Set([lastUsedRecord]) : undefined }
                )
                : undefined
            )
          })
          if (retriedTxId) {
            id = retriedTxId
            finalStatus = await pollTransactionStatus(id, setTxStatus, 3_000, 180_000, walletTxStatus)
          }
        }
        if (finalStatus === 'rejected') {
          setError(await buildSwapRejectionMessage(id, `${fromToken}/${toToken}`, venue, walletTxStatus))
          setProofStatus('idle')
          window.dispatchEvent(new Event('privadex:txEnd'))
          return false
        }
        if (usedRecord) markRecordSpent(usedRecord)
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
      if (isLikelyStaleInputError(msg)) {
        msg = 'Record already spent on-chain. Disconnect and reconnect wallet.'
      }
      setError(msg)
      setProofStatus('idle')
      window.dispatchEvent(new Event('privadex:txEnd'))
      return false
    }
  }, [connected, address, walletName, walletExecute, requestRecords, refreshBalances, reset, walletTxStatus, ensureShieldPrograms])

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
