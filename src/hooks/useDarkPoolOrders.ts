import { useCallback, useEffect, useState } from 'react'
import { useWallet } from '../context/WalletContext'
import {
  estimateDarkPoolBuyClaim,
  estimateDarkPoolSellClaim,
  executeOnChain,
  fetchEpochState,
  fetchRecordsRobust,
  getRecordField,
  getRecordType,
  parseLeoInt,
  pollTransactionStatus,
  type DarkPoolSettlementPreview,
  type EpochState,
  type TxStatus,
} from '../lib/aleo'
import {
  buildDarkBuyClaimInputs,
  buildDarkSellClaimInputs,
  DARKPOOL_FNS,
  PROGRAMS,
} from '../lib/programs'

type DarkPoolOrderStatus = 'pending' | 'claimable'
type DarkPoolActionMode = 'claim' | 'cancel'
type DarkPoolReceiptOutcome = 'settled' | 'refunded' | 'cancelled'

export interface DarkPoolIntentEntry {
  id: string
  recordPlaintext: string
  isBuy: boolean
  side: 'buy' | 'sell'
  epochId: number
  poolId: number
  amount: bigint
  minOut: bigint
  nonce: string
  status: DarkPoolOrderStatus
  epochState: EpochState | null
  preview: DarkPoolSettlementPreview | null
}

export interface DarkPoolReceiptEntry {
  id: string
  recordPlaintext: string
  isBuy: boolean
  side: 'buy' | 'sell'
  epochId: number
  poolId: number
  matchedInput: bigint
  refundInput: bigint
  amountOut: bigint
  feePaid: bigint
  midPrice: bigint
  outcome: DarkPoolReceiptOutcome
}

export interface DarkPoolActionState {
  orderId: string | null
  mode: DarkPoolActionMode | null
  txStatus: TxStatus | null
  txId: string | null
  error: string | null
}

function getPlaintext(record: any): string {
  return record?.recordPlaintext ?? record?.plaintext ?? ''
}

function isDarkIntentRecord(record: any): boolean {
  const type = getRecordType(record).toLowerCase()
  return type === 'darkintent'
    || (
      getRecordField(record, 'epoch_id') != null
      && getRecordField(record, 'is_buy') != null
      && getRecordField(record, 'amount') != null
      && getRecordField(record, 'nonce') != null
    )
}

function isDarkReceiptRecord(record: any): boolean {
  const type = getRecordType(record).toLowerCase()
  return type === 'darkreceipt'
    || (
      getRecordField(record, 'matched_input') != null
      && getRecordField(record, 'refund_input') != null
      && getRecordField(record, 'amount_out') != null
    )
}

function parseBoolField(record: any, field: string): boolean {
  return (getRecordField(record, field) ?? 'false') === 'true'
}

function epochCacheKey(epochId: number, poolId: number): string {
  return `${epochId}:${poolId}`
}

function deriveReceiptOutcome(receipt: Pick<DarkPoolReceiptEntry, 'matchedInput' | 'refundInput' | 'amountOut' | 'midPrice'>): DarkPoolReceiptOutcome {
  if (receipt.matchedInput === 0n && receipt.amountOut === 0n) {
    return receipt.midPrice === 0n ? 'cancelled' : 'refunded'
  }
  return 'settled'
}

