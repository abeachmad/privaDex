import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Moon, Clock, Lock, ShieldCheck, CheckCircle2, AlertCircle,
  ExternalLink, Loader2, RefreshCcw,
} from 'lucide-react'
import GlassCard from '../components/shared/GlassCard'
import PrivacyBadge from '../components/shared/PrivacyBadge'
import { useWallet } from '../context/WalletContext'
import { useSwapExecute } from '../hooks/useSwapExecute'
import { useDarkPoolState } from '../hooks/useDarkPoolState'
import { useDarkPoolOrders, type DarkPoolIntentEntry, type DarkPoolReceiptEntry } from '../hooks/useDarkPoolOrders'
import { POOL_IDS } from '../lib/programs'
import { venueCapabilityReason } from '../lib/venueCapabilities'

type Tab = 'submit' | 'pending' | 'settled'

const PROOF_LABELS: Record<string, string> = {
  idle: '',
  preparing: 'Preparing records…',
  proving: 'Generating ZK proof…',
  verified: 'Proof verified',
}

function formatMicro(amount: bigint, maxFractionDigits = 4): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  }).format(Number(amount) / 1e6)
}

function formatMidPrice(midPrice: bigint): string {
  if (midPrice <= 0n) return '—'
  return `${(Number(midPrice) / 1e9).toFixed(6)} USDCx / ALEO`
}

function shortTx(txId: string): string {
  return `${txId.slice(0, 16)}…${txId.slice(-8)}`
}

function actionStatusLabel(txStatus: string | null, mode: 'claim' | 'cancel' | null): string {
  if (!mode) return 'Processing…'
  if (txStatus === 'accepted') return `${mode === 'claim' ? 'Claim' : 'Cancel'} accepted, finalizing…`
  if (txStatus === 'finalized') return `${mode === 'claim' ? 'Claim' : 'Cancel'} finalized`
  if (txStatus === 'rejected') return `${mode === 'claim' ? 'Claim' : 'Cancel'} rejected`
  return `${mode === 'claim' ? 'Claiming' : 'Cancelling'} on-chain…`
}

function inputSymbol(order: DarkPoolIntentEntry): string {
  return order.isBuy ? 'USDCx' : 'ALEO'
}

function outputSymbol(order: DarkPoolIntentEntry): string {
  return order.isBuy ? 'ALEO' : 'USDCx'
}

function receiptInputSymbol(receipt: DarkPoolReceiptEntry): string {
  return receipt.isBuy ? 'USDCx' : 'ALEO'
}

function receiptOutputSymbol(receipt: DarkPoolReceiptEntry): string {
  return receipt.isBuy ? 'ALEO' : 'USDCx'
}

function outcomeLabel(receipt: DarkPoolReceiptEntry): string {
  if (receipt.outcome === 'cancelled') return 'Cancelled'
  if (receipt.outcome === 'refunded') return 'Refunded'
  return 'Settled'
}

