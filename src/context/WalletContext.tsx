import { ReactNode, createContext, useContext, useCallback, useState, useEffect, useMemo } from 'react'
import { useWallet as useAleoWallet } from '@provablehq/aleo-wallet-adaptor-react'
import { AleoWalletProvider } from '@provablehq/aleo-wallet-adaptor-react'
import { WalletModalProvider, useWalletModal } from '@provablehq/aleo-wallet-adaptor-react-ui'
import { DecryptPermission } from '@provablehq/aleo-wallet-adaptor-core'
import { ShieldWalletAdapter } from '@provablehq/aleo-wallet-adaptor-shield'
import { Network } from '@provablehq/aleo-types'
import { PROGRAMS as PROGRAM_IDS } from '../lib/programs'
import { getPublicAleoBalance, parseLeoInt, getRecordCredits, getMappingValue, fetchUsdcxTokenRecords, totalUsdcxBalance, fetchRegistryTokenRecords, totalRegistryTokenBalance, getRegistryPublicBalance, fetchRecordsRobust } from '../lib/aleo'
import { PROGRAMS, REGISTRY_TOKEN_IDS } from '../lib/programs'
import { setCachedRecords } from '../lib/recordCache'
import { isScannerConfigured, registerViewKey, resetScanner } from '../lib/recordScanner'

// ─── Programs to register with Shield Wallet ─────────────────────────────────
const SHIELDED_USDCX_PROGRAMS = Array.from(new Set([
  'credits.aleo',
  'merkle_tree.aleo',
  'test_usdcx_multisig_core.aleo',
  'test_usdcx_freezelist.aleo',
  PROGRAM_IDS.USDCX,
]))

const DARKPOOL_REQUIRED_PROGRAMS = Array.from(new Set([
  ...SHIELDED_USDCX_PROGRAMS,
  // Dark pool v4 still imports privadex_amm_v8.aleo during execution/settlement.
  'privadex_amm_v8.aleo',
  PROGRAM_IDS.DARKPOOL,
]))

const ORDERBOOK_REQUIRED_PROGRAMS = Array.from(new Set([
  ...SHIELDED_USDCX_PROGRAMS,
  PROGRAM_IDS.ORDERBOOK,
]))

const REGISTERED_PROGRAMS = Array.from(new Set([
  ...DARKPOOL_REQUIRED_PROGRAMS,
  ...ORDERBOOK_REQUIRED_PROGRAMS,
  PROGRAM_IDS.TOKEN,
  PROGRAM_IDS.AMM,
  PROGRAM_IDS.TOKEN_REGISTRY,
  PROGRAM_IDS.AMM_BTCX,
  PROGRAM_IDS.AMM_ETHX,
  PROGRAM_IDS.AMM_NATIVE_BTCX,
  PROGRAM_IDS.AMM_NATIVE_ETHX,
  PROGRAM_IDS.AMM_BTCX_ETHX,
]))

// ─── Wallet Context ──────────────────────────────────────────────────────────
interface WalletState {
  connected: boolean
  connecting: boolean
  address: string | null
  walletName: string | null
  walletIcon: string | null
  connect: () => void
  disconnect: () => Promise<void>
  // Balances
  balances: Record<string, number>
  privateBalances: Record<string, number>
  publicBalances: Record<string, number>
  balancesLoading: boolean
  shieldActive: boolean
  toggleShield: () => void
  refreshBalances: () => Promise<void>
  // Aleo SDK access (for on-chain transactions)
  executeTransaction: any
  requestRecords: any
  transactionStatus: any
  // Wallet selection (for manual connect flow)
  wallets: any[]
  selectWallet: any
  connectWallet: (walletName: string) => Promise<void>
  ensureShieldPrograms: (scope?: 'all' | 'darkpool' | 'orderbook') => Promise<void>
}

const WalletCtx = createContext<WalletState | null>(null)

