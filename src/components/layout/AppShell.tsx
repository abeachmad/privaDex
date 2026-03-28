import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import {
  ArrowLeftRight,
  Droplets,
  Moon,
  BookOpen,
  PieChart,
  BarChart3,
  Droplet,
  Shield,
  ShieldOff,
  Eye,
  EyeOff,
  ChevronDown,
  X,
  Menu,
  Loader2,
} from 'lucide-react'
import { useWallet } from '../../context/WalletContext'
import { shortenAddress } from '../../data/tokens'
import privadexLogo from '../../assets/tokens/privadex-logo.png'
import WalletModal from '../shared/WalletModal'
import CryptoTicker from '../shared/CryptoTicker'

const NAV_ITEMS = [
  { path: '/swap', label: 'Swap', icon: ArrowLeftRight },
  { path: '/pool', label: 'Pool', icon: Droplets },
  { path: '/darkpool', label: 'Dark Pool', icon: Moon },
  { path: '/orders', label: 'Orders', icon: BookOpen },
  { path: '/portfolio', label: 'Portfolio', icon: PieChart },
  { path: '/analytics', label: 'Analytics', icon: BarChart3 },
  { path: '/faucet', label: 'Faucet', icon: Droplet },
]

export default function AppShell() {
  const location = useLocation()
  const { connected, address, shieldActive, toggleShield, connect, disconnect, walletIcon, connecting } = useWallet()
  const [walletModalOpen, setWalletModalOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div className="min-h-screen bg-obsidian flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 border-b border-border backdrop-blur-xl bg-obsidian/80">
        {/* Crypto ticker band */}
        <CryptoTicker />

        <div className="container-app">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <NavLink to="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-white shrink-0">
                <img src={privadexLogo} alt="PrivaDEX" className="w-full h-full object-cover scale-150" />
              </div>
              <div className="hidden sm:block">
                <span className="font-display text-lg text-text-primary tracking-tight">PrivaDEX</span>
              </div>
            </NavLink>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {NAV_ITEMS.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `relative flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                      isActive
                        ? 'text-emerald'
                        : 'text-text-secondary hover:text-text-primary'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon size={15} strokeWidth={1.8} />
                      <span>{item.label}</span>
                      {isActive && (
                        <motion.div
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-lg bg-emerald-ghost border border-emerald/10"
                          transition={{ type: 'spring', duration: 0.4, bounce: 0 }}
                        />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>

            {/* Right section */}
            <div className="flex items-center gap-3">
              {/* Privacy Shield Toggle */}
              {connected && (
                <button
                  onClick={toggleShield}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono border border-border hover:border-border-md transition-all duration-200 press-scale"
                  title={shieldActive ? 'Balances shielded' : 'Balances revealed'}
                >
                  {shieldActive ? (
                    <>
                      <Shield size={13} className="text-emerald" />
                      <span className="text-emerald hidden sm:inline">Shielded</span>
                    </>
                  ) : (
                    <>
                      <ShieldOff size={13} className="text-text-tertiary" />
                      <span className="text-text-tertiary hidden sm:inline">Revealed</span>
                    </>
                  )}
                </button>
              )}

              {/* Wallet Button */}
              {connected ? (
                <button
                  onClick={() => setWalletModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-glass-md border border-border hover:border-border-md transition-all duration-200 press-scale"
                >
                  <div className="w-2 h-2 rounded-full bg-emerald" />
                  {walletIcon && (
                    <img src={walletIcon} alt="" className="w-4 h-4 rounded object-contain" />
                  )}
                  <span className="font-mono text-xs text-text-primary">
                    {address ? shortenAddress(address) : '...'}
                  </span>
                  <ChevronDown size={12} className="text-text-tertiary" />
                </button>
              ) : (
                <button
                  onClick={connect}
                  disabled={connecting}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-emerald text-obsidian font-semibold text-sm hover:bg-emerald/90 transition-colors duration-200 press-scale disabled:opacity-60"
                >
                  {connecting ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect Wallet'
                  )}
                </button>
              )}

              {/* Mobile menu toggle */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-lg hover:bg-glass-md transition-colors"
              >
                {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed inset-x-0 top-[calc(theme(spacing.16)+29px)] z-40 border-b border-border bg-obsidian/95 backdrop-blur-xl"
          >
            <nav className="container-app py-4 flex flex-col gap-1">
              {NAV_ITEMS.map(item => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-emerald bg-emerald-ghost'
                        : 'text-text-secondary hover:text-text-primary hover:bg-glass'
                    }`
                  }
                >
                  <item.icon size={16} strokeWidth={1.8} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1">
        <div className="container-app py-8">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="container-app">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full overflow-hidden bg-white opacity-60 shrink-0">
                <img src={privadexLogo} alt="PrivaDEX" className="w-full h-full object-cover scale-150" />
              </div>
              <span className="font-display text-sm text-text-tertiary">PrivaDEX</span>
              <span className="text-text-ghost text-xs">·</span>
              <span className="text-text-ghost text-xs font-mono">Aleo Testnet</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-text-tertiary">
              <span>Privacy-First</span>
              <span className="text-text-ghost">·</span>
              <span>Non-Custodial</span>
              <span className="text-text-ghost">·</span>
              <span>Zero-Knowledge</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Wallet Modal */}
      <WalletModal
        open={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
    </div>
  )
}
