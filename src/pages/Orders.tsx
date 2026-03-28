import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  BookOpen, Plus, X, CheckCircle2, AlertCircle,
  Lock, Loader2, Shield,
} from 'lucide-react'
import GlassCard from '../components/shared/GlassCard'
import PrivacyBadge from '../components/shared/PrivacyBadge'
import { useWallet } from '../context/WalletContext'
import { useSwapExecute } from '../hooks/useSwapExecute'
import { POOL_IDS, POOL_AMM_CONFIG } from '../lib/programs'
import { fetchPoolReserves } from '../lib/aleo'
import { formatNumber } from '../data/tokens'
import { venueCapabilityReason } from '../lib/venueCapabilities'

export default function Orders() {
  const { connected, connect } = useWallet()
  const {
    proofStatus,
    txStatus,
    txId,
    error: swapError,
    statusMsg,
    executeSwap,
    reset: resetSwap,
  } = useSwapExecute()

  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [price, setPrice] = useState('')
  const [amount, setAmount] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [spotPrice, setSpotPrice] = useState<number | null>(null)

  // Fetch real on-chain spot price for ALEO/USDCx
  useEffect(() => {
    const config = POOL_AMM_CONFIG[POOL_IDS.ALEO_USDCX]
    if (!config) return
    fetchPoolReserves(POOL_IDS.ALEO_USDCX, config.program).then(reserves => {
      if (reserves.reserveA > 0n && reserves.reserveB > 0n) {
        setSpotPrice(Number(reserves.reserveB) / Number(reserves.reserveA))
      }
    }).catch(() => {})
    const interval = setInterval(() => {
      fetchPoolReserves(POOL_IDS.ALEO_USDCX, config.program).then(reserves => {
        if (reserves.reserveA > 0n && reserves.reserveB > 0n) {
          setSpotPrice(Number(reserves.reserveB) / Number(reserves.reserveA))
        }
      }).catch(() => {})
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  const isExecuting = proofStatus !== 'idle' && txStatus !== 'finalized' && !swapError
  const isFinalized = txStatus === 'finalized'

  const handlePlaceOrder = async () => {
    const parsedAmount = parseFloat(amount)
    const parsedPrice = parseFloat(price)
    if (!parsedAmount || !parsedPrice || parsedAmount <= 0 || parsedPrice <= 0) return

    const isSell = side === 'sell'

    // For sells: sending ALEO, receiving USDCx → minOut = amount * price (in USDCx micro-units)
    // For buys: sending USDCx, receiving ALEO → minOut = amount / price (but amount here is ALEO qty,
    //   so the USDCx spent = amount * price, and the ALEO received min = amount)
    // The hook's amountIn is the human-readable amount of the fromToken.
    // For sell: fromToken=ALEO, amountIn=amount(ALEO), minOut=amount*price in USDCx micros
    // For buy: fromToken=USDCx, amountIn=amount*price(USDCx), minOut=amount in ALEO micros

    let fromToken: string
    let toToken: string
    let isAtoB: boolean
    let amountIn: number
    let minOut: bigint

    if (isSell) {
      fromToken = 'ALEO'
      toToken = 'USDCx'
      isAtoB = true
      amountIn = parsedAmount
      minOut = BigInt(Math.round(parsedAmount * parsedPrice * 1e6))
    } else {
      fromToken = 'USDCx'
      toToken = 'ALEO'
      isAtoB = false
      amountIn = parsedAmount * parsedPrice // USDCx amount being spent
      minOut = BigInt(Math.round(parsedAmount * 1e6)) // ALEO being received
    }

    await executeSwap(
      fromToken,
      toToken,
      amountIn,
      'orderbook',
      POOL_IDS.ALEO_USDCX,
      isAtoB,
      minOut,
    )
  }

  const handleNewOrder = () => {
    resetSwap()
    setPrice('')
    setAmount('')
    setShowCreate(true)
  }

  /** Proof/Tx status label for the button */
  const buttonLabel = (): string => {
    if (swapError) return 'Order Failed — Try Again'
    if (isFinalized) return '✓ Order Placed On-Chain'
    if (txStatus === 'pending') return 'Confirming on-chain…'
    if (txStatus === 'accepted') return 'Accepted — finalizing…'
    if (proofStatus === 'proving') return 'Generating ZK Proof…'
    if (proofStatus === 'preparing') return 'Preparing records…'
    return 'Place Private Limit Order'
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
            <h1 className="font-display text-2xl text-text-primary">Private Orders</h1>
            <PrivacyBadge level="high" size="md" />
          </div>
          <p className="text-xs text-text-tertiary">Experimental private order-intent flow for ALEO / USDCx</p>
        </div>
        <button
          onClick={handleNewOrder}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald text-obsidian font-semibold text-sm press-scale"
        >
          <Plus size={14} />
          New Order
        </button>
      </motion.div>

      <div className="mb-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-gold-muted/20 border border-gold/10">
        <AlertCircle size={14} className="text-gold mt-0.5 shrink-0" />
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          {venueCapabilityReason('orderbook')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order creation form */}
        <div className={`lg:col-span-2 ${showCreate ? '' : 'lg:col-span-3'}`}>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mb-6"
            >
              <div className="rounded-2xl border border-border-md bg-carbon shadow-deep overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <BookOpen size={16} className="text-gold" />
                    <span className="font-mono text-sm text-text-primary">ALEO / USDCx</span>
                  </div>
                  <button onClick={() => { setShowCreate(false); resetSwap() }} className="p-1.5 rounded-lg hover:bg-glass-md transition-colors">
                    <X size={14} className="text-text-tertiary" />
                  </button>
                </div>
                <div className="p-6">
                  {/* Side */}
                  <div className="flex gap-2 mb-5">
                    <button
                      onClick={() => setSide('buy')}
                      disabled={isExecuting}
                      className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 press-scale ${
                        side === 'buy'
                          ? 'bg-positive/10 border border-positive/20 text-positive'
                          : 'bg-glass border border-border text-text-secondary'
                      }`}
                    >
                      Buy
                    </button>
                    <button
                      onClick={() => setSide('sell')}
                      disabled={isExecuting}
                      className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all duration-200 press-scale ${
                        side === 'sell'
                          ? 'bg-danger-muted border border-danger/20 text-danger'
                          : 'bg-glass border border-border text-text-secondary'
                      }`}
                    >
                      Sell
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-5">
                    {/* Price */}
                    <div className="p-4 rounded-xl border border-border bg-glass">
                      <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-2">Limit Price (USDCx)</div>
                      <input
                        type="text"
                        value={price}
                        onChange={e => setPrice(e.target.value)}
                        placeholder="0.00"
                        disabled={isExecuting}
                        className="w-full bg-transparent text-lg font-mono text-text-primary outline-none placeholder:text-text-ghost tabular-nums disabled:opacity-50"
                      />
                    </div>
                    {/* Amount */}
                    <div className="p-4 rounded-xl border border-border bg-glass">
                      <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-2">Amount (ALEO)</div>
                      <input
                        type="text"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        placeholder="0.00"
                        disabled={isExecuting}
                        className="w-full bg-transparent text-lg font-mono text-text-primary outline-none placeholder:text-text-ghost tabular-nums disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Estimated total */}
                  {price && amount && parseFloat(price) > 0 && parseFloat(amount) > 0 && (
                    <div className="flex justify-between text-xs px-1 mb-4">
                      <span className="text-text-tertiary">Estimated Total</span>
                      <span className="font-mono text-text-primary tabular-nums">
                        {formatNumber(parseFloat(price) * parseFloat(amount), 2)} USDCx
                      </span>
                    </div>
                  )}

                  {/* Info */}
                  <div className="space-y-2 mb-5 px-1">
                    {[
                      { label: 'Current Spot Price', value: spotPrice ? `${spotPrice.toFixed(6)} USDCx/ALEO` : 'Loading...' },
                      { label: 'Price visibility', value: 'ZK-Committed (Hidden)' },
                      { label: 'Order visibility', value: 'Encrypted on-chain' },
                      { label: 'Cancellation', value: 'Manual flow only' },
                      { label: 'Matching', value: 'Not auto-filled by the app yet' },
                    ].map(d => (
                      <div key={d.label} className="flex justify-between text-xs">
                        <span className="text-text-tertiary">{d.label}</span>
                        <span className="font-mono text-text-primary">{d.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* ─── Execution status display ─── */}
                  <AnimatePresence mode="wait">
                    {(isExecuting || swapError || isFinalized) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="mb-5 overflow-hidden"
                      >
                        {/* Error state */}
                        {swapError && (
                          <div className="p-4 rounded-xl border border-danger/20 bg-danger-muted/30">
                            <div className="flex items-center gap-2 mb-1">
                              <AlertCircle size={14} className="text-danger shrink-0" />
                              <span className="text-xs font-semibold text-danger">Order Failed</span>
                            </div>
                            <p className="text-[11px] text-text-secondary leading-relaxed pl-[22px]">{swapError}</p>
                          </div>
                        )}

                        {/* Success state */}
                        {isFinalized && !swapError && (
                          <div className="p-4 rounded-xl border border-emerald/20 bg-emerald-ghost">
                            <div className="flex items-center gap-2 mb-1">
                              <CheckCircle2 size={14} className="text-emerald shrink-0" />
                              <span className="text-xs font-semibold text-emerald">Order Placed Successfully</span>
                            </div>
                            {txId && (
                              <p className="text-[11px] text-text-tertiary font-mono pl-[22px] truncate">
                                TX: {txId}
                              </p>
                            )}
                          </div>
                        )}

                        {/* In-progress state */}
                        {isExecuting && !swapError && (
                          <div className="p-4 rounded-xl border border-gold/10 bg-gold-muted/20">
                            <div className="flex items-center gap-2 mb-2">
                              <Loader2 size={14} className="text-gold animate-spin shrink-0" />
                              <span className="text-xs font-semibold text-gold">{buttonLabel()}</span>
                            </div>
                            {statusMsg && (
                              <p className="text-[11px] text-text-tertiary font-mono pl-[22px]">{statusMsg}</p>
                            )}
                            {/* Progress steps */}
                            <div className="flex items-center gap-3 mt-3 pl-[22px]">
                              {(['preparing', 'proving', 'verified'] as const).map((step, i) => {
                                const stepLabels = ['Prepare', 'Prove', 'Submit']
                                const isActive = proofStatus === step
                                const isDone =
                                  (step === 'preparing' && (proofStatus === 'proving' || proofStatus === 'verified')) ||
                                  (step === 'proving' && proofStatus === 'verified') ||
                                  (step === 'verified' && txStatus === 'accepted')
                                return (
                                  <div key={step} className="flex items-center gap-1.5">
                                    <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                      isDone ? 'bg-emerald' : isActive ? 'bg-gold animate-pulse' : 'bg-glass-md'
                                    }`} />
                                    <span className={`text-[10px] font-mono ${
                                      isDone ? 'text-emerald' : isActive ? 'text-gold' : 'text-text-ghost'
                                    }`}>
                                      {stepLabels[i]}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ─── Action button ─── */}
                  {connected ? (
                    isFinalized && !swapError ? (
                      <button
                        onClick={handleNewOrder}
                        className="w-full py-3.5 rounded-xl bg-emerald text-obsidian font-semibold text-sm press-scale flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 size={15} />
                        Order Placed — Create Another
                      </button>
                    ) : swapError ? (
                      <button
                        onClick={() => { resetSwap() }}
                        className="w-full py-3.5 rounded-xl bg-danger/80 text-white font-semibold text-sm press-scale flex items-center justify-center gap-2"
                      >
                        <AlertCircle size={15} />
                        Try Again
                      </button>
                    ) : (
                      <button
                        onClick={handlePlaceOrder}
                        disabled={!price || !amount || isExecuting}
                        className="w-full py-3.5 rounded-xl bg-gold text-obsidian font-semibold text-sm press-scale disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isExecuting ? (
                          <>
                            <Loader2 size={15} className="animate-spin" />
                            {buttonLabel()}
                          </>
                        ) : (
                          <>
                            <Shield size={15} />
                            Place Private Limit Order
                          </>
                        )}
                      </button>
                    )
                  ) : (
                    <button onClick={connect} className="w-full py-3.5 rounded-xl bg-emerald text-obsidian font-semibold text-sm press-scale">
                      Connect Wallet
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Orders table */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
          >
            <div className="rounded-2xl border border-border bg-glass p-6 text-center">
              <BookOpen size={28} className="mx-auto text-text-ghost mb-3" />
              <div className="text-sm text-text-tertiary mb-2">Live order history is not indexed yet</div>
              <p className="text-[11px] text-text-ghost max-w-md mx-auto leading-relaxed">
                This page can submit private limit intents, but active orders, fills, partial fills, and cancellations are not displayed from chain data yet. Mock rows were removed to avoid misleading status.
              </p>
            </div>
          </motion.div>
        </div>

        {/* Info sidebar */}
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="space-y-4"
          >
            <GlassCard variant="bordered">
              <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-4">How Private Orders Work</div>
              <div className="space-y-4">
                {[
                  { step: '01', title: 'Set Price', desc: 'Your limit price is ZK-committed on-chain.' },
                  { step: '02', title: 'Hidden from Bots', desc: 'No one can see your price or front-run.' },
                  { step: '03', title: 'Manual Fill Flow', desc: 'Current prototype still relies on an external fill action.' },
                  { step: '04', title: 'Manual Cancel Flow', desc: 'Cancel UX and order history are not fully wired in this frontend yet.' },
                ].map(item => (
                  <div key={item.step} className="flex gap-3">
                    <div className="w-6 h-6 rounded-md bg-glass-md flex items-center justify-center shrink-0">
                      <span className="font-mono text-[10px] text-gold">{item.step}</span>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-text-primary">{item.title}</div>
                      <div className="text-[11px] text-text-tertiary">{item.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>

            <div className="p-5 rounded-2xl bg-gold-muted/30 border border-gold/5">
              <div className="flex items-center gap-2 mb-2">
                <Lock size={13} className="text-gold" />
                <span className="text-xs font-medium text-gold">ZK-Committed Prices</span>
              </div>
              <p className="text-[11px] text-text-tertiary leading-relaxed">
                Your limit price is hashed and committed on-chain. Only you know the actual price.
                The proof verifies correctness without revealing data, but production matching and order lifecycle automation still need additional protocol work.
              </p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
