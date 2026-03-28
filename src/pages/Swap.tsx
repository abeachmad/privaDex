import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ArrowDownUp, Settings, ShieldCheck, Zap, Moon, BookOpen,
  ChevronDown, Check, Lock, ArrowRight, X, Loader2,
  AlertTriangle, CheckCircle2,
} from 'lucide-react'
import TokenSelector from '../components/shared/TokenSelector'
import PrivacyBadge from '../components/shared/PrivacyBadge'
import { useWallet } from '../context/WalletContext'
import { formatNumber, formatAmount, type Venue } from '../data/tokens'
import { useBlindRouter } from '../hooks/useBlindRouter'
import { useSwapExecute } from '../hooks/useSwapExecute'
import { POOL_IDS } from '../lib/programs'
import { VENUE_CAPABILITIES } from '../lib/venueCapabilities'

// ─── Pool / direction lookup ────────────────────────────────────────────────
interface PoolMapping {
  poolId: number
  isAtoB: boolean
}

function getPoolMapping(from: string, to: string): PoolMapping | null {
  const map: Record<string, PoolMapping> = {
    'ALEO-USDCx':  { poolId: POOL_IDS.ALEO_USDCX, isAtoB: true  },
    'USDCx-ALEO':  { poolId: POOL_IDS.ALEO_USDCX, isAtoB: false },
    'BTCx-USDCx':  { poolId: POOL_IDS.BTCX_USDCX, isAtoB: true  },
    'USDCx-BTCx':  { poolId: POOL_IDS.BTCX_USDCX, isAtoB: false },
    'ETHx-USDCx':  { poolId: POOL_IDS.ETHX_USDCX, isAtoB: true  },
    'USDCx-ETHx':  { poolId: POOL_IDS.ETHX_USDCX, isAtoB: false },
    'ALEO-BTCx':   { poolId: POOL_IDS.ALEO_BTCX,  isAtoB: true  },
    'BTCx-ALEO':   { poolId: POOL_IDS.ALEO_BTCX,  isAtoB: false },
    'ALEO-ETHx':   { poolId: POOL_IDS.ALEO_ETHX,  isAtoB: true  },
    'ETHx-ALEO':   { poolId: POOL_IDS.ALEO_ETHX,  isAtoB: false },
    'BTCx-ETHx':   { poolId: POOL_IDS.BTCX_ETHX,  isAtoB: true  },
    'ETHx-BTCx':   { poolId: POOL_IDS.BTCX_ETHX,  isAtoB: false },
  }
  return map[`${from}-${to}`] || null
}

// ─── Venue visual config ────────────────────────────────────────────────────
const VENUE_ICONS: Record<Venue, typeof Zap> = {
  amm: Zap,
  darkpool: Moon,
  orderbook: BookOpen,
}

const VENUE_COLORS: Record<Venue, string> = {
  amm: '#2dd4a0',
  darkpool: '#67e8f9',
  orderbook: '#d4a853',
}

