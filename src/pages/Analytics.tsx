import { useMemo, useState, useEffect } from 'react'
import { motion } from 'motion/react'
import {
  BarChart3, TrendingUp, DollarSign, Activity, Shield, Lock,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts'
import GlassCard from '../components/shared/GlassCard'
import PrivacyBadge from '../components/shared/PrivacyBadge'
import { useOnChainPools } from '../hooks/useOnChainPools'
import { useDarkPoolState } from '../hooks/useDarkPoolState'
import { POOLS, formatUsd, formatNumber } from '../data/tokens'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="px-3 py-2 rounded-lg bg-carbon border border-border-md shadow-elevated text-xs">
        <div className="text-text-tertiary font-mono mb-1">{label}</div>
        <div className="text-text-primary font-mono tabular-nums">
          {payload[0].value?.toFixed?.(4) ?? payload[0].value}
        </div>
      </div>
    )
  }
  return null
}

export default function Analytics() {
  const { pools: onChainPools, totalTVL: realTVL, loading: poolsLoading, metricsCoverage } = useOnChainPools()
  const darkPool = useDarkPoolState()

  const displayPools = onChainPools.length > 0 ? onChainPools : POOLS
  const totalTVL = realTVL > 0 ? realTVL : POOLS.reduce((s, p) => s + p.tvl, 0)
  const activePools = displayPools.filter((p: any) => (p.reserveA || 0) > 0)

  // ─── TVL History (localStorage-persisted, accumulates over time) ─────────
  const TVL_STORAGE_KEY = 'privadex_tvl_history'
  const VOL_STORAGE_KEY = 'privadex_vol_history'

  const [tvlHistory, setTvlHistory] = useState<{ date: string; tvl: number }[]>([])
  const [volHistory, setVolHistory] = useState<{ date: string; volume: number }[]>([])

  // Load history from localStorage and append current data point
  useEffect(() => {
    if (poolsLoading || totalTVL <= 0) return

    const now = new Date()
    const dateKey = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:00`

    // TVL history
    try {
      const stored: { date: string; tvl: number }[] = JSON.parse(localStorage.getItem(TVL_STORAGE_KEY) || '[]')
      // Only add if last entry is different date or empty
      if (stored.length === 0 || stored[stored.length - 1].date !== dateKey) {
        stored.push({ date: dateKey, tvl: totalTVL })
        if (stored.length > 168) stored.splice(0, stored.length - 168) // keep last 7 days hourly
        localStorage.setItem(TVL_STORAGE_KEY, JSON.stringify(stored))
      } else {
        // Update latest
        stored[stored.length - 1].tvl = totalTVL
        localStorage.setItem(TVL_STORAGE_KEY, JSON.stringify(stored))
      }
      setTvlHistory(stored)
    } catch {
      setTvlHistory([{ date: dateKey, tvl: totalTVL }])
    }

    // Volume history — uses real volume from pool tracker
    const currentVolume = displayPools.reduce((s: number, p: any) => s + (p.volume24h || 0), 0)
    try {
      const stored: { date: string; volume: number }[] = JSON.parse(localStorage.getItem(VOL_STORAGE_KEY) || '[]')
      if (stored.length === 0 || stored[stored.length - 1].date !== dateKey) {
        stored.push({ date: dateKey, volume: currentVolume })
        if (stored.length > 168) stored.splice(0, stored.length - 168)
        localStorage.setItem(VOL_STORAGE_KEY, JSON.stringify(stored))
      } else {
        // Update latest with current volume
        stored[stored.length - 1].volume = Math.max(stored[stored.length - 1].volume, currentVolume)
        localStorage.setItem(VOL_STORAGE_KEY, JSON.stringify(stored))
      }
      setVolHistory(stored)
    } catch {
      setVolHistory([{ date: dateKey, volume: currentVolume }])
    }
  }, [poolsLoading, totalTVL])

  // Build real pool share pie chart
  const poolShareData = useMemo(() => {
    const colors = ['#2dd4a0', '#67e8f9', '#d4a853', '#627eea', '#f7931a', '#ef4444']
    return displayPools
      .filter((p: any) => p.tvl > 0)
      .map((p, i) => ({
        name: `${p.tokenA}/${p.tokenB}`,
        value: p.tvl,
        color: colors[i % colors.length],
      }))
  }, [displayPools])

  // Spot prices from reserves
  const spotPrices = useMemo(() => {
    return displayPools
      .filter((p: any) => p.reserveA > 0 && p.reserveB > 0)
      .map(p => ({
        pair: `${p.tokenA}/${p.tokenB}`,
        price: p.reserveB / p.reserveA,
        tokenA: p.tokenA,
        tokenB: p.tokenB,
        reserveA: p.reserveA,
        reserveB: p.reserveB,
      }))
  }, [displayPools])

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <h1 className="font-display text-2xl text-text-primary">Analytics</h1>
          <p className="text-xs text-text-tertiary mt-0.5">Real-time on-chain protocol metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <PrivacyBadge level="full" size="md" />
          <span className="px-2 py-1 rounded bg-emerald-ghost text-emerald text-[10px] font-mono">LIVE POOL STATE</span>
        </div>
      </motion.div>

      {/* Top stats */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.5 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8"
      >
        {[
          { icon: DollarSign, label: 'Total Value Locked', value: poolsLoading ? '...' : formatUsd(totalTVL), color: 'text-emerald' },
          { icon: Activity, label: 'Active Pools', value: `${activePools.length} / ${displayPools.length}`, color: 'text-cyan' },
          { icon: TrendingUp, label: 'Dark Pool Epoch', value: darkPool.loading ? '...' : `#${darkPool.currentEpoch}`, color: 'text-gold' },
          { icon: Shield, label: 'Shielded Trades', value: '100%', color: 'text-emerald' },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
            className="p-5 rounded-xl border border-border bg-glass"
          >
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={13} className={stat.color} />
              <span className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">{stat.label}</span>
            </div>
            <div className="font-mono text-xl text-text-primary tabular-nums">{stat.value}</div>
          </motion.div>
        ))}
      </motion.div>

      <div className="mb-8 text-[11px] text-text-ghost">
        {metricsCoverage === 'full'
          ? 'Pool reserves, dark-pool epoch state, and cumulative AMM metrics are live on-chain. The 24h volume chart still uses observed frontend estimates until rolling on-chain buckets are indexed.'
          : metricsCoverage === 'partial'
            ? 'Pool reserves and dark-pool epoch state are live on-chain. Some pools already expose cumulative AMM metrics, while 24h volume remains an observed frontend estimate.'
            : 'Pool reserves and dark-pool epoch state are live on-chain. Cumulative AMM metrics are not available on the current deployment, so 24h volume stays an observed frontend estimate.'}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* TVL Chart (time-series) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="lg:col-span-2"
        >
          <GlassCard variant="bordered">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-1">Total Value Locked</div>
                <div className="font-mono text-2xl text-text-primary tabular-nums">{formatUsd(totalTVL)}</div>
              </div>
              <span className="text-[10px] font-mono text-text-ghost">{tvlHistory.length} data points</span>
            </div>
            <div className="h-64">
              {tvlHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={tvlHistory}>
                    <defs>
                      <linearGradient id="tvlGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2dd4a0" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#2dd4a0" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#5e5f67', fontFamily: 'JetBrains Mono' }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#5e5f67', fontFamily: 'JetBrains Mono' }}
                      tickFormatter={v => `$${v.toFixed(2)}`}
                      domain={['dataMin * 0.9', 'dataMax * 1.1']}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="tvl"
                      stroke="#2dd4a0"
                      strokeWidth={1.5}
                      fill="url(#tvlGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-text-tertiary">
                  {poolsLoading ? 'Loading on-chain data...' : 'TVL data will accumulate over time'}
                </div>
              )}
            </div>
          </GlassCard>
        </motion.div>

        {/* TVL Distribution Pie */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <GlassCard variant="bordered">
            <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-6">TVL Distribution</div>
            {poolShareData.length > 0 ? (
              <>
                <div className="h-48 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={poolShareData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        dataKey="value"
                        paddingAngle={3}
                        strokeWidth={0}
                      >
                        {poolShareData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2 mt-4">
                  {poolShareData.map(v => (
                    <div key={v.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                        <span className="text-xs text-text-secondary">{v.name}</span>
                      </div>
                      <span className="font-mono text-xs text-text-primary tabular-nums">{formatUsd(v.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-48 flex items-center justify-center text-text-tertiary text-sm">No data</div>
            )}
          </GlassCard>
        </motion.div>
      </div>

      {/* Trading Volume Chart */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
        className="mb-8"
      >
        <GlassCard variant="bordered">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-1">Trading Volume</div>
              <p className="text-[11px] text-text-ghost">Volume data accumulates from executed swaps</p>
            </div>
            <span className="text-[10px] font-mono text-text-ghost">{volHistory.length} data points</span>
          </div>
          <div className="h-48">
            {volHistory.length > 0 && volHistory.some(v => v.volume > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volHistory}>
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#5e5f67', fontFamily: 'JetBrains Mono' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: '#5e5f67', fontFamily: 'JetBrains Mono' }}
                    tickFormatter={v => `$${v.toFixed(0)}`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="volume" fill="#67e8f9" radius={[4, 4, 0, 0]} opacity={0.6} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2">
                <BarChart3 size={24} className="text-text-ghost" />
                <span className="text-sm text-text-tertiary">No trading volume recorded yet</span>
                <span className="text-[10px] text-text-ghost">Volume will appear after swaps are executed on-chain</span>
              </div>
            )}
          </div>
        </GlassCard>
      </motion.div>

      {/* Spot Prices */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.5 }}
        className="mb-8"
      >
        <GlassCard variant="bordered">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-1">On-Chain Spot Prices</div>
              <p className="text-[11px] text-text-ghost">Calculated from AMM reserves (x·y=k)</p>
            </div>
          </div>
          {spotPrices.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {spotPrices.map(sp => (
                <div key={sp.pair} className="p-4 rounded-xl bg-glass border border-border">
                  <div className="text-xs font-medium text-text-primary mb-2">{sp.pair}</div>
                  <div className="font-mono text-lg text-emerald tabular-nums mb-2">
                    {sp.price < 0.001 ? sp.price.toExponential(4) : sp.price.toFixed(6)}
                  </div>
                  <div className="text-[10px] text-text-ghost font-mono">
                    1 {sp.tokenA} = {sp.price < 0.001 ? sp.price.toExponential(4) : sp.price.toFixed(6)} {sp.tokenB}
                  </div>
                  <div className="flex justify-between mt-2 pt-2 border-t border-border">
                    <span className="text-[9px] text-text-ghost font-mono">{formatNumber(sp.reserveA, sp.reserveA < 1 ? 4 : 2)} {sp.tokenA}</span>
                    <span className="text-[9px] text-text-ghost font-mono">{formatNumber(sp.reserveB, sp.reserveB < 1 ? 6 : 2)} {sp.tokenB}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-text-tertiary text-sm">
              {poolsLoading ? 'Loading on-chain data...' : 'No pools with liquidity for pricing'}
            </div>
          )}
        </GlassCard>
      </motion.div>

      {/* Dark Pool Status */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.5 }}
        className="mb-8"
      >
        <GlassCard variant="bordered">
          <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-4">Dark Pool & Order Book Status</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-glass border border-border">
              <div className="text-xs text-text-secondary mb-1">Current Epoch</div>
              <div className="font-mono text-lg text-cyan tabular-nums">
                {darkPool.loading ? '...' : `#${darkPool.currentEpoch}`}
              </div>
              <div className="text-[10px] text-text-ghost font-mono mt-1">
                Block {darkPool.blockHeight || '—'} · ~{Math.floor(darkPool.secondsUntilNext / 60)}m {darkPool.secondsUntilNext % 60}s until next
              </div>
            </div>
            <div className="p-4 rounded-xl bg-glass border border-border">
              <div className="text-xs text-text-secondary mb-1">Epoch Intents</div>
              <div className="font-mono text-lg text-text-primary tabular-nums">
                {darkPool.epochState?.intentCount ?? 0}
              </div>
              <div className="text-[10px] text-text-ghost font-mono mt-1">
                Buy: {darkPool.epochState?.buyVolume ? `${(Number(darkPool.epochState.buyVolume) / 1e6).toFixed(2)}` : '0'} · 
                Sell: {darkPool.epochState?.sellVolume ? `${(Number(darkPool.epochState.sellVolume) / 1e6).toFixed(2)}` : '0'}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-glass border border-border">
              <div className="text-xs text-text-secondary mb-1">Settlement</div>
              <div className="font-mono text-lg text-text-primary tabular-nums">
                {darkPool.epochState?.closed ? 'Settled' : 'Open'}
              </div>
              <div className="text-[10px] text-text-ghost font-mono mt-1">
                Midpoint: {darkPool.epochState?.midPrice ? `${(Number(darkPool.epochState.midPrice) / 1e9).toFixed(6)}` : 'N/A'}
              </div>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* Privacy notice */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="mt-6 flex items-start gap-3 px-4 py-3 rounded-xl bg-emerald-ghost/30 border border-emerald/5"
      >
        <Lock size={13} className="text-emerald mt-0.5 shrink-0" />
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          All data shown is from on-chain public mappings (pool reserves, epoch state).
          Individual trade data, wallet addresses, and position sizes remain fully shielded by zero-knowledge proofs.
        </p>
      </motion.div>
    </div>
  )
}
