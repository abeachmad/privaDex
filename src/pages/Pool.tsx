import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Plus, Minus, Droplets, ChevronDown, Lock, X, Loader2, CheckCircle, AlertTriangle, Eye, EyeOff, RefreshCw } from 'lucide-react'
import GlassCard from '../components/shared/GlassCard'
import TokenIcon from '../components/shared/TokenIcon'
import PrivacyBadge from '../components/shared/PrivacyBadge'
import { useWallet } from '../context/WalletContext'
import { usePoolOperations } from '../hooks/usePoolOperations'
import { useOnChainPools } from '../hooks/useOnChainPools'
import { useMyLpPositions } from '../hooks/useMyLpPositions'
import { POOL_IDS } from '../lib/programs'
import { formatUsd, formatNumber } from '../data/tokens'

type Tab = 'pools' | 'positions'

// Map pool string IDs from POOLS data to numeric POOL_IDS from programs
const POOL_ID_MAP: Record<string, number> = {
  'aleo-usdcx': POOL_IDS.ALEO_USDCX,
  'btcx-usdcx': POOL_IDS.BTCX_USDCX,
  'ethx-usdcx': POOL_IDS.ETHX_USDCX,
  'aleo-btcx':  POOL_IDS.ALEO_BTCX,
  'aleo-ethx':  POOL_IDS.ALEO_ETHX,
  'btcx-ethx':  POOL_IDS.BTCX_ETHX,
}