// ─── Inner component that uses Aleo wallet hook ──────────────────────────────
function WalletContextProvider({ children }: { children: ReactNode }) {
  const aleoWallet = useAleoWallet()
  const { setVisible: setProvableModalVisible } = useWalletModal()
  const {
    connected,
    connecting,
    address: aleoAddress,
    wallet,
    wallets,
    selectWallet,
    connect: aleoConnect,
    disconnect: aleoDisconnect,
    requestRecords,
    executeTransaction,
    transactionStatus,
  } = aleoWallet as any

  const [shieldActive, setShieldActive] = useState(false)
  const [balances, setBalances] = useState<Record<string, number>>({
    ALEO: 0, USDCx: 0, BTCx: 0, ETHx: 0,
  })
  const [privateBalances, setPrivateBalances] = useState<Record<string, number>>({
    ALEO: 0, USDCx: 0, BTCx: 0, ETHx: 0,
  })
  const [publicBalances, setPublicBalances] = useState<Record<string, number>>({
    ALEO: 0, USDCx: 0, BTCx: 0, ETHx: 0,
  })
  const [balancesLoading, setBalancesLoading] = useState(false)

  const address = aleoAddress || null
  const walletName = wallet?.adapter?.name || null
  const walletIcon = wallet?.adapter?.icon || null

  // Debug: log wallet state changes
  if (typeof window !== 'undefined') {
    console.log('[Wallet State]', { connected, connecting, address: aleoAddress, walletName })
  }

  // Connect: opens the built-in Provable wallet modal
  const connect = useCallback(() => {
    setProvableModalVisible(true)
  }, [setProvableModalVisible])

  // Manual connect with specific wallet name
  const connectWallet = useCallback(async (name: string) => {
    try {
      selectWallet(name)
      // Wait for React to process selectWallet state change
      await new Promise(r => setTimeout(r, 100))
      await aleoConnect(Network.TESTNET)
    } catch (e: any) {
      console.error('[Wallet] Connect failed:', e)
      throw e
    }
  }, [selectWallet, aleoConnect])

  const ensureShieldPrograms = useCallback(async (scope: 'all' | 'darkpool' | 'orderbook' = 'all') => {
    if (!connected || walletName !== 'Shield Wallet') return

    const shield = (window as any).shield
    if (!shield?.connect) return

    const programs = scope === 'darkpool'
      ? DARKPOOL_REQUIRED_PROGRAMS
      : scope === 'orderbook'
        ? ORDERBOOK_REQUIRED_PROGRAMS
        : REGISTERED_PROGRAMS

    try {
      await shield.connect(Network.TESTNET, DecryptPermission.AutoDecrypt, programs)
      console.log('[Wallet] Refreshed Shield programs', { scope, programCount: programs.length })
    } catch (e) {
      console.warn('[Wallet] Shield program refresh failed:', e)
      throw e
    }
  }, [connected, walletName])

  const disconnect = useCallback(async () => {
    try {
      await aleoDisconnect()
      setBalances({ ALEO: 0, USDCx: 0, BTCx: 0, ETHx: 0 })
      setPrivateBalances({ ALEO: 0, USDCx: 0, BTCx: 0, ETHx: 0 })
      setPublicBalances({ ALEO: 0, USDCx: 0, BTCx: 0, ETHx: 0 })
      resetScanner()
    } catch (e) {
      console.error('[Wallet] Disconnect failed:', e)
    }
  }, [aleoDisconnect])

  const toggleShield = useCallback(() => setShieldActive(p => !p), [])

  // Fetch real on-chain balances
  const refreshBalances = useCallback(async () => {
    if (!connected || !address || !requestRecords) return
    setBalancesLoading(true)
    try {
      // Fetch records using robust 3-layer fallback
      const [creditsRecords, usdcxTokenRecs] = await Promise.all([
        fetchRecordsRobust(requestRecords, 'credits.aleo'),
        fetchUsdcxTokenRecords(requestRecords),
      ])

      if (creditsRecords.length > 0) setCachedRecords('credits.aleo', creditsRecords)

      // ALEO Private
      let aleoPrivate = 0n
      for (const r of creditsRecords) {
        if (r.spent) continue
        aleoPrivate += getRecordCredits(r)
      }

      // ALEO Public
      let aleoPublic = 0n
      try {
        aleoPublic = await getPublicAleoBalance(address)
      } catch { /* ignore */ }

      // USDCx Private
      const usdcxPrivate = totalUsdcxBalance(usdcxTokenRecs)

      // USDCx Public
      let usdcxPublic = 0n
      try {
        const val = await getMappingValue(PROGRAMS.USDCX, 'balances', address)
        if (val) usdcxPublic = parseLeoInt(val)
      } catch { /* ignore */ }

      // BTCx / ETHx (registry tokens: private records + public balance)
      let btcxPrivate = 0n
      let ethxPrivate = 0n
      let btcxPublic = 0n
      let ethxPublic = 0n
      try {
        const btcxRecs = await fetchRegistryTokenRecords(requestRecords, REGISTRY_TOKEN_IDS.BTCX)
        btcxPrivate = totalRegistryTokenBalance(btcxRecs)
      } catch { /* ignore */ }
      try {
        const ethxRecs = await fetchRegistryTokenRecords(requestRecords, REGISTRY_TOKEN_IDS.ETHX)
        ethxPrivate = totalRegistryTokenBalance(ethxRecs)
      } catch { /* ignore */ }
      try {
        btcxPublic = await getRegistryPublicBalance(address, REGISTRY_TOKEN_IDS.BTCX)
      } catch { /* ignore */ }
      try {
        ethxPublic = await getRegistryPublicBalance(address, REGISTRY_TOKEN_IDS.ETHX)
      } catch { /* ignore */ }

      setPrivateBalances({
        ALEO: Number(aleoPrivate) / 1e6,
        USDCx: Number(usdcxPrivate) / 1e6,
        BTCx: Number(btcxPrivate) / 1e6,
        ETHx: Number(ethxPrivate) / 1e6,
      })
      setPublicBalances({
        ALEO: Number(aleoPublic) / 1e6,
        USDCx: Number(usdcxPublic) / 1e6,
        BTCx: Number(btcxPublic) / 1e6,
        ETHx: Number(ethxPublic) / 1e6,
      })
      setBalances({
        ALEO: Number(aleoPrivate + aleoPublic) / 1e6,
        USDCx: Number(usdcxPrivate + usdcxPublic) / 1e6,
        BTCx: Number(btcxPrivate + btcxPublic) / 1e6,
        ETHx: Number(ethxPrivate + ethxPublic) / 1e6,
      })
    } catch (e) {
      console.error('[Wallet] Balance fetch failed:', e)
    } finally {
      setBalancesLoading(false)
    }
  }, [connected, address, requestRecords])

  // Auto-refresh balances when connected
  useEffect(() => {
    if (connected && address) {
      refreshBalances()
      const interval = setInterval(refreshBalances, 30_000)
      return () => clearInterval(interval)
    }
  }, [connected, address, refreshBalances])

  // Auto-register Record Scanner when wallet connects (if API key configured)
  useEffect(() => {
    if (!connected || !address) return
    if (!isScannerConfigured()) return
    // Try to get viewKey from Shield Wallet
    const tryRegister = async () => {
      try {
        const shield = (window as any).shield
        if (shield?.getViewKey) {
          const vk = await shield.getViewKey()
          if (vk) {
            await registerViewKey(typeof vk === 'string' ? vk : vk.to_string())
            return
          }
        }
        // Fallback: try wallet adapter's viewKey if exposed
        const adapter = (wallet as any)?.adapter
        if (adapter?.viewKey) {
          const vk = await adapter.viewKey()
          if (vk) {
            await registerViewKey(typeof vk === 'string' ? vk : vk.to_string())
          }
        }
      } catch (e) {
        console.warn('[Wallet] RecordScanner auto-register skipped:', e)
      }
    }
    tryRegister()
  }, [connected, address, wallet])

  // Listen for balance refresh events from swap/pool pages
  useEffect(() => {
    if (!connected) return
    const handler = () => setTimeout(refreshBalances, 3_000)
    window.addEventListener('privadex:balanceRefresh', handler)
    return () => window.removeEventListener('privadex:balanceRefresh', handler)
  }, [connected, refreshBalances])

  return (
    <WalletCtx.Provider value={{
      connected,
      connecting,
      address,
      walletName,
      walletIcon,
      connect,
      disconnect,
      balances,
      privateBalances,
      publicBalances,
      balancesLoading,
      shieldActive,
      toggleShield,
      refreshBalances,
      executeTransaction,
      requestRecords,
      transactionStatus,
      wallets: wallets || [],
      selectWallet,
      connectWallet,
      ensureShieldPrograms,
    }}>
      {children}
    </WalletCtx.Provider>
  )
}

// ─── Main Provider (wraps Aleo SDK + our context) ────────────────────────────
export function WalletProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(() => [new ShieldWalletAdapter()], [])

  return (
    <AleoWalletProvider
      wallets={wallets}
      network={Network.TESTNET}
      decryptPermission={DecryptPermission.AutoDecrypt}
      programs={REGISTERED_PROGRAMS}
      autoConnect={false}
      onError={(err) => console.error('[PrivaDEX Wallet]', err)}
    >
      <WalletModalProvider network={Network.TESTNET}>
        <WalletContextProvider>
          {children}
        </WalletContextProvider>
      </WalletModalProvider>
    </AleoWalletProvider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────
export function useWallet() {
  const ctx = useContext(WalletCtx)
  if (!ctx) throw new Error('useWallet must be used within WalletProvider')
  return ctx
}
