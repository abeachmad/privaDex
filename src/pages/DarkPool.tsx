import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  Moon, Clock, Lock, ShieldCheck, CheckCircle2, AlertCircle,
  ExternalLink, Loader2,
} from 'lucide-react'
import GlassCard from '../components/shared/GlassCard'
import PrivacyBadge from '../components/shared/PrivacyBadge'
import { useWallet } from '../context/WalletContext'
import { useSwapExecute } from '../hooks/useSwapExecute'
import { useDarkPoolState } from '../hooks/useDarkPoolState'
import { POOL_IDS } from '../lib/programs'
import { venueCapabilityReason } from '../lib/venueCapabilities'

type Tab = 'submit' | 'pending' | 'settled'

const PROOF_LABELS: Record<string, string> = {
  idle: '',
  preparing: 'Preparing records…',
  proving: 'Generating ZK proof…',
  verified: 'Proof verified',
}

export default function DarkPool() {
  const { connected, connect } = useWallet()
  const {
    proofStatus, txStatus, txId, error, statusMsg,
    executeSwap, reset,
  } = useSwapExecute()
  const darkPool = useDarkPoolState()

  const [tab, setTab] = useState<Tab>('submit')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')

  const isExecuting = proofStatus !== 'idle' || (txStatus !== null && txStatus !== 'finalized' && txStatus !== 'rejected')
  const isFinalized = txStatus === 'finalized'
  const isRejected = txStatus === 'rejected'

  const handleSubmit = async () => {
    const parsed = parseFloat(amount)
    if (!parsed || parsed <= 0) return

    const isBuy = side === 'buy'
    const success = await executeSwap(
      isBuy ? 'USDCx' : 'ALEO',       // fromToken
      isBuy ? 'ALEO' : 'USDCx',       // toToken
      parsed,                           // amountIn
      'darkpool',                       // venue
      POOL_IDS.ALEO_USDCX,            // poolId
      !isBuy,                           // isAtoB: sell → true (ALEO→USDCx), buy → false (USDCx→ALEO)
      0n,                               // minOut: dark pool uses midpoint price
    )

    if (success) {
      setAmount('')
    }
  }

  const handleNewOrder = () => {
    reset()
    setAmount('')
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column: Submit + Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            {([
              { key: 'submit', label: 'Submit Order' },
              { key: 'pending', label: 'Pending' },
              { key: 'settled', label: 'History' },
            ] as { key: Tab; label: string }[]).map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 press-scale ${
                  tab === t.key
                    ? 'bg-emerald-ghost border border-emerald/10 text-emerald'
                    : 'border border-border text-text-secondary hover:text-text-primary'
                }`}
              >
                {t.label}
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
                {/* Pair display */}
                <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Moon size={16} className="text-cyan" />
                    <span className="font-mono text-sm text-text-primary">ALEO / USDCx</span>
                  </div>
                  <span className="text-xs font-mono text-text-tertiary">Epoch #{darkPool.currentEpoch || '—'}</span>
                </div>

                {/* Side selector */}
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

                  {/* Amount input */}
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

                  {/* Execution info */}
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

                  {/* Status / Progress feedback */}
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
                          {/* Error state */}
                          {error && (
                            <div className="flex items-start gap-3">
                              <AlertCircle size={14} className="text-danger mt-0.5 shrink-0" />
                              <div>
                                <div className="text-xs font-medium text-danger mb-1">Transaction Failed</div>
                                <div className="text-[11px] text-text-tertiary leading-relaxed">{error}</div>
                              </div>
                            </div>
                          )}

                          {/* Success state */}
                          {isFinalized && !error && (
                            <div className="flex items-start gap-3">
                              <CheckCircle2 size={14} className="text-emerald mt-0.5 shrink-0" />
                              <div>
                                <div className="text-xs font-medium text-emerald mb-1">Dark Order Submitted</div>
                                <div className="text-[11px] text-text-tertiary">
                                  Your order will settle at the next epoch's midpoint price.
                                </div>
                                {txId && (
                                  <a
                                    href={`https://testnet.aleoscan.io/transaction?id=${txId}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 mt-2 text-[10px] font-mono text-cyan hover:text-cyan/80 transition-colors"
                                  >
                                    {txId.slice(0, 16)}…{txId.slice(-8)}
                                    <ExternalLink size={10} />
                                  </a>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Rejected state */}
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

                          {/* In-progress states */}
                          {!error && !isFinalized && !isRejected && (
                            <div className="flex items-center gap-3">
                              <Loader2 size={14} className="text-cyan animate-spin shrink-0" />
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-text-primary mb-1">
                                  {statusMsg || PROOF_LABELS[proofStatus] || (txStatus === 'pending' ? 'Confirming on-chain…' : txStatus === 'accepted' ? 'Accepted, finalizing…' : 'Processing…')}
                                </div>

                                {/* Step indicators */}
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

                  {/* Submit / Connect / Reset buttons */}
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
                        disabled={!amount || Number(amount) <= 0 || isExecuting}
                        className="w-full py-4 rounded-xl bg-cyan text-obsidian font-semibold text-sm hover:bg-cyan/90 transition-colors press-scale disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isExecuting ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Processing…
                          </>
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
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="rounded-2xl border border-border bg-glass p-6"
            >
              <Moon size={28} className="mx-auto text-text-ghost mb-3" />
              <div className="text-center text-sm text-text-tertiary mb-2">
                Live dark-pool history is not indexed in this frontend yet
              </div>
              <p className="text-center text-[11px] text-text-ghost max-w-md mx-auto leading-relaxed">
                The app can submit intents, but pending orders, claimable receipts, and settlement history still need a real on-chain indexer and claim/cancel flows before they can be shown accurately.
              </p>
            </motion.div>
          )}
        </div>

        {/* Right column: Info panel */}
        <div className="space-y-4">
          {/* Epoch countdown */}
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

          {/* How it works */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <GlassCard variant="bordered">
              <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-4">How Dark Pool Works</div>
              <div className="space-y-4">
                {[
                  { step: '01', title: 'Submit Intent', desc: 'Place your buy or sell intent. Amount stays private.' },
                  { step: '02', title: 'Epoch Collection', desc: 'Intents are batched until the epoch closes.' },
                  { step: '03', title: 'Manual Settlement', desc: 'Current prototype still depends on an external settle action.' },
                  { step: '04', title: 'Manual Claim Flow', desc: 'Claim and cancel UX are not wired end-to-end in this frontend yet.' },
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

          {/* Privacy guarantees */}
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
                  'Settlement logic still needs protocol hardening before production claims',
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