export default function Swap() {
  const { connected, connect, shieldActive, balances } = useWallet()
  const { loading: routerLoading, quotes, evaluate, selectedVenue: routerVenue } = useBlindRouter()
  const {
    proofStatus,
    txStatus,
    txId,
    error: swapError,
    statusMsg,
    executeSwap,
    reset: resetSwap,
  } = useSwapExecute()

  const [fromToken, setFromToken] = useState('ALEO')
  const [toToken, setToToken] = useState('USDCx')
  const [amount, setAmount] = useState('')
  const [selectedVenue, setSelectedVenue] = useState<Venue | 'auto'>('auto')
  const [showSettings, setShowSettings] = useState(false)
  const [showRoutes, setShowRoutes] = useState(true)
  const [showConfirm, setShowConfirm] = useState(false)
  const [slippageTolerance, setSlippageTolerance] = useState('0.5')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Trigger router evaluation when amount/tokens change
  useEffect(() => {
    evaluate(fromToken, toToken, amount)
  }, [fromToken, toToken, amount, evaluate])

  // Close modal, reset inputs & show success when swap finalizes
  useEffect(() => {
    if (txStatus === 'accepted' || txStatus === 'finalized') {
      setShowConfirm(false)
      setAmount('')
      setSuccessMessage(
        `Swap ${fromToken} → ${toToken} ${txStatus === 'accepted' ? 'accepted' : 'confirmed'}!${txId ? ` Tx: ${txId.slice(0, 12)}…` : ''}`
      )
      const timer = setTimeout(() => {
        setSuccessMessage(null)
        resetSwap()
      }, 8000)
      return () => clearTimeout(timer)
    }
  }, [txStatus, fromToken, toToken, txId, resetSwap])

  // Get active route info
  const activeRoute = selectedVenue === 'auto'
    ? quotes.find(q => q.recommended) || quotes[0]
    : quotes.find(q => q.venue === selectedVenue) || quotes[0]

  const estimatedOutput = activeRoute?.amountOut || 0

  const flipTokens = () => {
    setFromToken(toToken)
    setToToken(fromToken)
  }

  // Derive the swap button label based on proof/tx state
  const getSwapButtonLabel = () => {
    if (txStatus === 'pending') return 'Transaction Pending…'
    if (txStatus === 'accepted') return 'Swap Accepted'
    if (proofStatus === 'preparing') return 'Preparing…'
    if (proofStatus === 'proving') return 'Generating Proof…'
    return `Swap ${fromToken} → ${toToken}`
  }

  // Is the main button disabled because a swap is in-flight?
  const swapInProgress =
    proofStatus === 'preparing' ||
    proofStatus === 'proving' ||
    txStatus === 'pending'

  // Execute the actual on-chain swap
  const handleConfirmSwap = useCallback(async () => {
    const venue: Venue = selectedVenue === 'auto' ? routerVenue : selectedVenue
    const poolMapping = getPoolMapping(fromToken, toToken)
    if (!poolMapping) return

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) return

    const slip = parseFloat(slippageTolerance) || 0.5
    const minOut = BigInt(Math.round(estimatedOutput * (1 - slip / 100) * 1e6))

    await executeSwap(
      fromToken,
      toToken,
      amountNum,
      venue,
      poolMapping.poolId,
      poolMapping.isAtoB,
      minOut,
      6, // decimals
    )
  }, [selectedVenue, routerVenue, fromToken, toToken, amount, slippageTolerance, estimatedOutput, executeSwap])

  // Close confirmation modal (only allowed when not mid-tx)
  const closeModal = () => {
    if (swapInProgress) return
    resetSwap()
    setShowConfirm(false)
  }

  return (
    <div className="max-w-lg mx-auto pt-12">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
        className="flex items-center justify-between mb-6"
      >
        <div>
          <h1 className="font-display text-2xl text-text-primary">Swap</h1>
          <p className="text-xs text-text-tertiary mt-0.5">
            Blind Router currently executes through Shielded AMM. Dark Pool and Order Book remain experimental manual venues.
          </p>
        </div>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2.5 rounded-xl border border-border hover:border-border-md bg-glass transition-all duration-200 press-scale"
        >
          <Settings size={16} className="text-text-secondary" />
        </button>
      </motion.div>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden mb-4"
          >
            <div className="p-4 rounded-xl border border-border bg-glass mb-4">
              <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-3">Slippage Tolerance</div>
              <div className="flex items-center gap-2">
                {['0.1', '0.5', '1.0'].map(val => (
                  <button
                    key={val}
                    onClick={() => setSlippageTolerance(val)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition-all duration-200 press-scale ${
                      slippageTolerance === val
                        ? 'border-emerald/30 bg-emerald-ghost text-emerald'
                        : 'border-border bg-glass text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {val}%
                  </button>
                ))}
                <div className="flex-1 flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-glass">
                  <input
                    type="text"
                    value={slippageTolerance}
                    onChange={e => setSlippageTolerance(e.target.value)}
                    className="bg-transparent text-xs font-mono text-text-primary outline-none w-full"
                  />
                  <span className="text-xs text-text-tertiary">%</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main swap card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5, ease: [0.2, 0, 0, 1] }}
      >
        <div className="rounded-2xl border border-border-md bg-carbon shadow-deep overflow-visible">
          {/* FROM */}
          <div className="p-5 rounded-t-2xl relative z-20">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-text-tertiary uppercase tracking-wider">You pay</span>
              {connected && (
                <button
                  onClick={() => setAmount(String(balances[fromToken] || 0))}
                  className="text-xs font-mono text-text-tertiary hover:text-emerald transition-colors"
                >
                  Balance: {shieldActive ? '••••' : formatNumber(balances[fromToken] || 0)}
                  {!shieldActive && <span className="text-emerald ml-1">MAX</span>}
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <input
                type="text"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="min-w-0 flex-1 bg-transparent text-3xl font-light text-text-primary outline-none font-mono tabular-nums placeholder:text-text-ghost"
              />
              <TokenSelector
                selected={fromToken}
                onSelect={setFromToken}
                exclude={toToken}
              />
            </div>
          </div>

          {/* Flip button */}
          <div className="relative h-0 flex items-center justify-center z-30">
            <button
              onClick={flipTokens}
              className="w-10 h-10 rounded-xl border border-border-md bg-carbon flex items-center justify-center hover:border-emerald/30 hover:bg-emerald-ghost transition-all duration-200 press-scale"
            >
              <ArrowDownUp size={15} className="text-text-secondary" />
            </button>
          </div>

          {/* TO */}
          <div className="p-5 border-t border-border bg-glass relative z-10">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-mono text-text-tertiary uppercase tracking-wider">You receive</span>
              {connected && (
                <span className="text-xs font-mono text-text-tertiary">
                  Balance: {shieldActive ? '••••' : formatNumber(balances[toToken] || 0)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1 text-3xl font-light text-text-primary font-mono tabular-nums">
                {amount && estimatedOutput > 0 ? formatAmount(estimatedOutput) : '0.00'}
              </div>
              <TokenSelector
                selected={toToken}
                onSelect={setToToken}
                exclude={fromToken}
              />
            </div>
          </div>

          {/* Route Info */}
          {amount && Number(amount) > 0 && quotes.length > 0 && activeRoute && (
            <div className="border-t border-border">
              {/* Route summary */}
              <button
                onClick={() => setShowRoutes(!showRoutes)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-glass transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const Icon = VENUE_ICONS[activeRoute.venue]
                      return <Icon size={13} style={{ color: VENUE_COLORS[activeRoute.venue] }} />
                    })()}
                    <span className="text-xs font-mono text-text-secondary">
                      {selectedVenue === 'auto' ? 'Blind Router →' : 'Manual →'} {activeRoute.label}
                    </span>
                    {routerLoading && <Loader2 size={12} className="text-text-tertiary animate-spin" />}
                  </div>
                  <PrivacyBadge level={activeRoute.privacyLevel} />
                </div>
                <ChevronDown
                  size={14}
                  className={`text-text-tertiary transition-transform duration-200 ${showRoutes ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Route details */}
              <AnimatePresence>
                {showRoutes && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-5 pb-4 space-y-2">
                      {/* Venue comparison */}
                      {quotes.map(route => {
                        const Icon = VENUE_ICONS[route.venue]
                        const isActive = selectedVenue === 'auto'
                          ? route.recommended
                          : route.venue === selectedVenue

                        return (
                          <button
                            key={route.venue}
                            onClick={() => {
                              if (!route.available) return
                              setSelectedVenue(isActive && selectedVenue !== 'auto' ? 'auto' : route.venue)
                            }}
                            disabled={!route.available}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all duration-200 ${
                              isActive
                                ? 'border-emerald/20 bg-emerald-ghost'
                                : route.available
                                  ? 'border-border bg-glass hover:border-border-md'
                                  : 'border-border bg-glass opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-7 h-7 rounded-lg flex items-center justify-center"
                                style={{ backgroundColor: `${VENUE_COLORS[route.venue]}12` }}
                              >
                                <Icon size={13} style={{ color: VENUE_COLORS[route.venue] }} />
                              </div>
                              <div className="text-left">
                                <div className="text-xs font-medium text-text-primary">{route.label}</div>
                                {route.recommended && selectedVenue === 'auto' && (
                                  <div className="text-[9px] font-mono text-emerald uppercase">Recommended</div>
                                )}
                                {!route.available && route.reason && (
                                  <div className="max-w-[220px] text-[9px] font-mono text-text-ghost mt-0.5 whitespace-normal">
                                    {route.reason}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-5 text-right">
                              <div>
                                <div className="font-mono text-xs text-text-primary tabular-nums">
                                  {formatAmount(route.amountOut)}
                                </div>
                                <div className="text-[9px] text-text-ghost font-mono">{toToken}</div>
                              </div>
                              <div>
                                <div className="font-mono text-xs text-text-primary tabular-nums">{route.priceImpact.toFixed(2)}%</div>
                                <div className="text-[9px] text-text-ghost font-mono">impact</div>
                              </div>
                              <div>
                                <div className="font-mono text-xs text-text-primary tabular-nums">{route.speed}</div>
                                <div className="text-[9px] text-text-ghost font-mono">speed</div>
                              </div>
                              {isActive && (
                                <Check size={14} className="text-emerald" />
                              )}
                            </div>
                          </button>
                        )
                      })}

                      {/* Trade details */}
                      <div className="mt-3 space-y-2 px-1">
                        {activeRoute && [
                          { label: 'Rate', value: estimatedOutput > 0 ? `1 ${fromToken} = ${(estimatedOutput / parseFloat(amount || '1')).toFixed(6)} ${toToken}` : '—' },
                          { label: 'Price Impact', value: `${activeRoute.priceImpact.toFixed(2)}%`, warn: activeRoute.priceImpact > 1 },
                          { label: 'Slippage Tolerance', value: `${slippageTolerance}%` },
                          { label: 'Network Fee', value: '~1.5 ALEO' },
                          { label: 'Privacy Level', value: 'Full (ZK Shielded)' },
                        ].map(detail => (
                          <div key={detail.label} className="flex items-center justify-between text-xs">
                            <span className="text-text-tertiary">{detail.label}</span>
                            <span className={`font-mono ${detail.warn ? 'text-warning' : 'text-text-secondary'}`}>
                              {detail.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Action button */}
          <div className="p-5 border-t border-border rounded-b-2xl">
            {!connected ? (
              <button
                onClick={connect}
                className="w-full py-4 rounded-xl bg-emerald text-obsidian font-semibold text-sm hover:bg-emerald/90 transition-colors press-scale"
              >
                Connect Wallet
              </button>
            ) : (
              <button
                onClick={() => {
                  resetSwap()
                  setShowConfirm(true)
                }}
                disabled={!amount || Number(amount) <= 0 || swapInProgress}
                className="w-full py-4 rounded-xl bg-emerald text-obsidian font-semibold text-sm hover:bg-emerald/90 transition-colors press-scale disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {swapInProgress && <Loader2 size={16} className="animate-spin" />}
                {getSwapButtonLabel()}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ═══ Error display ═══ */}
      <AnimatePresence>
        {swapError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/5 border border-red-500/20"
          >
            <AlertTriangle size={14} className="text-red-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs text-red-300 leading-relaxed">{swapError}</p>
            </div>
            <button onClick={resetSwap} className="text-red-400 hover:text-red-300 transition-colors">
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ Success toast ═══ */}
      <AnimatePresence>
        {successMessage && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-emerald-ghost border border-emerald/20"
          >
            <CheckCircle2 size={14} className="text-emerald mt-0.5 shrink-0" />
            <p className="text-xs text-emerald leading-relaxed flex-1">{successMessage}</p>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald/60 hover:text-emerald transition-colors">
              <X size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Privacy note */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-emerald-ghost/50 border border-emerald/5"
      >
        <Lock size={13} className="text-emerald mt-0.5 shrink-0" />
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          This swap is fully shielded. Your trade size, price, and identity are protected by zero-knowledge proofs.
          Routing computation happens entirely in your browser.
        </p>
      </motion.div>

      {!VENUE_CAPABILITIES.darkpool.enabledInRouter && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          className="mt-3 flex items-start gap-3 px-4 py-3 rounded-xl bg-gold-muted/20 border border-gold/10"
        >
          <AlertTriangle size={13} className="text-gold mt-0.5 shrink-0" />
          <p className="text-[11px] text-text-tertiary leading-relaxed">
            Shielded AMM is the only route the app auto-selects for executable swaps right now. Experimental venues stay visible for research and manual testing, not for default routing.
          </p>
        </motion.div>
      )}

      {/* ═══ Confirmation Modal ═══ */}
      <AnimatePresence>
        {showConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-void/60 backdrop-blur-sm"
              onClick={closeModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
              className="fixed top-[50%] left-[50%] -translate-x-[50%] -translate-y-[50%] z-50 w-full max-w-md px-4"
            >
              <div className="bg-carbon border border-border-md rounded-2xl shadow-deep overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                  <h3 className="font-display text-lg text-text-primary">Confirm Swap</h3>
                  <button
                    onClick={closeModal}
                    disabled={swapInProgress}
                    className="p-1.5 rounded-lg hover:bg-glass-md transition-colors disabled:opacity-30"
                  >
                    <X size={16} className="text-text-tertiary" />
                  </button>
                </div>

                {/* Body */}
                <div className="p-6">
                  {/* From → To */}
                  <div className="flex items-center justify-between mb-6">
                    <div className="text-center">
                      <div className="text-2xl font-mono font-light text-text-primary tabular-nums">{amount}</div>
                      <div className="text-xs text-text-tertiary mt-1">{fromToken}</div>
                    </div>
                    <ArrowRight size={20} className="text-text-ghost" />
                    <div className="text-center">
                      <div className="text-2xl font-mono font-light text-emerald tabular-nums">
                        {formatAmount(estimatedOutput)}
                      </div>
                      <div className="text-xs text-text-tertiary mt-1">{toToken}</div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-3 p-4 rounded-xl bg-glass border border-border">
                    {[
                      { label: 'Execution Venue', value: activeRoute?.label || 'Shielded AMM' },
                      { label: 'Rate', value: estimatedOutput > 0 ? `1 ${fromToken} = ${(estimatedOutput / parseFloat(amount || '1')).toFixed(6)} ${toToken}` : '—' },
                      { label: 'Price Impact', value: `${activeRoute?.priceImpact?.toFixed(2) || '0.00'}%` },
                      { label: 'Min. Received', value: `${formatAmount(estimatedOutput * (1 - Number(slippageTolerance)/100))} ${toToken}` },
                      { label: 'Privacy', value: 'Full ZK Shielded' },
                    ].map(d => (
                      <div key={d.label} className="flex justify-between text-xs">
                        <span className="text-text-tertiary">{d.label}</span>
                        <span className="font-mono text-text-primary">{d.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Privacy badge */}
                  <div className="flex items-center gap-2 mt-4 px-3 py-2 rounded-lg bg-emerald-ghost">
                    <ShieldCheck size={14} className="text-emerald" />
                    <span className="text-xs text-emerald">This transaction is fully shielded by ZK proofs</span>
                  </div>

                  {/* ─── Status display (proof + tx) ─── */}
                  <AnimatePresence mode="wait">
                    {(proofStatus !== 'idle' || txStatus) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 overflow-hidden"
                      >
                        <div className="space-y-2 p-3 rounded-xl border border-border bg-glass">
                          {/* statusMsg from record preparation */}
                          {statusMsg && (
                            <div className="flex items-center gap-2 text-xs">
                              <Loader2 size={12} className="text-cyan-400 animate-spin shrink-0" />
                              <span className="text-text-secondary font-mono">{statusMsg}</span>
                            </div>
                          )}

                          {/* Proof status */}
                          <div className="flex items-center gap-2 text-xs">
                            {proofStatus === 'preparing' && (
                              <>
                                <Loader2 size={12} className="text-amber-400 animate-spin shrink-0" />
                                <span className="text-amber-400 font-mono">Preparing records…</span>
                              </>
                            )}
                            {proofStatus === 'proving' && (
                              <>
                                <Loader2 size={12} className="text-violet-400 animate-spin shrink-0" />
                                <span className="text-violet-400 font-mono">Generating ZK proof…</span>
                              </>
                            )}
                            {proofStatus === 'verified' && (
                              <>
                                <CheckCircle2 size={12} className="text-emerald shrink-0" />
                                <span className="text-emerald font-mono">Proof verified ✓</span>
                              </>
                            )}
                          </div>

                          {/* Transaction status */}
                          {txStatus && (
                            <div className="flex items-center gap-2 text-xs">
                              {txStatus === 'pending' && (
                                <>
                                  <Loader2 size={12} className="text-sky-400 animate-spin shrink-0" />
                                  <span className="text-sky-400 font-mono">Transaction pending…</span>
                                </>
                              )}
                              {txStatus === 'accepted' && (
                                <>
                                  <Loader2 size={12} className="text-sky-400 animate-spin shrink-0" />
                                  <span className="text-sky-400 font-mono">Transaction accepted, finalizing…</span>
                                </>
                              )}
                              {txStatus === 'finalized' && (
                                <>
                                  <CheckCircle2 size={12} className="text-emerald shrink-0" />
                                  <span className="text-emerald font-mono">Finalized!</span>
                                </>
                              )}
                              {txStatus === 'rejected' && (
                                <>
                                  <AlertTriangle size={12} className="text-red-400 shrink-0" />
                                  <span className="text-red-400 font-mono">Transaction rejected</span>
                                </>
                              )}
                            </div>
                          )}

                          {/* Tx ID */}
                          {txId && (
                            <div className="text-[10px] font-mono text-text-ghost truncate pt-1 border-t border-border">
                              Tx: {txId}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* ─── Error inside modal ─── */}
                  {swapError && (
                    <div className="mt-4 flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/5 border border-red-500/20">
                      <AlertTriangle size={13} className="text-red-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-red-300 leading-relaxed">{swapError}</p>
                    </div>
                  )}
                </div>

                {/* Confirm button */}
                <div className="px-6 pb-6">
                  {txStatus === 'accepted' || txStatus === 'finalized' ? (
                    <button
                      onClick={closeModal}
                      className="w-full py-4 rounded-xl bg-emerald text-obsidian font-semibold text-sm hover:bg-emerald/90 transition-colors press-scale"
                    >
                      Done
                    </button>
                  ) : swapError ? (
                    <button
                      onClick={resetSwap}
                      className="w-full py-4 rounded-xl bg-glass border border-border text-text-primary font-semibold text-sm hover:bg-glass-md transition-colors press-scale"
                    >
                      Try Again
                    </button>
                  ) : (
                    <button
                      onClick={handleConfirmSwap}
                      disabled={swapInProgress}
                      className="w-full py-4 rounded-xl bg-emerald text-obsidian font-semibold text-sm hover:bg-emerald/90 transition-colors press-scale disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {swapInProgress && <Loader2 size={16} className="animate-spin" />}
                      {proofStatus === 'preparing'
                        ? 'Preparing…'
                        : proofStatus === 'proving'
                          ? 'Generating Proof…'
                          : txStatus === 'pending'
                            ? 'Transaction Pending…'
                            : 'Confirm Private Swap'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