export default function DarkPool() {
  const { connected, connect } = useWallet()
  const {
    proofStatus, txStatus, txId, error, statusMsg,
    executeSwap, reset,
  } = useSwapExecute()
  const darkPool = useDarkPoolState()
  const {
    pendingOrders,
    settledOrders,
    loading: ordersLoading,
    actionState,
    claimIntent,
    cancelIntent,
    refresh,
  } = useDarkPoolOrders()

  const [tab, setTab] = useState<Tab>('submit')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')

  const isExecuting = proofStatus !== 'idle' || (txStatus !== null && txStatus !== 'finalized' && txStatus !== 'rejected')
  const isFinalized = txStatus === 'finalized'
  const isRejected = txStatus === 'rejected'
  const darkPoolUnavailable = darkPool.initialized === false
  const claimableCount = pendingOrders.filter(order => order.status === 'claimable').length

  const handleSubmit = async () => {
    const parsed = parseFloat(amount)
    if (!parsed || parsed <= 0 || darkPoolUnavailable) return

    const isBuy = side === 'buy'
    const success = await executeSwap(
      isBuy ? 'USDCx' : 'ALEO',
      isBuy ? 'ALEO' : 'USDCx',
      parsed,
      'darkpool',
      POOL_IDS.ALEO_USDCX,
      !isBuy,
      0n,
    )

    if (success) {
      setAmount('')
      setTab('pending')
    }
  }

  const handleNewOrder = () => {
    reset()
    setAmount('')
  }

  return (
    <div className="max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8"
      >
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-display text-2xl text-text-primary">Dark Pool</h1>
            <PrivacyBadge level="full" size="md" />
          </div>
          <p className="text-xs text-text-tertiary">Experimental intent flow for ALEO / USDCx batch settlement</p>
        </div>
      </motion.div>

      <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-cyan-muted/20 border border-cyan/10">
        <AlertCircle size={14} className="text-cyan mt-0.5 shrink-0" />
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          {venueCapabilityReason('darkpool')}
        </p>
      </div>

      {darkPoolUnavailable && (
        <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-danger-muted border border-danger/20">
          <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
          <p className="text-[11px] text-text-tertiary leading-relaxed">
            Dark Pool contract is not initialized on-chain yet. Every submit intent will be rejected until an admin runs `initialize(admin)` for the active dark pool program.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="flex items-center gap-2">
            {([
              { key: 'submit', label: 'Submit Order', count: null },
              { key: 'pending', label: 'Pending', count: pendingOrders.length },
              { key: 'settled', label: 'History', count: settledOrders.length },
            ] as { key: Tab; label: string; count: number | null }[]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 press-scale flex items-center gap-2 ${
                  tab === t.key
                    ? 'bg-emerald-ghost border border-emerald/10 text-emerald'
                    : 'border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                <span>{t.label}</span>
                {typeof t.count === 'number' && t.count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                    tab === t.key ? 'bg-emerald/10 text-emerald' : 'bg-glass text-text-ghost'
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === 'submit' ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="rounded-2xl border border-border-md bg-carbon shadow-deep overflow-hidden">
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Moon size={16} className="text-cyan" />
                    <span className="font-mono text-sm text-text-primary">ALEO / USDCx</span>
                  </div>
                  <span className="text-xs font-mono text-text-tertiary">Epoch #{darkPool.currentEpoch || '—'}</span>
                </div>

                <div className="p-6">
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => { setSide('buy'); if (isFinalized || error) reset() }}
                      disabled={isExecuting}
                      className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 press-scale disabled:opacity-50 ${
                        side === 'buy'
                          ? 'bg-positive/10 border border-positive/20 text-positive'
                          : 'bg-glass border border-border text-text-secondary'
                      }`}
                    >
                      Buy ALEO
                    </button>
                    <button
                      onClick={() => { setSide('sell'); if (isFinalized || error) reset() }}
                      disabled={isExecuting}
                      className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 press-scale disabled:opacity-50 ${
                        side === 'sell'
                          ? 'bg-danger-muted border border-danger/20 text-danger'
                          : 'bg-glass border border-border text-text-secondary'
                      }`}
                    >
                      Sell ALEO
                    </button>
                  </div>

                  <div className="p-4 rounded-xl border border-border bg-glass mb-6">
                    <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-2">
                      Amount ({side === 'buy' ? 'USDCx' : 'ALEO'})
                    </div>
                    <input
                      type="text"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.00"
                      disabled={isExecuting}
                      className="w-full bg-transparent text-2xl font-mono text-text-primary outline-none placeholder:text-text-ghost tabular-nums disabled:opacity-50"
                    />
                  </div>

                  <div className="space-y-3 mb-6">
                    {[
                      { label: 'Execution', value: 'Next epoch batch' },
                      { label: 'Settlement Price', value: 'Midpoint of bid/ask' },
                      { label: 'Front-running', value: 'Impossible' },
                      { label: 'MEV Extraction', value: 'Zero' },
                      { label: 'Privacy', value: 'Full ZK Shielded' },
                    ].map(item => (
                      <div key={item.label} className="flex justify-between text-xs">
                        <span className="text-text-tertiary">{item.label}</span>
                        <span className="font-mono text-text-primary">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    {(statusMsg || proofStatus !== 'idle' || txStatus || error) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="mb-6 overflow-hidden"
                      >
                        <div className={`p-4 rounded-xl border ${
                          error
                            ? 'border-danger/20 bg-danger-muted'
                            : isFinalized
                              ? 'border-emerald/20 bg-emerald-ghost'
                              : isRejected
                                ? 'border-danger/20 bg-danger-muted'
                                : 'border-cyan/10 bg-cyan-muted'
                        }`}>
                          {error && (
                            <div className="flex items-start gap-3">
                              <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
                              <div>
                                <div className="text-xs font-medium text-danger mb-1">Transaction Failed</div>
                                <div className="text-[11px] text-text-tertiary leading-relaxed">{error}</div>
                              </div>
                            </div>
                          )}

                          {isFinalized && !error && (
                            <div className="flex items-start gap-3">
                              <CheckCircle2 size={14} className="text-emerald mt-0.5 shrink-0" />
                              <div>
                                <div className="text-xs font-medium text-emerald mb-1">Dark Order Submitted</div>
                                <div className="text-[11px] text-text-tertiary">
                                  Your intent is now shielded on-chain. It will move to claimable once that epoch is settled.
                                </div>
                                {txId && (
                                  <a
                                    href={`https://testnet.explorer.provable.com/transaction/${txId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 mt-2 text-[10px] font-mono text-cyan hover:text-cyan/80 transition-colors"
                                  >
                                    {shortTx(txId)}
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>
                            </div>
                          )}

                          {isRejected && !error && (
                            <div className="flex items-start gap-3">
                              <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
                              <div>
                                <div className="text-xs font-medium text-danger mb-1">Transaction Rejected</div>
                                <div className="text-[11px] text-text-tertiary">
                                  The network rejected this transaction. Please try again.
                                </div>
                              </div>
                            </div>
                          )}

                          {!error && !isFinalized && !isRejected && (
                            <div className="flex items-center gap-3">
                              <Loader2 size={14} className="text-cyan animate-spin shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-text-primary mb-1">
                                  {statusMsg || PROOF_LABELS[proofStatus] || (txStatus === 'pending' ? 'Confirming on-chain…' : txStatus === 'accepted' ? 'Accepted, finalizing…' : 'Processing…')}
                                </div>

                                <div className="flex items-center gap-2">
                                  {[
                                    { key: 'prepare', label: 'Prepare', active: proofStatus === 'preparing' },
                                    { key: 'prove', label: 'Prove', active: proofStatus === 'proving' },
                                    { key: 'confirm', label: 'Confirm', active: txStatus === 'pending' || txStatus === 'accepted' },
                                  ].map((step, i) => {
                                    const done =
                                      (step.key === 'prepare' && (proofStatus === 'proving' || proofStatus === 'verified')) ||
                                      (step.key === 'prove' && proofStatus === 'verified') ||
                                      (step.key === 'confirm' && txStatus === 'accepted')
                                    return (
                                      <div key={step.key} className="flex items-center gap-2">
                                        {i > 0 && <div className={`w-4 h-px ${done || step.active ? 'bg-cyan/40' : 'bg-border'}`} />}
                                        <div className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                                          done
                                            ? 'bg-emerald-ghost text-emerald'
                                            : step.active
                                              ? 'bg-cyan-muted text-cyan'
                                              : 'bg-glass text-text-ghost'
                                        }`}>
                                          {done ? '✓' : ''} {step.label}
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {connected ? (
                    isFinalized || error || isRejected ? (
                      <button
                        onClick={handleNewOrder}
                        className="w-full py-4 rounded-xl bg-cyan text-obsidian font-semibold text-sm hover:bg-cyan/90 transition-colors press-scale"
                      >
                        {isFinalized ? 'Submit Another Order' : 'Try Again'}
                      </button>
                    ) : (
                      <button
                        onClick={handleSubmit}
                        disabled={!amount || Number(amount) <= 0 || isExecuting || darkPoolUnavailable}
                        className="w-full py-4 rounded-xl bg-cyan text-obsidian font-semibold text-sm hover:bg-cyan/90 transition-colors press-scale disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isExecuting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Processing…
                          </>
                        ) : darkPoolUnavailable ? (
                          'Dark Pool Unavailable'
                        ) : (
                          'Submit Dark Order'
                        )}
                      </button>
                    )
                  ) : (
                    <button onClick={connect} className="w-full py-4 rounded-xl bg-emerald text-obsidian font-semibold text-sm press-scale">
                      Connect Wallet
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ) : tab === 'pending' ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between px-1">
                <div className="text-[11px] text-text-tertiary">
                  {claimableCount > 0
                    ? `${claimableCount} intent ready to claim`
                    : 'Syncs directly from your DarkIntent records and public epoch state.'}
                </div>
                <button
                  onClick={() => void refresh()}
                  disabled={ordersLoading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-[11px] text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  <RefreshCcw size={12} className={ordersLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {!connected ? (
                <div className="rounded-2xl border border-border bg-glass p-6 text-center">
                  <div className="text-sm text-text-primary mb-2">Connect wallet to load your shielded intents</div>
                  <p className="text-[11px] text-text-ghost mb-4">
                    Pending and claimable dark-pool orders are derived from your private wallet records, so they are only visible after wallet sync.
                  </p>
                  <button onClick={connect} className="px-5 py-2.5 rounded-xl bg-emerald text-obsidian font-semibold text-sm press-scale">
                    Connect Wallet
                  </button>
                </div>
              ) : ordersLoading ? (
                <div className="rounded-2xl border border-border bg-glass p-8 flex items-center justify-center gap-3 text-text-tertiary">
                  <Loader2 size={16} className="animate-spin text-cyan" />
                  <span className="text-sm">Loading dark-pool intents…</span>
                </div>
              ) : pendingOrders.length === 0 ? (
                <div className="rounded-2xl border border-border bg-glass p-6">
                  <div className="text-sm text-text-primary mb-2">No live intents in this wallet</div>
                  <p className="text-[11px] text-text-ghost leading-relaxed">
                    After you submit from this wallet, a `DarkIntent` record will appear here as `Pending`, then flip to `Claimable` once the epoch is settled.
                  </p>
                </div>
              ) : (
                pendingOrders.map(order => {
                  const isClaimable = order.status === 'claimable'
                  const isActiveAction = actionState.orderId === order.id
                  const actionBusy = isActiveAction && actionState.txStatus !== null && actionState.txStatus !== 'finalized' && actionState.txStatus !== 'rejected'
                  const actionDisabled = !order.recordPlaintext || actionBusy

                  return (
                    <div key={order.id} className="rounded-2xl border border-border-md bg-carbon shadow-deep overflow-hidden">
                      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-text-primary">
                            {order.isBuy ? 'Buy ALEO' : 'Sell ALEO'}
                          </div>
                          <div className="text-[11px] text-text-ghost font-mono mt-1">
                            Epoch #{order.epochId} · Pool #{order.poolId}
                          </div>
                        </div>
                        <span className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider ${
                          isClaimable
                            ? 'bg-gold-muted/30 text-gold border border-gold/10'
                            : 'bg-cyan-muted text-cyan border border-cyan/10'
                        }`}>
                          {isClaimable ? 'Claimable' : 'Pending'}
                        </span>
                      </div>

                      <div className="p-5 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="p-3 rounded-xl bg-glass border border-border">
                            <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">Input</div>
                            <div className="text-sm font-mono text-text-primary">
                              {formatMicro(order.amount)} {inputSymbol(order)}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-glass border border-border">
                            <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">Epoch Status</div>
                            <div className="text-sm text-text-primary">
                              {isClaimable ? 'Settled and ready to claim' : 'Waiting for settlement'}
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-glass border border-border">
                            <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">Epoch Mid Price</div>
                            <div className="text-sm text-text-primary">
                              {order.epochState?.closed ? formatMidPrice(order.epochState.midPrice) : 'Not fixed yet'}
                            </div>
                          </div>
                        </div>

                        {order.preview && (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="p-3 rounded-xl bg-glass border border-border">
                              <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">Matched Input</div>
                              <div className="text-sm font-mono text-text-primary">
                                {formatMicro(order.preview.matchedInput)} {inputSymbol(order)}
                              </div>
                            </div>
                            <div className="p-3 rounded-xl bg-glass border border-border">
                              <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">Refund</div>
                              <div className="text-sm font-mono text-text-primary">
                                {formatMicro(order.preview.refundInput)} {inputSymbol(order)}
                              </div>
                            </div>
                            <div className="p-3 rounded-xl bg-glass border border-border">
                              <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">Estimated Output</div>
                              <div className="text-sm font-mono text-text-primary">
                                {formatMicro(order.preview.amountOut)} {outputSymbol(order)}
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-3">
                          <p className="text-[11px] text-text-ghost leading-relaxed">
                            {isClaimable
                              ? 'This intent still exists as a private DarkIntent record. Claiming will consume it and create a DarkReceipt in your wallet.'
                              : 'This intent is still open. You can cancel it before the epoch is closed, or wait until settlement and then claim the final receipt.'}
                          </p>
                          <button
                            onClick={() => void (isClaimable ? claimIntent(order) : cancelIntent(order))}
                            disabled={actionDisabled}
                            className={`shrink-0 px-4 py-2 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                              isClaimable
                                ? 'bg-gold text-obsidian hover:bg-gold/90'
                                : 'bg-cyan text-obsidian hover:bg-cyan/90'
                            }`}
                          >
                            {actionBusy ? (
                              <span className="inline-flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin" />
                                {isClaimable ? 'Claiming…' : 'Cancelling…'}
                              </span>
                            ) : isClaimable ? (
                              'Claim'
                            ) : (
                              'Cancel'
                            )}
                          </button>
                        </div>

                        {isActiveAction && (
                          <div className={`p-3 rounded-xl border ${
                            actionState.error
                              ? 'border-danger/20 bg-danger-muted'
                              : actionState.txStatus === 'finalized'
                                ? 'border-emerald/20 bg-emerald-ghost'
                                : 'border-cyan/10 bg-cyan-muted'
                          }`}>
                            <div className={`text-[11px] font-medium mb-1 ${
                              actionState.error
                                ? 'text-danger'
                                : actionState.txStatus === 'finalized'
                                  ? 'text-emerald'
                                  : 'text-cyan'
                            }`}>
                              {actionState.error || actionStatusLabel(actionState.txStatus, actionState.mode)}
                            </div>
                            {actionState.txId && (
                              <a
                                href={`https://testnet.explorer.provable.com/transaction/${actionState.txId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] font-mono text-text-tertiary hover:text-cyan transition-colors"
                              >
                                {shortTx(actionState.txId)}
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between px-1">
                <div className="text-[11px] text-text-tertiary">
                  Synced from `DarkReceipt` records in this wallet, not from local browser history.
                </div>
                <button
                  onClick={() => void refresh()}
                  disabled={ordersLoading}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border text-[11px] text-text-tertiary hover:text-text-primary transition-colors disabled:opacity-50"
                >
                  <RefreshCcw size={12} className={ordersLoading ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              {!connected ? (
                <div className="rounded-2xl border border-border bg-glass p-6 text-center">
                  <div className="text-sm text-text-primary mb-2">Connect wallet to read settled receipts</div>
                  <p className="text-[11px] text-text-ghost mb-4">
                    Claim and cancel outputs create `DarkReceipt` records, so history here follows the wallet rather than the browser that submitted the trade.
                  </p>
                  <button onClick={connect} className="px-5 py-2.5 rounded-xl bg-emerald text-obsidian font-semibold text-sm press-scale">
                    Connect Wallet
                  </button>
                </div>
              ) : ordersLoading ? (
                <div className="rounded-2xl border border-border bg-glass p-8 flex items-center justify-center gap-3 text-text-tertiary">
                  <Loader2 size={16} className="animate-spin text-cyan" />
                  <span className="text-sm">Loading settlement receipts…</span>
                </div>
              ) : settledOrders.length === 0 ? (
                <div className="rounded-2xl border border-border bg-glass p-6">
                  <div className="text-sm text-text-primary mb-2">No settled receipts yet</div>
                  <p className="text-[11px] text-text-ghost leading-relaxed">
                    After you claim or cancel an intent, the resulting `DarkReceipt` record will appear here with its final refund, output, and fee data.
                  </p>
                </div>
              ) : (
                settledOrders.map(receipt => (
                  <div key={receipt.id} className="rounded-2xl border border-border-md bg-carbon shadow-deep overflow-hidden">
                    <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          {receipt.isBuy ? 'Buy ALEO' : 'Sell ALEO'}
                        </div>
                        <div className="text-[11px] text-text-ghost font-mono mt-1">
                          Epoch #{receipt.epochId} · Pool #{receipt.poolId}
                        </div>
                      </div>
                      <span className={`px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wider ${
                        receipt.outcome === 'settled'
                          ? 'bg-emerald-ghost text-emerald border border-emerald/10'
                          : receipt.outcome === 'refunded'
                            ? 'bg-gold-muted/30 text-gold border border-gold/10'
                            : 'bg-cyan-muted text-cyan border border-cyan/10'
                      }`}>
                        {outcomeLabel(receipt)}
                      </span>
                    </div>

                    <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl bg-glass border border-border">
                        <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">Matched Input</div>
                        <div className="text-sm font-mono text-text-primary">
                          {formatMicro(receipt.matchedInput)} {receiptInputSymbol(receipt)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-glass border border-border">
                        <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">Refund</div>
                        <div className="text-sm font-mono text-text-primary">
                          {formatMicro(receipt.refundInput)} {receiptInputSymbol(receipt)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-glass border border-border">
                        <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">Output</div>
                        <div className="text-sm font-mono text-text-primary">
                          {formatMicro(receipt.amountOut)} {receiptOutputSymbol(receipt)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-glass border border-border">
                        <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">Fee Paid</div>
                        <div className="text-sm font-mono text-text-primary">
                          {formatMicro(receipt.feePaid)} {receiptOutputSymbol(receipt)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-glass border border-border">
                        <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">Settlement Price</div>
                        <div className="text-sm text-text-primary">
                          {formatMidPrice(receipt.midPrice)}
                        </div>
                      </div>
                      <div className="p-3 rounded-xl bg-glass border border-border">
                        <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">Receipt Type</div>
                        <div className="text-sm text-text-primary">
                          {receipt.outcome === 'cancelled'
                            ? 'Cancelled before close'
                            : receipt.outcome === 'refunded'
                              ? 'Settled with zero fill'
                              : 'Settled with executed fill'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </motion.div>
          )}
        </div>

        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-glass border border-border">
              <Clock size={14} className="text-cyan" />
              <div>
                <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">Epoch #{darkPool.currentEpoch || '—'}</div>
                <div className="font-mono text-lg text-text-primary tabular-nums">
                  {darkPool.loading ? '...' : `~${Math.floor(darkPool.secondsUntilNext / 60)}:${String(darkPool.secondsUntilNext % 60).padStart(2, '0')}`}
                </div>
              </div>
              <div className="flex-1 ml-2">
                <div className="h-1 rounded-full bg-glass-md overflow-hidden">
                  <div
                    className="h-full rounded-full bg-cyan/40 transition-all duration-1000"
                    style={{ width: `${Math.max(5, (1 - darkPool.secondsUntilNext / 420) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] font-mono text-text-ghost">Block {darkPool.blockHeight || '—'}</span>
                  <span className="text-[9px] font-mono text-text-ghost">
                    {darkPool.epochState?.intentCount ? `${darkPool.epochState.intentCount} intents` : 'No intents'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <GlassCard variant="bordered">
              <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-4">How Dark Pool Works</div>
              <div className="space-y-4">
                {[
                  { step: '01', title: 'Submit Intent', desc: 'Place a buy or sell intent. The wallet receives a private DarkIntent record.' },
                  { step: '02', title: 'Epoch Collection', desc: 'Intents are batched until the epoch closes and moves into manual settlement.' },
                  { step: '03', title: 'Manual Settlement', desc: 'Someone still needs to run settle_epoch once the epoch is over.' },
                  { step: '04', title: 'Claim Or Cancel', desc: 'This frontend now reads your wallet records so pending, claimable, and settled states can be shown directly.' },
                ].map(item => (
                  <div key={item.step} className="flex gap-3">
                    <div className="w-6 h-6 rounded-md bg-glass-md flex items-center justify-center shrink-0">
                      <span className="font-mono text-[10px] text-cyan">{item.step}</span>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-text-primary">{item.title}</div>
                      <div className="text-[11px] text-text-tertiary">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
          >
            <div className="p-5 rounded-2xl bg-emerald-ghost/30 border border-emerald/5">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck size={14} className="text-emerald" />
                <span className="text-xs font-medium text-emerald">Privacy Guarantees</span>
              </div>
              <ul className="space-y-2">
                {[
                  'Order amounts are encrypted',
                  'No counterparty can see your order',
                  'Intent submission stays shielded',
                  'Wallet-synced status now comes from private DarkIntent and DarkReceipt records',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2 text-[11px] text-text-tertiary">
                    <Lock size={10} className="text-emerald mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}
