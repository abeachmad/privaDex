import { useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { X, Shield, Copy, LogOut, Lock, Globe } from 'lucide-react'
import { useWallet } from '../../context/WalletContext'
import { TOKENS, formatNumber, formatAmount, shortenAddress } from '../../data/tokens'

interface Props {
  open: boolean
  onClose: () => void
}

export default function WalletModal({ open, onClose }: Props) {
  const {
    address,
    shieldActive,
    disconnect,
    toggleShield,
    balances,
    privateBalances,
    publicBalances,
    balancesLoading,
    refreshBalances,
  } = useWallet()

  useEffect(() => {
    if (!open) return
    refreshBalances()
  }, [open, refreshBalances])

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-void/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Side Panel (slides in from right) */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-sm"
          >
            <div className="h-full bg-carbon border-l border-border-md shadow-deep flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-border shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald" />
                  <span className="font-mono text-sm text-text-primary">
                    {address && shortenAddress(address)}
                  </span>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-glass-md transition-colors"
                >
                  <X size={16} className="text-text-tertiary" />
                </button>
              </div>

              {/* Shield Status */}
              <div className="px-6 py-4 border-b border-border shrink-0">
                <button
                  onClick={toggleShield}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-glass border border-border hover:border-border-md transition-all duration-200"
                >
                  <div className="flex items-center gap-3">
                    <Shield size={16} className={shieldActive ? 'text-emerald' : 'text-text-tertiary'} />
                    <div className="text-left">
                      <div className="text-sm font-medium text-text-primary">Privacy Shield</div>
                      <div className="text-xs text-text-tertiary">
                        {shieldActive ? 'Balances are hidden' : 'Balances are visible'}
                      </div>
                    </div>
                  </div>
                  <div className={`w-10 h-5 rounded-full transition-colors duration-300 flex items-center ${shieldActive ? 'bg-emerald/30 justify-end' : 'bg-glass-lg justify-start'}`}>
                    <div className={`w-4 h-4 rounded-full mx-0.5 transition-colors duration-300 ${shieldActive ? 'bg-emerald' : 'bg-text-tertiary'}`} />
                  </div>
                </button>
              </div>

              {/* Balances (scrollable) */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider">
                    Token Balances
                  </div>
                  {balancesLoading && (
                    <div className="text-[10px] font-mono text-text-ghost">
                      Refreshing...
                    </div>
                  )}
                </div>
                <div className="space-y-4">
                  {Object.entries(balances).map(([symbol, balance]) => {
                    const token = TOKENS[symbol]
                    const priv = privateBalances[symbol] || 0
                    const pub = publicBalances[symbol] || 0
                    const decimals = symbol === 'BTCx' ? 6 : 4
                    return (
                      <div key={symbol} className="p-3 rounded-xl bg-glass border border-border">
                        {/* Token header + total */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center overflow-hidden"
                              style={{ backgroundColor: `${token.color}15` }}
                            >
                              <img src={token.icon} alt={token.name} className="w-full h-full object-cover rounded-full" />
                            </div>
                            <div>
                              <div className="text-sm font-medium text-text-primary">{token.symbol}</div>
                              <div className="text-[10px] text-text-tertiary">{token.name}</div>
                            </div>
                          </div>
                          <div className="text-right font-mono text-sm tabular-nums">
                            {shieldActive ? (
                              <span className="text-text-ghost tracking-widest">••••••</span>
                            ) : (
                              <span className="text-text-primary">{formatAmount(balance)}</span>
                            )}
                          </div>
                        </div>
                        {/* Private / Public breakdown */}
                        {!shieldActive && (
                          <div className="flex gap-2 mt-1">
                            <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-emerald-ghost/30">
                              <Lock size={10} className="text-emerald shrink-0" />
                              <span className="text-[10px] text-emerald font-mono">Private</span>
                              <span className="text-[10px] text-emerald font-mono tabular-nums ml-auto">{formatNumber(priv, decimals)}</span>
                            </div>
                            <div className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-cyan/5">
                              <Globe size={10} className="text-cyan shrink-0" />
                              <span className="text-[10px] text-cyan font-mono">Public</span>
                              <span className="text-[10px] text-cyan font-mono tabular-nums ml-auto">{formatNumber(pub, decimals)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Footer (sticky bottom) */}
              <div className="shrink-0 border-t border-border px-6 py-4 space-y-3">
                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => { if (address) { navigator.clipboard.writeText(address); } }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-glass border border-border hover:border-border-md text-sm text-text-secondary hover:text-text-primary transition-all duration-200 press-scale"
                  >
                    <Copy size={14} />
                    Copy Address
                  </button>
                  <button
                    onClick={() => { disconnect(); onClose(); }}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-danger-muted border border-danger/20 hover:border-danger/40 text-sm text-danger transition-all duration-200 press-scale"
                  >
                    <LogOut size={14} />
                    Disconnect
                  </button>
                </div>
                {/* Footer info */}
                <div className="text-center space-y-1">
                  <div className="text-[10px] text-text-ghost font-mono">Aleo Testnet</div>
                  <div className="flex items-center justify-center gap-2 text-[10px] text-text-ghost">
                    <span>Privacy-First</span>
                    <span>·</span>
                    <span>Non-Custodial</span>
                    <span>·</span>
                    <span>Zero-Knowledge</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