export default function PoolPage() {
  const { connected, connect, shieldActive, toggleShield, balances } = useWallet()
  const { loading, txStatus, txId, error, statusMsg, reset, addLiquidity } = usePoolOperations()
  const { pools: POOLS, totalTVL, metricsCoverage } = useOnChainPools()
  const { positions: lpPositions, loading: lpLoading, refetch: refetchLp } = useMyLpPositions()

  const [tab, setTab] = useState<Tab>('pools')
  const [expandedPool, setExpandedPool] = useState<string | null>(null)
  const [showAddLiquidity, setShowAddLiquidity] = useState<string | null>(null)
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  // Track which input was last edited to avoid circular updates
  const [lastEdited, setLastEdited] = useState<'A' | 'B' | null>(null)

  // Track whether we've reached finalized so we can show success then close
  const [showSuccess, setShowSuccess] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // When txStatus reaches 'finalized', show success and close after 2s
  useEffect(() => {
    if (txStatus === 'finalized') {
      setShowSuccess(true)
      closeTimerRef.current = setTimeout(() => {
        setShowAddLiquidity(null)
        setAmountA('')
        setAmountB('')
        setLastEdited(null)
        setShowSuccess(false)
        reset()
      }, 2000)
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [txStatus, reset])

  // Auto-calculate paired token amount based on pool reserve ratio
  useEffect(() => {
    if (!showAddLiquidity) return
    const pool = POOLS.find(p => p.id === showAddLiquidity)
    if (!pool || pool.reserveA <= 0 || pool.reserveB <= 0) return

    if (lastEdited === 'A') {
      const valA = parseFloat(amountA)
      if (!amountA || isNaN(valA) || valA <= 0) {
        setAmountB('')
        return
      }
      // amountB = amountA * (reserveB / reserveA)
      const calculatedB = valA * (pool.reserveB / pool.reserveA)
      setAmountB(calculatedB.toFixed(6).replace(/\.?0+$/, ''))
    } else if (lastEdited === 'B') {
      const valB = parseFloat(amountB)
      if (!amountB || isNaN(valB) || valB <= 0) {
        setAmountA('')
        return
      }
      // amountA = amountB * (reserveA / reserveB)
      const calculatedA = valB * (pool.reserveA / pool.reserveB)
      setAmountA(calculatedA.toFixed(6).replace(/\.?0+$/, ''))
    }
  }, [amountA, amountB, lastEdited, showAddLiquidity, POOLS])

  // Handlers for token input with tracking which side was edited
  const handleAmountAChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLastEdited('A')
    setAmountA(e.target.value)
  }

  const handleAmountBChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLastEdited('B')
    setAmountB(e.target.value)
  }

  // Reset hook state when modal closes manually
  const handleCloseModal = () => {
    setShowAddLiquidity(null)
    setAmountA('')
    setAmountB('')
    setLastEdited(null)
    setShowSuccess(false)
    if (!loading) reset()
  }

  // Derive button label from hook state
  const getButtonLabel = (): string => {
    if (showSuccess || txStatus === 'finalized') return 'Success!'
    if (txStatus === 'pending' || (loading && statusMsg?.includes('Executing'))) return 'Executing...'
    if (loading) return 'Preparing Records...'
    return 'Add Liquidity'
  }

  const handleAddLiquidity = async () => {
    if (!showAddLiquidity || loading) return
    const numericPoolId = POOL_ID_MAP[showAddLiquidity]
    if (numericPoolId === undefined) return

    const a = parseFloat(amountA)
    const b = parseFloat(amountB)
    if (!a || !b || a <= 0 || b <= 0) return

    await addLiquidity(numericPoolId, a, b)
  }

  const buttonLabel = getButtonLabel()
  const isButtonDisabled = loading || showSuccess || txStatus === 'finalized'

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
          <h1 className="font-display text-2xl text-text-primary">Liquidity Pools</h1>
          <p className="text-xs text-text-tertiary mt-0.5">Earn fees by providing shielded liquidity</p>
        </div>
        <div className="flex items-center gap-2">
          {(['pools', 'positions'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 press-scale ${
                tab === t
                  ? 'bg-emerald-ghost border border-emerald/10 text-emerald'
                  : 'border border-border text-text-secondary hover:text-text-primary hover:border-border-md'
              }`}
            >
              {t === 'pools' ? 'All Pools' : 'My Positions'}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Pool Stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5, ease: [0.2, 0, 0, 1] }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8"
      >
        {[
          { label: 'Total TVL', value: formatUsd(totalTVL) },
          { label: 'Observed 24h Volume', value: formatUsd(POOLS.reduce((s: number, p: any) => s + p.volume24h, 0)) },
          { label: 'Active Pools', value: POOLS.length.toString() },
          { label: 'Privacy', value: 'Full ZK' },
        ].map(stat => (
          <div key={stat.label} className="p-4 rounded-xl border border-border bg-glass">
            <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-1">{stat.label}</div>
            <div className="font-mono text-lg text-text-primary tabular-nums">{stat.value}</div>
          </div>
        ))}
      </motion.div>

      <div className="mb-6 text-[11px] text-text-ghost">
        {metricsCoverage === 'full'
          ? 'Pool state is live on-chain. Rolling 24h volume is still estimated from observed reserve changes because cumulative contract metrics do not yet include 24h buckets.'
          : metricsCoverage === 'partial'
            ? 'Pool state is live on-chain. Some pools already expose cumulative metrics, but 24h volume here is still estimated from observed reserve changes.'
            : 'Pool state is live on-chain, but swap metrics are not exposed by the current deployments. Volume here is estimated from reserve changes observed by this frontend session.'}
      </div>

      {/* Tab Content */}
      {tab === 'pools' ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="space-y-3"
        >
          {/* Pool list */}
          {POOLS.map((pool, i) => {
            const isExpanded = expandedPool === pool.id

            return (
              <motion.div
                key={pool.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.4, ease: [0.2, 0, 0, 1] }}
              >
                <div className="rounded-2xl border border-border bg-glass hover:border-border-md transition-all duration-300 overflow-hidden">
                  {/* Pool header */}
                  <button
                    onClick={() => setExpandedPool(isExpanded ? null : pool.id)}
                    className="w-full flex items-center justify-between p-5 text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex -space-x-2">
                        <TokenIcon symbol={pool.tokenA} size="md" />
                        <TokenIcon symbol={pool.tokenB} size="md" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-text-primary">
                          {pool.tokenA} / {pool.tokenB}
                        </div>
                        <div className="text-xs text-text-tertiary font-mono">{pool.fee}% fee</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 sm:gap-10">
                      <div className="text-right hidden sm:block">
                        <div className="font-mono text-sm text-text-primary tabular-nums">{formatUsd(pool.tvl)}</div>
                        <div className="text-[10px] text-text-ghost font-mono">TVL</div>
                      </div>
                      <div className="text-right hidden sm:block">
                        <div className="font-mono text-sm text-text-primary tabular-nums">{formatUsd(pool.volume24h)}</div>
                        <div className="text-[10px] text-text-ghost font-mono">24h Vol</div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-sm text-positive tabular-nums">{pool.apr}%</div>
                        <div className="text-[10px] text-text-ghost font-mono">APR</div>
                      </div>
                      <ChevronDown
                        size={14}
                        className={`text-text-tertiary transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-5 pb-5 border-t border-border pt-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                            <div>
                              <div className="text-[10px] font-mono text-text-tertiary uppercase">Reserve {pool.tokenA}</div>
                              <div className="font-mono text-sm text-text-primary tabular-nums">
                                {formatNumber(pool.reserveA)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-mono text-text-tertiary uppercase">Reserve {pool.tokenB}</div>
                              <div className="font-mono text-sm text-text-primary tabular-nums">
                                {formatNumber(pool.reserveB)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-mono text-text-tertiary uppercase">Formula</div>
                              <div className="font-mono text-sm text-text-primary">x × y = k</div>
                            </div>
                            <div>
                              <div className="text-[10px] font-mono text-text-tertiary uppercase">Privacy</div>
                              <PrivacyBadge level="full" />
                            </div>
                            <div>
                              <div className="text-[10px] font-mono text-text-tertiary uppercase">24h Volume</div>
                              <div className="font-mono text-sm text-text-primary tabular-nums">
                                {formatUsd(pool.volume24h)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-mono text-text-tertiary uppercase">APR</div>
                              <div className="font-mono text-sm text-positive tabular-nums">
                                {pool.apr}%
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-mono text-text-tertiary uppercase">Metrics</div>
                              <div className="font-mono text-sm text-text-primary">
                                {pool.metricsMode === 'onchain' ? 'On-chain cumulative' : 'Observed estimate'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] font-mono text-text-tertiary uppercase">Last Swap Block</div>
                              <div className="font-mono text-sm text-text-primary tabular-nums">
                                {pool.metricsMode === 'onchain' && pool.lastSwapBlock !== null ? pool.lastSwapBlock : 'n/a'}
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <button
                              onClick={() => setShowAddLiquidity(pool.id)}
                              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald text-obsidian font-semibold text-xs hover:bg-emerald/90 transition-colors press-scale"
                            >
                              <Plus size={13} />
                              Add Liquidity
                            </button>
                            <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border bg-glass text-text-secondary text-xs hover:border-border-md transition-colors press-scale">
                              <Minus size={13} />
                              Remove
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      ) : (
        /* My Positions */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="space-y-4"
        >
          {/* Shield toggle + refresh for My Positions */}
          {connected && (
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={refetchLp}
                disabled={lpLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-text-tertiary hover:text-text-primary hover:border-border-md transition-all"
                title="Refresh positions"
              >
                <RefreshCw size={12} className={lpLoading ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">{lpLoading ? 'Loading...' : 'Refresh'}</span>
              </button>
              <button
                onClick={toggleShield}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                  shieldActive
                    ? 'border-emerald/20 bg-emerald-ghost text-emerald'
                    : 'border-border text-text-tertiary hover:text-text-primary hover:border-border-md'
                }`}
                title={shieldActive ? 'Click to reveal values' : 'Click to shield values'}
              >
                {shieldActive ? <EyeOff size={12} /> : <Eye size={12} />}
                <span className="hidden sm:inline">{shieldActive ? 'Shielded' : 'Revealed'}</span>
              </button>
            </div>
          )}

          {connected ? (
            lpLoading ? (
              <div className="text-center py-16">
                <Loader2 size={32} className="mx-auto text-text-ghost mb-4 animate-spin" />
                <div className="text-sm text-text-tertiary">Loading LP positions...</div>
              </div>
            ) : lpPositions.length > 0 ? (
              lpPositions.map((pos, i) => (
                <GlassCard key={`${pos.poolId}-${i}`} variant="bordered">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="flex -space-x-2">
                        <TokenIcon symbol={pos.tokenA} size="md" />
                        <TokenIcon symbol={pos.tokenB} size="md" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-text-primary">{pos.tokenA} / {pos.tokenB}</div>
                        <div className="text-xs text-text-tertiary font-mono">
                          {shieldActive ? '••••' : `${pos.sharePercent.toFixed(2)}%`} pool share
                        </div>
                      </div>
                    </div>
                    <PrivacyBadge level="shielded" />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                    <div>
                      <div className="text-[10px] font-mono text-text-tertiary uppercase">Value</div>
                      <div className="font-mono text-sm text-text-primary tabular-nums">
                        {shieldActive ? '••••••' : formatUsd(pos.valueUsd)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-text-tertiary uppercase">Fees Earned</div>
                      <div className="font-mono text-sm text-positive tabular-nums">
                        {shieldActive ? '••••' : `$${formatNumber(pos.earnedFees)}`}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-text-tertiary uppercase">{pos.tokenA}</div>
                      <div className="font-mono text-sm text-text-primary tabular-nums">
                        {shieldActive ? '••••' : formatNumber(pos.tokenAAmount, pos.tokenA === 'ETHx' ? 3 : 0)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono text-text-tertiary uppercase">{pos.tokenB}</div>
                      <div className="font-mono text-sm text-text-primary tabular-nums">
                        {shieldActive ? '••••' : formatNumber(pos.tokenBAmount, 0)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowAddLiquidity(pos.poolId)}
                      className="flex-1 py-2 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary hover:border-border-md transition-all press-scale"
                    >
                      Add More
                    </button>
                    <button className="flex-1 py-2 rounded-lg border border-border text-xs text-text-secondary hover:text-text-primary hover:border-border-md transition-all press-scale">
                      Remove
                    </button>
                  </div>
                </GlassCard>
              ))
            ) : (
              <div className="text-center py-16">
                <Droplets size={32} className="mx-auto text-text-ghost mb-4" />
                <div className="text-sm text-text-tertiary">No active LP positions</div>
                <div className="text-xs text-text-ghost mt-1">Add liquidity to a pool to see your positions here</div>
              </div>
            )
          ) : (
            <div className="text-center py-16">
              <Lock size={32} className="mx-auto text-text-ghost mb-4" />
              <div className="text-sm text-text-tertiary mb-4">Connect wallet to view positions</div>
              <button onClick={connect} className="px-6 py-2.5 rounded-xl bg-emerald text-obsidian font-semibold text-sm press-scale">
                Connect Wallet
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* Add Liquidity Modal */}
      <AnimatePresence>
        {showAddLiquidity && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-void/60 backdrop-blur-sm"
              onClick={handleCloseModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
              className="fixed top-[50%] left-[50%] -translate-x-[50%] -translate-y-[50%] z-50 w-full max-w-md px-4"
            >
              {(() => {
                const pool = POOLS.find(p => p.id === showAddLiquidity)
                if (!pool) return null
                return (
                  <div className="bg-carbon border border-border-md rounded-2xl shadow-deep overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                      <h3 className="font-display text-lg text-text-primary">Add Liquidity</h3>
                      <button onClick={handleCloseModal} className="p-1.5 rounded-lg hover:bg-glass-md transition-colors">
                        <X size={16} className="text-text-tertiary" />
                      </button>
                    </div>
                    <div className="p-6 space-y-4">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex -space-x-2">
                          <TokenIcon symbol={pool.tokenA} />
                          <TokenIcon symbol={pool.tokenB} />
                        </div>
                        <span className="font-medium text-text-primary">{pool.tokenA} / {pool.tokenB}</span>
                      </div>

                      {/* Token A input */}
                      <div className="p-4 rounded-xl border border-border bg-glass">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">{pool.tokenA}</span>
                          <button
                            onClick={() => { setLastEdited('A'); setAmountA(String(balances[pool.tokenA] || 0)); }}
                            className="text-[10px] font-mono text-text-tertiary hover:text-emerald transition-colors"
                          >
                            Balance: {formatNumber(balances[pool.tokenA] || 0, 4)}
                            <span className="text-emerald ml-1">MAX</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          value={amountA}
                          onChange={handleAmountAChange}
                          placeholder="0.00"
                          disabled={loading}
                          className="w-full bg-transparent text-xl font-mono text-text-primary outline-none placeholder:text-text-ghost disabled:opacity-50"
                        />
                      </div>

                      {/* Token B input */}
                      <div className="p-4 rounded-xl border border-border bg-glass">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">{pool.tokenB}</span>
                          <button
                            onClick={() => { setLastEdited('B'); setAmountB(String(balances[pool.tokenB] || 0)); }}
                            className="text-[10px] font-mono text-text-tertiary hover:text-emerald transition-colors"
                          >
                            Balance: {formatNumber(balances[pool.tokenB] || 0, 4)}
                            <span className="text-emerald ml-1">MAX</span>
                          </button>
                        </div>
                        <input
                          type="text"
                          value={amountB}
                          onChange={handleAmountBChange}
                          placeholder="0.00"
                          disabled={loading}
                          className="w-full bg-transparent text-xl font-mono text-text-primary outline-none placeholder:text-text-ghost disabled:opacity-50"
                        />
                      </div>

                      {/* Pool price ratio info */}
                      {pool.reserveA > 0 && pool.reserveB > 0 ? (
                        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-glass border border-border">
                          <span className="text-[11px] text-text-tertiary font-mono">Pool ratio</span>
                          <span className="text-[11px] text-text-secondary font-mono tabular-nums">
                            1 {pool.tokenA} = {(pool.reserveB / pool.reserveA).toFixed(6).replace(/\.?0+$/, '')} {pool.tokenB}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-gold/5 border border-gold/10">
                          <span className="text-[11px] text-gold font-mono">New pool — enter both amounts to set the initial price ratio</span>
                        </div>
                      )}

                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-ghost">
                        <Lock size={12} className="text-emerald" />
                        <span className="text-[11px] text-emerald">LP position will be fully shielded</span>
                      </div>

                      {/* Status message */}
                      <AnimatePresence mode="wait">
                        {statusMsg && !showSuccess && (
                          <motion.div
                            key="status"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-glass"
                          >
                            <Loader2 size={13} className="text-emerald animate-spin shrink-0" />
                            <span className="text-[11px] text-text-secondary font-mono">{statusMsg}</span>
                          </motion.div>
                        )}

                        {txStatus === 'pending' && !showSuccess && (
                          <motion.div
                            key="pending"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-emerald/20 bg-emerald-ghost"
                          >
                            <Loader2 size={13} className="text-emerald animate-spin shrink-0" />
                            <span className="text-[11px] text-emerald font-mono">
                              Transaction pending...{txId ? ` ${txId.slice(0, 12)}...` : ''}
                            </span>
                          </motion.div>
                        )}

                        {showSuccess && (
                          <motion.div
                            key="success"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-positive/20 bg-positive/5"
                          >
                            <CheckCircle size={13} className="text-positive shrink-0" />
                            <span className="text-[11px] text-positive font-mono">
                              Liquidity added successfully!{txId ? ` TX: ${txId.slice(0, 12)}...` : ''}
                            </span>
                          </motion.div>
                        )}

                        {error && !loading && (
                          <motion.div
                            key="error"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="px-3 py-2.5 rounded-lg border border-negative/20 bg-negative/5"
                          >
                            <div className="flex items-center gap-2">
                              <AlertTriangle size={13} className="text-negative shrink-0" />
                              <span className="text-[11px] text-negative font-mono">{error}</span>
                            </div>
                            {txId && (
                              <div className="mt-2 pl-5 text-[10px] text-text-ghost font-mono break-all">
                                TX: {txId}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {connected ? (
                        <button
                          onClick={handleAddLiquidity}
                          disabled={isButtonDisabled}
                          className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                            showSuccess
                              ? 'bg-positive text-obsidian'
                              : isButtonDisabled
                                ? 'bg-emerald/60 text-obsidian/70 cursor-not-allowed'
                                : 'bg-emerald text-obsidian press-scale hover:bg-emerald/90'
                          }`}
                        >
                          {loading && !showSuccess && (
                            <Loader2 size={14} className="animate-spin" />
                          )}
                          {showSuccess && (
                            <CheckCircle size={14} />
                          )}
                          {buttonLabel}
                        </button>
                      ) : (
                        <button onClick={connect} className="w-full py-3.5 rounded-xl bg-emerald text-obsidian font-semibold text-sm press-scale">
                          Connect Wallet
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