export function useDarkPoolOrders() {
  const {
    connected,
    address,
    requestRecords,
    executeTransaction: walletExecute,
    transactionStatus: walletTxStatus,
  } = useWallet()

  const [pendingOrders, setPendingOrders] = useState<DarkPoolIntentEntry[]>([])
  const [settledOrders, setSettledOrders] = useState<DarkPoolReceiptEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [actionState, setActionState] = useState<DarkPoolActionState>({
    orderId: null,
    mode: null,
    txStatus: null,
    txId: null,
    error: null,
  })

  const fetchOrders = useCallback(async () => {
    if (!connected || !address || !requestRecords) {
      setPendingOrders([])
      setSettledOrders([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const records = await fetchRecordsRobust(requestRecords, PROGRAMS.DARKPOOL, {
        preferScanner: true,
        skipCache: true,
      })

      const liveRecords = records.filter((record: any) => !record?.spent)
      const rawIntents = liveRecords.filter(isDarkIntentRecord)
      const rawReceipts = liveRecords.filter(isDarkReceiptRecord)

      const epochKeys = Array.from(new Set(rawIntents.map((record: any) => {
        const epochId = Number(parseLeoInt(getRecordField(record, 'epoch_id') ?? '0u64'))
        const poolId = Number(parseLeoInt(getRecordField(record, 'pool_id') ?? '0u64'))
        return epochCacheKey(epochId, poolId)
      })))

      const epochSnapshots = new Map<string, EpochState | null>()
      await Promise.all(epochKeys.map(async (key) => {
        const [epochIdRaw, poolIdRaw] = key.split(':')
        const epochId = Number(epochIdRaw)
        const poolId = Number(poolIdRaw)
        try {
          epochSnapshots.set(key, await fetchEpochState(epochId, poolId))
        } catch {
          epochSnapshots.set(key, null)
        }
      }))

      const nextPendingOrders = rawIntents.map((record: any): DarkPoolIntentEntry => {
        const epochId = Number(parseLeoInt(getRecordField(record, 'epoch_id') ?? '0u64'))
        const poolId = Number(parseLeoInt(getRecordField(record, 'pool_id') ?? '0u64'))
        const amount = parseLeoInt(getRecordField(record, 'amount') ?? '0u128')
        const isBuy = parseBoolField(record, 'is_buy')
        const epochState = epochSnapshots.get(epochCacheKey(epochId, poolId)) ?? null
        const preview = epochState?.closed
          ? (isBuy ? estimateDarkPoolBuyClaim(epochState, amount) : estimateDarkPoolSellClaim(epochState, amount))
          : null
        const recordPlaintext = getPlaintext(record)

        return {
          id: recordPlaintext || `${epochId}-${poolId}-${getRecordField(record, 'nonce') ?? 'intent'}`,
          recordPlaintext,
          isBuy,
          side: isBuy ? 'buy' : 'sell',
          epochId,
          poolId,
          amount,
          minOut: parseLeoInt(getRecordField(record, 'min_out') ?? '0u128'),
          nonce: getRecordField(record, 'nonce') ?? '',
          status: epochState?.closed ? 'claimable' : 'pending',
          epochState,
          preview,
        }
      }).sort((left, right) => right.epochId - left.epochId)

      const nextSettledOrders = rawReceipts.map((record: any): DarkPoolReceiptEntry => {
        const recordPlaintext = getPlaintext(record)
        const entry: DarkPoolReceiptEntry = {
          id: recordPlaintext || `${getRecordField(record, 'epoch_id') ?? '0'}-${getRecordField(record, 'pool_id') ?? '0'}-receipt`,
          recordPlaintext,
          isBuy: parseBoolField(record, 'is_buy'),
          side: parseBoolField(record, 'is_buy') ? 'buy' : 'sell',
          epochId: Number(parseLeoInt(getRecordField(record, 'epoch_id') ?? '0u64')),
          poolId: Number(parseLeoInt(getRecordField(record, 'pool_id') ?? '0u64')),
          matchedInput: parseLeoInt(getRecordField(record, 'matched_input') ?? '0u128'),
          refundInput: parseLeoInt(getRecordField(record, 'refund_input') ?? '0u128'),
          amountOut: parseLeoInt(getRecordField(record, 'amount_out') ?? '0u128'),
          feePaid: parseLeoInt(getRecordField(record, 'fee_paid') ?? '0u128'),
          midPrice: parseLeoInt(getRecordField(record, 'mid_price') ?? '0u128'),
          outcome: 'settled',
        }

        return {
          ...entry,
          outcome: deriveReceiptOutcome(entry),
        }
      }).sort((left, right) => right.epochId - left.epochId)

      setPendingOrders(nextPendingOrders)
      setSettledOrders(nextSettledOrders)
    } catch (error) {
      console.error('[useDarkPoolOrders] Failed to fetch orders:', error)
      setPendingOrders([])
      setSettledOrders([])
    } finally {
      setLoading(false)
    }
  }, [connected, address, requestRecords])

  const runIntentAction = useCallback(async (order: DarkPoolIntentEntry, mode: DarkPoolActionMode) => {
    if (!connected || !walletExecute) {
      setActionState({
        orderId: order.id,
        mode,
        txStatus: 'rejected',
        txId: null,
        error: 'Connect wallet first.',
      })
      return false
    }

    let submittedTxId: string | null = null
    setActionState({
      orderId: order.id,
      mode,
      txStatus: 'pending',
      txId: null,
      error: null,
    })

    try {
      const epochState = await fetchEpochState(order.epochId, order.poolId)
      if (mode === 'claim' && !epochState.closed) {
        throw new Error(`Epoch #${order.epochId} is not settled yet.`)
      }
      if (mode === 'cancel' && epochState.closed) {
        throw new Error(`Epoch #${order.epochId} is already closed. Claim it instead.`)
      }

      const functionName = mode === 'claim'
        ? (order.isBuy ? DARKPOOL_FNS.CLAIM_BUY_FILL : DARKPOOL_FNS.CLAIM_SELL_FILL)
        : (order.isBuy ? DARKPOOL_FNS.CANCEL_BUY : DARKPOOL_FNS.CANCEL_SELL)

      const inputs = mode === 'claim'
        ? (
          order.isBuy
            ? buildDarkBuyClaimInputs(
              order.recordPlaintext,
              epochState.buyVolume,
              epochState.matchedSell,
              epochState.matchedBuy,
              epochState.midPrice,
              epochState.feeBps,
            )
            : buildDarkSellClaimInputs(
              order.recordPlaintext,
              epochState.sellVolume,
              epochState.matchedSell,
              epochState.matchedBuy,
              epochState.midPrice,
              epochState.feeBps,
            )
        )
        : [order.recordPlaintext]

      const txId = await executeOnChain(
        walletExecute,
        PROGRAMS.DARKPOOL,
        functionName,
        inputs,
        1_500_000,
        false,
        [0],
      )

      submittedTxId = txId
      setActionState({
        orderId: order.id,
        mode,
        txStatus: 'pending',
        txId,
        error: null,
      })

      const finalStatus = await pollTransactionStatus(
        txId,
        (txStatus) => {
          setActionState((prev) => (
            prev.orderId === order.id && prev.mode === mode
              ? { ...prev, txStatus }
              : prev
          ))
        },
        3_000,
        180_000,
        walletTxStatus,
      )

      if (finalStatus === 'rejected') {
        throw new Error(`Dark pool ${mode} was rejected on-chain.`)
      }

      setActionState({
        orderId: order.id,
        mode,
        txStatus: 'finalized',
        txId,
        error: null,
      })

      window.dispatchEvent(new Event('privadex:txEnd'))
      window.dispatchEvent(new Event('privadex:balanceRefresh'))
      setTimeout(() => {
        void fetchOrders()
      }, 5_000)
      return true
    } catch (error: any) {
      setActionState({
        orderId: order.id,
        mode,
        txStatus: 'rejected',
        txId: submittedTxId,
        error: error?.message ?? `Dark pool ${mode} failed.`,
      })
      return false
    }
  }, [connected, walletExecute, walletTxStatus, fetchOrders])

  const claimIntent = useCallback(async (order: DarkPoolIntentEntry) => {
    return runIntentAction(order, 'claim')
  }, [runIntentAction])

  const cancelIntent = useCallback(async (order: DarkPoolIntentEntry) => {
    return runIntentAction(order, 'cancel')
  }, [runIntentAction])

  useEffect(() => {
    void fetchOrders()
    const handler = () => {
      setTimeout(() => {
        void fetchOrders()
      }, 5_000)
    }
    window.addEventListener('privadex:txEnd', handler)
    window.addEventListener('privadex:balanceRefresh', handler)
    const interval = setInterval(() => {
      void fetchOrders()
    }, 15_000)
    return () => {
      window.removeEventListener('privadex:txEnd', handler)
      window.removeEventListener('privadex:balanceRefresh', handler)
      clearInterval(interval)
    }
  }, [fetchOrders])

  return {
    pendingOrders,
    settledOrders,
    loading,
    actionState,
    claimIntent,
    cancelIntent,
    refresh: fetchOrders,
  }
}
