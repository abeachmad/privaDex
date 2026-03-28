import { motion } from 'motion/react'
import {
  Shield, Eye, EyeOff, Lock, Droplets,
  Moon, BookOpen, ArrowLeftRight, Clock, Loader2,
} from 'lucide-react'
import GlassCard from '../components/shared/GlassCard'
import TokenIcon from '../components/shared/TokenIcon'
import PrivacyBadge from '../components/shared/PrivacyBadge'
import { useWallet } from '../context/WalletContext'
import { usePortfolioData } from '../hooks/usePortfolioData'
import {
  TOKENS, MOCK_LP_POSITIONS, MOCK_DARK_ORDERS, MOCK_LIMIT_ORDERS,
  formatUsd, formatNumber, timeAgo,
} from '../data/tokens'

export default function Portfolio() {
  const { connected, connect, shieldActive, toggleShield, balances } = useWallet()
  const { loading: portfolioLoading, lpPositions: realLpPositions, trades } = usePortfolioData()

  if (!connected) {
    return (
      <div className="max-w-lg mx-auto text-center py-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Lock size={40} className="mx-auto text-text-ghost mb-6" />
          <h2 className="font-display text-2xl text-text-primary mb-2">Shielded Portfolio</h2>
          <p className="text-sm text-text-tertiary mb-8">Connect your wallet to view your private balances and positions.</p>
          <button onClick={connect} className="px-8 py-3 rounded-xl bg-emerald text-obsidian font-semibold text-sm press-scale">
            Connect Wallet
          </button>
        </motion.div>
      </div>
    )
  }

  // Map real LP positions to the UI shape, falling back to mock data when empty
  const lpPositions = realLpPositions.length > 0
    ? realLpPositions.map(pos => ({
        poolId: String(pos.poolId),
        tokenA: pos.tokenA,
        tokenB: pos.tokenB,
        sharePercent: pos.sharePercent,
        valueUsd: pos.valueUsd,
        tokenAAmount: pos.tokenAAmount,
        tokenBAmount: pos.tokenBAmount,
        earnedFees: 0, // not available from on-chain yet
      }))
    : MOCK_LP_POSITIONS

  const totalBalance = Object.entries(balances).reduce((sum, [sym, bal]) => {
    const prices: Record<string, number> = { ALEO: 0.065, USDCx: 1, BTCx: 68000, ETHx: 1980 }
    return sum + bal * (prices[sym] || 0)
  }, 0)

  const totalLP = lpPositions.reduce((s, p) => s + p.valueUsd, 0)

  // Use real trades if available, otherwise fall back to mock dark orders
  const hasTrades = trades.length > 0

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="font-display text-2xl text-text-primary">Portfolio</h1>
          <p className="text-xs text-text-tertiary mt-0.5">Your private positions and balances</p>
        </div>
        <button
          onClick={toggleShield}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border hover:border-border-md transition-all duration-200 press-scale"
        >
          {shieldActive ? <EyeOff size={14} className="text-emerald" /> : <Eye size={14} className="text-text-secondary" />}
          <span className="text-xs font-mono">{shieldActive ? 'Reveal' : 'Shield'}</span>
        </button>
      </motion.div>

      {/* Loading overlay */}
      {portfolioLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center justify-center gap-3 mb-6 p-4 rounded-xl border border-border bg-glass"
        >
          <Loader2 size={16} className="text-cyan animate-spin" />
          <span className="text-xs font-mono text-text-tertiary">Fetching on-chain portfolio data…</span>
        </motion.div>
      )}

      {/* Portfolio value */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="rounded-2xl border border-border-md bg-carbon p-8 shadow-deep mb-8"
      >
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-2">Total Portfolio Value</div>
            <div className="font-mono text-4xl text-text-primary tabular-nums">
              {shieldActive ? (
                <span className="text-text-ghost tracking-widest">$•••,•••.••</span>
              ) : (
                formatUsd(totalBalance + totalLP)
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[10px] font-mono text-text-ghost">Wallet</div>
              <div className="font-mono text-sm text-text-primary tabular-nums">
                {shieldActive ? '••••••' : formatUsd(totalBalance)}
              </div>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-right">
              <div className="text-[10px] font-mono text-text-ghost">LP Value</div>
              <div className="font-mono text-sm text-text-primary tabular-nums">
                {shieldActive ? '••••••' : formatUsd(totalLP)}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <PrivacyBadge level="shielded" />
          <span className="text-[10px] text-text-ghost font-mono">All balances stored on-chain in encrypted form</span>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Wallet Balances */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <GlassCard variant="bordered">
            <div className="flex items-center gap-2 mb-5">
              <Shield size={14} className="text-emerald" />
              <span className="text-xs font-mono text-text-tertiary uppercase tracking-wider">Shielded Balances</span>
            </div>
            <div className="space-y-4">
              {Object.entries(balances).map(([symbol, balance]) => {
                const token = TOKENS[symbol]
                const prices: Record<string, number> = { ALEO: 0.065, USDCx: 1, BTCx: 68000, ETHx: 1980 }
                const usdValue = balance * (prices[symbol] || 0)

                return (
                  <div key={symbol} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <TokenIcon symbol={symbol} />
                      <div>
                        <div className="text-sm font-medium text-text-primary">{token.symbol}</div>
                        <div className="text-xs text-text-tertiary">{token.name}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm text-text-primary tabular-nums">
                        {shieldActive ? '••••••' : formatNumber(balance, symbol === 'BTCx' ? 4 : 2)}
                      </div>
                      <div className="font-mono text-xs text-text-tertiary tabular-nums">
                        {shieldActive ? '••••' : formatUsd(usdValue)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </GlassCard>
        </motion.div>

        {/* LP Positions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <GlassCard variant="bordered">
            <div className="flex items-center gap-2 mb-5">
              <Droplets size={14} className="text-cyan" />
              <span className="text-xs font-mono text-text-tertiary uppercase tracking-wider">LP Positions</span>
            </div>
            <div className="space-y-4">
              {lpPositions.map(pos => (
                <div key={pos.poolId} className="p-4 rounded-xl bg-glass border border-border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-1.5">
                        <TokenIcon symbol={pos.tokenA} size="sm" />
                        <TokenIcon symbol={pos.tokenB} size="sm" />
                      </div>
                      <span className="text-xs font-medium text-text-primary">{pos.tokenA}/{pos.tokenB}</span>
                    </div>
                    <span className="font-mono text-xs text-text-tertiary">{pos.sharePercent}% share</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-text-ghost font-mono">Value</div>
                      <div className="font-mono text-xs text-text-primary tabular-nums">
                        {shieldActive ? '••••' : formatUsd(pos.valueUsd)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-text-ghost font-mono">Fees Earned</div>
                      <div className="font-mono text-xs text-positive tabular-nums">
                        {shieldActive ? '••••' : `+$${formatNumber(pos.earnedFees)}`}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>

        {/* Active Orders */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          <GlassCard variant="bordered">
            <div className="flex items-center gap-2 mb-5">
              <BookOpen size={14} className="text-gold" />
              <span className="text-xs font-mono text-text-tertiary uppercase tracking-wider">Open Orders</span>
            </div>
            <div className="space-y-3">
              {MOCK_LIMIT_ORDERS.filter(o => o.status === 'active' || o.status === 'partial').map(order => (
                <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-glass border border-border">
                  <div>
                    <div className="text-xs font-medium text-text-primary">
                      <span className={order.side === 'buy' ? 'text-positive' : 'text-danger'}>
                        {order.side.toUpperCase()}
                      </span>{' '}
                      {formatNumber(order.amount, 0)} ALEO
                    </div>
                    <div className="text-[10px] text-text-ghost font-mono">
                      @ ${formatNumber(order.price, 4)} · {timeAgo(order.timestamp)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono text-xs text-text-primary tabular-nums">
                      {((order.filled / order.amount) * 100).toFixed(0)}% filled
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </motion.div>

        {/* Dark Pool Activity / Trade History */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <GlassCard variant="bordered">
            <div className="flex items-center gap-2 mb-5">
              {hasTrades ? (
                <ArrowLeftRight size={14} className="text-cyan" />
              ) : (
                <Moon size={14} className="text-cyan" />
              )}
              <span className="text-xs font-mono text-text-tertiary uppercase tracking-wider">
                {hasTrades ? 'Trade History' : 'Dark Pool Activity'}
              </span>
            </div>
            <div className="space-y-3">
              {hasTrades ? (
                /* Real trade history from on-chain / localStorage */
                trades.slice(0, 6).map(trade => (
                  <div key={trade.id} className="flex items-center justify-between p-3 rounded-lg bg-glass border border-border">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        trade.side === 'BUY' ? 'bg-emerald-ghost text-emerald' : 'bg-danger/10 text-danger'
                      }`}>
                        {trade.side === 'BUY' ? 'B' : 'S'}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-text-primary">
                          <span className={trade.side === 'BUY' ? 'text-positive' : 'text-danger'}>
                            {trade.side}
                          </span>{' '}
                          {trade.pair}
                        </div>
                        <div className="text-[10px] text-text-ghost font-mono flex items-center gap-1.5">
                          <Clock size={9} />
                          {timeAgo(trade.timestamp)}
                          <span className="text-text-ghost">·</span>
                          {trade.venue}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xs text-text-primary tabular-nums">
                        {shieldActive ? '••••••' : trade.amountIn}
                      </div>
                      <div className="font-mono text-[10px] text-text-tertiary tabular-nums">
                        {shieldActive ? '••••' : `→ ${trade.amountOut}`}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                /* Fallback: mock dark pool orders */
                MOCK_DARK_ORDERS.slice(0, 3).map(order => (
                  <div key={order.id} className="flex items-center justify-between p-3 rounded-lg bg-glass border border-border">
                    <div>
                      <div className="text-xs font-medium text-text-primary">
                        {order.side === 'buy' ? 'Buy' : 'Sell'} · Epoch #{order.epoch}
                      </div>
                      <div className="text-[10px] text-text-ghost font-mono">{timeAgo(order.timestamp)}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                      order.status === 'claimable' ? 'bg-gold-muted text-gold' :
                      order.status === 'pending' ? 'bg-cyan-muted text-cyan' :
                      'bg-emerald-ghost text-emerald'
                    }`}>
                      {order.status}
                    </span>
                  </div>
                ))
              )}

              {hasTrades && trades.length === 0 && (
                <div className="text-center py-4">
                  <span className="text-xs text-text-ghost font-mono">No trades yet</span>
                </div>
              )}
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </div>
  )
}
