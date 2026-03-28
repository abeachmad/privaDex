import { useNavigate, Link } from 'react-router-dom'
import { motion } from 'motion/react'
import {
  Shield, ArrowRight, Lock, Eye, EyeOff, Zap, Moon, BookOpen,
  ArrowLeftRight, ChevronRight, Layers, Binary, Fingerprint, GitBranch,
} from 'lucide-react'
import { TOKENS } from '../data/tokens'

const FADE_UP = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.6, ease: [0.2, 0, 0, 1] as const },
}

const STAGGER_CONTAINER = {
  initial: {},
  whileInView: { transition: { staggerChildren: 0.1 } },
  viewport: { once: true },
}

const STAGGER_ITEM = {
  initial: { opacity: 0, y: 20 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease: [0.2, 0, 0, 1] as const },
}

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-obsidian overflow-hidden">
      {/* ═══ HERO ═══ */}
      <section className="relative min-h-screen flex flex-col">
        {/* Background layers */}
        <div className="absolute inset-0 crypto-grid opacity-40" />
        <div className="absolute inset-0 gradient-radial-emerald" />
        <div className="absolute bottom-0 left-0 right-0 h-64 gradient-veil-bottom z-10" />

        {/* Floating encrypted lines */}
        <div className="absolute top-[20%] left-0 right-0 opacity-20">
          <div className="crypto-line">
            <span className="crypto-line-inner font-mono text-[10px] text-text-ghost tracking-[0.5em]">
              {'zk_proof · shield_verify · 0x2dd4a0 · batch_settle · encrypt · route_private · 0xe91b · '.repeat(6)}
            </span>
          </div>
        </div>
        <div className="absolute top-[40%] left-0 right-0 opacity-10">
          <div className="crypto-line">
            <span className="crypto-line-inner font-mono text-[10px] text-text-ghost tracking-[0.5em]" style={{ animationDirection: 'reverse', animationDuration: '45s' }}>
              {'dark_pool · midpoint · epoch_847 · commit_order · verify · hidden_depth · 0xd4a853 · '.repeat(6)}
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="relative z-20 flex items-center justify-between px-6 lg:px-12 py-6">
          <div className="flex items-center gap-3">
            <div className="relative w-9 h-9">
              <div className="absolute inset-0 rounded-lg bg-emerald/20" />
              <div className="absolute inset-[3px] rounded-[5px] bg-obsidian flex items-center justify-center">
                <span className="text-emerald font-mono text-sm font-semibold">P</span>
              </div>
            </div>
            <span className="font-display text-xl text-text-primary tracking-tight">PrivaDEX</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#venues" className="text-sm text-text-secondary hover:text-text-primary transition-colors hidden sm:block">Venues</a>
            <a href="#privacy" className="text-sm text-text-secondary hover:text-text-primary transition-colors hidden sm:block">Privacy</a>
            <a href="#tokens" className="text-sm text-text-secondary hover:text-text-primary transition-colors hidden sm:block">Tokens</a>
            <button
              onClick={() => navigate('/swap')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald text-obsidian font-semibold text-sm hover:bg-emerald/90 transition-colors press-scale"
            >
              Launch App
              <ArrowRight size={14} />
            </button>
          </div>
        </nav>

        {/* Hero content */}
        <div className="relative z-20 flex-1 flex flex-col items-center justify-center px-6 text-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
          >
            {/* Privacy badge */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6, ease: [0.2, 0, 0, 1] as const }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-ghost border border-emerald/10 mb-8"
            >
              <Shield size={13} className="text-emerald" />
              <span className="text-xs font-mono text-emerald tracking-wide">BUILT ON ALEO · ZERO-KNOWLEDGE</span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8, ease: [0.2, 0, 0, 1] as const }}
              className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-text-primary leading-[0.95] tracking-tight mb-6"
            >
              Trade in
              <br />
              <span className="text-emerald italic">complete privacy</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6, ease: [0.2, 0, 0, 1] as const }}
              className="max-w-xl mx-auto text-lg text-text-secondary leading-relaxed mb-10"
            >
              The first privacy-native decentralized exchange. Three shielded execution venues.
              Zero-knowledge proofs. No exposed trade data. Ever.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.5, ease: [0.2, 0, 0, 1] as const }}
              className="flex flex-col sm:flex-row items-center gap-4"
            >
              <button
                onClick={() => navigate('/swap')}
                className="flex items-center gap-3 px-8 py-4 rounded-xl bg-emerald text-obsidian font-semibold text-base hover:bg-emerald/90 transition-all duration-200 press-scale shadow-elevated"
              >
                Start Trading
                <ArrowRight size={16} />
              </button>
              <a
                href="#venues"
                className="flex items-center gap-2 px-6 py-4 rounded-xl border border-border hover:border-border-md text-text-secondary hover:text-text-primary transition-all duration-200 text-sm"
              >
                How it works
                <ChevronRight size={14} />
              </a>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.8 }}
              className="flex items-center justify-center gap-8 sm:gap-16 mt-16"
            >
              {[
                { value: '$16.37M', label: 'Total Value Locked' },
                { value: '3', label: 'Private Venues' },
                { value: '100%', label: 'Shielded Trades' },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="font-mono text-2xl sm:text-3xl text-text-primary font-medium tabular-nums">{stat.value}</div>
                  <div className="text-xs text-text-tertiary mt-1 font-mono uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.5 }}
          className="relative z-20 flex justify-center pb-8"
        >
          <div className="w-5 h-8 rounded-full border border-border flex justify-center pt-1.5">
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              className="w-1 h-1.5 rounded-full bg-text-tertiary"
            />
          </div>
        </motion.div>
      </section>

      {/* ═══ THREE VENUES ═══ */}
      <section id="venues" className="relative py-32 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div {...FADE_UP} className="text-center mb-20">
            <div className="text-xs font-mono text-emerald uppercase tracking-widest mb-4">Execution Venues</div>
            <h2 className="font-display text-4xl sm:text-5xl text-text-primary tracking-tight mb-4">
              Three ways to trade.<br />
              <span className="text-text-secondary italic">All private.</span>
            </h2>
            <p className="text-text-tertiary max-w-lg mx-auto">
              Every venue uses zero-knowledge proofs. Your trade size, price, and identity
              remain completely hidden from all other participants.
            </p>
          </motion.div>

          <motion.div
            {...STAGGER_CONTAINER}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Shielded AMM */}
            <motion.div {...STAGGER_ITEM}>
              <div className="group relative h-full rounded-2xl border border-border hover:border-emerald/20 bg-glass transition-all duration-500 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-emerald/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-emerald-ghost flex items-center justify-center">
                      <Zap size={18} className="text-emerald" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl text-text-primary">Shielded AMM</h3>
                      <div className="text-xs font-mono text-emerald">Instant Execution</div>
                    </div>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed mb-6">
                    Automated market maker with constant product formula. Instant swaps across 6 token pairs.
                    All trade amounts and prices shielded by ZK proofs.
                  </p>
                  <div className="space-y-2">
                    {['Instant settlement', '0.3% swap fee', '6 trading pairs', 'LP yield earning'].map(f => (
                      <div key={f} className="flex items-center gap-2 text-xs text-text-tertiary">
                        <div className="w-1 h-1 rounded-full bg-emerald" />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Dark Pool */}
            <motion.div {...STAGGER_ITEM}>
              <div className="group relative h-full rounded-2xl border border-border hover:border-cyan/20 bg-glass transition-all duration-500 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-cyan/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-cyan-muted flex items-center justify-center">
                      <Moon size={18} className="text-cyan" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl text-text-primary">Dark Pool</h3>
                      <div className="text-xs font-mono text-cyan">Batch Execution</div>
                    </div>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed mb-6">
                    Institutional-grade batch matching. Orders are collected per epoch, then settled at midpoint price.
                    In the current app build, this venue is still experimental and used for manual intent testing rather than default routing.
                  </p>
                  <div className="space-y-2">
                    {['Epoch-based intents', 'Single pair prototype', 'Manual settlement flow', 'Not auto-routed yet'].map(f => (
                      <div key={f} className="flex items-center gap-2 text-xs text-text-tertiary">
                        <div className="w-1 h-1 rounded-full bg-cyan" />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Private Order Book */}
            <motion.div {...STAGGER_ITEM}>
              <div className="group relative h-full rounded-2xl border border-border hover:border-gold/20 bg-glass transition-all duration-500 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-gold/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative p-8">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-gold-muted flex items-center justify-center">
                      <BookOpen size={18} className="text-gold" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl text-text-primary">Private Order Book</h3>
                      <div className="text-xs font-mono text-gold">Limit Orders</div>
                    </div>
                  </div>
                  <p className="text-sm text-text-secondary leading-relaxed mb-6">
                    Place limit orders with ZK-committed prices. Your price and size are cryptographically hidden
                    from bots and other traders until execution. The current app exposes this as an experimental order-intent flow, not a fully automated matching engine.
                  </p>
                  <div className="space-y-2">
                    {['Hidden limit prices', 'Manual fill flow', 'Experimental order history', 'Not auto-routed yet'].map(f => (
                      <div key={f} className="flex items-center gap-2 text-xs text-text-tertiary">
                        <div className="w-1 h-1 rounded-full bg-gold" />
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══ BLIND ROUTER ═══ */}
      <section className="relative py-32 px-6 border-t border-border">
        <div className="absolute inset-0 gradient-radial-top" />
        <div className="max-w-5xl mx-auto relative">
          <motion.div {...FADE_UP} className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left: explanation */}
            <div>
              <div className="text-xs font-mono text-emerald uppercase tracking-widest mb-4">Blind Router</div>
              <h2 className="font-display text-4xl sm:text-5xl text-text-primary tracking-tight mb-6">
                Intelligent<br />
                <span className="text-text-secondary italic">private routing</span>
              </h2>
              <p className="text-text-secondary leading-relaxed mb-8">
                The Blind Router runs entirely in your browser. It evaluates executable AMM liquidity in real time
                and keeps experimental venues visible for manual research without auto-routing into them.
                No data leaves your device.
              </p>
              <div className="space-y-4">
                {[
                  { icon: GitBranch, label: 'Routes through live executable liquidity' },
                  { icon: Lock, label: 'Routing logic runs client-side only' },
                  { icon: Layers, label: 'Experimental venues stay available for manual testing' },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-glass-md flex items-center justify-center shrink-0">
                      <Icon size={14} className="text-emerald" />
                    </div>
                    <span className="text-sm text-text-secondary">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: route visualization */}
            <div className="relative">
              <div className="rounded-2xl border border-border bg-carbon p-6 shadow-deep">
                {/* Mock route comparison */}
                <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-4">Route Comparison</div>
                <div className="space-y-3">
                  {[
                    { venue: 'Shielded AMM', price: '0.9842', slippage: '0.12%', speed: '~15s', recommended: true, color: '#2dd4a0' },
                    { venue: 'Dark Pool', price: 'manual', slippage: 'exp', speed: '~epoch', recommended: false, color: '#67e8f9' },
                    { venue: 'Order Book', price: 'manual', slippage: 'exp', speed: 'manual', recommended: false, color: '#d4a853' },
                  ].map(route => (
                    <div
                      key={route.venue}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                        route.recommended
                          ? 'border-emerald/20 bg-emerald-ghost'
                          : 'border-border bg-glass'
                      } transition-all duration-200`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: route.color }} />
                        <div>
                          <div className="text-sm font-medium text-text-primary">{route.venue}</div>
                          {route.recommended && (
                            <div className="text-[10px] font-mono text-emerald">RECOMMENDED</div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <div className="font-mono text-sm text-text-primary tabular-nums">{route.price}</div>
                          <div className="text-[10px] text-text-tertiary font-mono">price</div>
                        </div>
                        <div className="hidden sm:block">
                          <div className="font-mono text-sm text-text-primary tabular-nums">{route.slippage}</div>
                          <div className="text-[10px] text-text-tertiary font-mono">slippage</div>
                        </div>
                        <div>
                          <div className="font-mono text-sm text-text-primary tabular-nums">{route.speed}</div>
                          <div className="text-[10px] text-text-tertiary font-mono">speed</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ HOW PRIVACY WORKS ═══ */}
      <section id="privacy" className="relative py-32 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <motion.div {...FADE_UP} className="text-center mb-20">
            <div className="text-xs font-mono text-emerald uppercase tracking-widest mb-4">Zero-Knowledge Architecture</div>
            <h2 className="font-display text-4xl sm:text-5xl text-text-primary tracking-tight mb-4">
              How privacy works
            </h2>
            <p className="text-text-tertiary max-w-lg mx-auto">
              Every transaction on PrivaDEX is protected by Aleo's zero-knowledge proof system.
              Here's what that means in practice.
            </p>
          </motion.div>

          <motion.div {...STAGGER_CONTAINER} className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[
              {
                icon: Fingerprint,
                title: 'Hidden Identity',
                desc: 'Your wallet address is never exposed on-chain. Counterparties cannot see who is trading.',
              },
              {
                icon: EyeOff,
                title: 'Shielded Amounts',
                desc: 'Trade sizes are encrypted. No observer can determine how much is being swapped.',
              },
              {
                icon: Lock,
                title: 'Private Prices',
                desc: 'Limit order prices are ZK-committed. Only revealed when matched, preventing front-running.',
              },
              {
                icon: Binary,
                title: 'Cryptographic Proofs',
                desc: 'Every trade generates a succinct proof verifying correctness without revealing any data.',
              },
            ].map(({ icon: Icon, title, desc }, i) => (
              <motion.div key={title} {...STAGGER_ITEM}>
                <div className="flex gap-5 p-6 rounded-2xl border border-border bg-glass hover:border-border-md transition-all duration-300">
                  <div className="w-10 h-10 rounded-xl bg-glass-md flex items-center justify-center shrink-0">
                    <Icon size={18} className="text-text-secondary" />
                  </div>
                  <div>
                    <h3 className="text-base font-medium text-text-primary mb-2">{title}</h3>
                    <p className="text-sm text-text-tertiary leading-relaxed">{desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ TOKENS ═══ */}
      <section id="tokens" className="relative py-32 px-6 border-t border-border">
        <div className="max-w-4xl mx-auto">
          <motion.div {...FADE_UP} className="text-center mb-16">
            <div className="text-xs font-mono text-emerald uppercase tracking-widest mb-4">Supported Assets</div>
            <h2 className="font-display text-4xl sm:text-5xl text-text-primary tracking-tight">
              Four tokens.<br />
              <span className="text-text-secondary italic">Six private pools.</span>
            </h2>
          </motion.div>

          <motion.div {...STAGGER_CONTAINER} className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { symbol: 'ALEO', name: 'Aleo', icon: TOKENS.ALEO.icon, color: '#2dd4a0', desc: 'Native gas & trading' },
              { symbol: 'USDCx', name: 'USD Coin', icon: TOKENS.USDCx.icon, color: '#67e8f9', desc: 'Test stablecoin' },
              { symbol: 'BTCx', name: 'Bitcoin', icon: TOKENS.BTCx.icon, color: '#f7931a', desc: 'Synthetic wrapped' },
              { symbol: 'ETHx', name: 'Ethereum', icon: TOKENS.ETHx.icon, color: '#627eea', desc: 'Synthetic wrapped' },
            ].map(token => (
              <motion.div key={token.symbol} {...STAGGER_ITEM}>
                <div className="rounded-2xl border border-border bg-glass p-6 text-center hover:border-border-md transition-all duration-300 group">
                  <div
                    className="w-14 h-14 rounded-xl mx-auto mb-4 flex items-center justify-center overflow-hidden transition-transform duration-300 group-hover:scale-110"
                    style={{ backgroundColor: `${token.color}12` }}
                  >
                    <img src={token.icon} alt={token.name} className="w-full h-full object-cover rounded-xl" />
                  </div>
                  <div className="font-mono text-sm font-medium text-text-primary">{token.symbol}</div>
                  <div className="text-xs text-text-tertiary mt-1">{token.desc}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══ TRUST ═══ */}
      <section className="relative py-32 px-6 border-t border-border">
        <div className="absolute inset-0 gradient-radial-emerald" />
        <div className="max-w-4xl mx-auto relative text-center">
          <motion.div {...FADE_UP}>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-glass border border-border mb-8">
              <Shield size={13} className="text-emerald" />
              <span className="text-xs font-mono text-text-secondary">Security Architecture</span>
            </div>
            <h2 className="font-display text-4xl sm:text-5xl text-text-primary tracking-tight mb-6">
              Non-custodial.<br />
              Cryptographically verifiable.
            </h2>
            <p className="text-text-secondary max-w-lg mx-auto mb-12">
              PrivaDEX never holds your funds. All swaps execute through auditable smart contracts
              on Aleo. Zero-knowledge proofs ensure mathematical correctness without trust.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              {[
                { label: 'Non-Custodial', desc: 'Your keys, your tokens. Always.' },
                { label: 'Open Source', desc: 'All contracts are publicly verifiable.' },
                { label: 'ZK-Verified', desc: 'Every state transition is proven.' },
              ].map(item => (
                <div key={item.label} className="p-5 rounded-xl border border-border bg-glass">
                  <div className="text-sm font-medium text-text-primary mb-1">{item.label}</div>
                  <div className="text-xs text-text-tertiary">{item.desc}</div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section className="relative py-32 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div {...FADE_UP}>
            <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl text-text-primary tracking-tight mb-6">
              Ready to trade<br />
              <span className="text-emerald italic">privately?</span>
            </h2>
            <p className="text-text-secondary mb-10">
              Connect your Aleo wallet and experience the first truly private DEX.
            </p>
            <button
              onClick={() => navigate('/swap')}
              className="inline-flex items-center gap-3 px-10 py-5 rounded-xl bg-emerald text-obsidian font-semibold text-lg hover:bg-emerald/90 transition-all duration-200 press-scale shadow-elevated"
            >
              Launch PrivaDEX
              <ArrowRight size={18} />
            </button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="relative w-7 h-7">
              <div className="absolute inset-0 rounded-md bg-emerald/20" />
              <div className="absolute inset-[2px] rounded-[4px] bg-obsidian flex items-center justify-center">
                <span className="text-emerald font-mono text-[10px] font-semibold">P</span>
              </div>
            </div>
            <span className="font-display text-sm text-text-tertiary">PrivaDEX</span>
            <span className="text-text-ghost text-xs font-mono ml-2">Aleo Testnet</span>
          </div>
          <div className="flex items-center gap-6 text-xs text-text-tertiary">
            <span>Privacy-First</span>
            <span className="text-text-ghost">·</span>
            <span>Non-Custodial</span>
            <span className="text-text-ghost">·</span>
            <span>Zero-Knowledge</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
