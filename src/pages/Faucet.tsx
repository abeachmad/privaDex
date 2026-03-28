import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Droplet, CheckCircle2, AlertCircle, Loader2, ShieldCheck, ArrowRight, ArrowLeftRight, ExternalLink, Lock, Globe } from 'lucide-react'
import TokenIcon from '../components/shared/TokenIcon'
import { useWallet } from '../context/WalletContext'
import { useFaucetMint } from '../hooks/useFaucetMint'
import { TOKEN_LIST } from '../data/tokens'

/** Maps token symbol → the mint function name returned by useFaucetMint */
const MINT_ACTION_MAP: Record<string, 'aleo' | 'usdcx' | 'btcx' | 'ethx'> = {
  ALEO: 'aleo',
  USDCx: 'usdcx',
  BTCx: 'btcx',
  ETHx: 'ethx',
}

const MINT_AMOUNTS: Record<string, string> = {
  ALEO: '5',
  USDCx: '10,000',
  BTCx: '1',
  ETHx: '10',
}


const CONVERT_ALL_TOKENS = ['ALEO', 'USDCx', 'BTCx', 'ETHx']

export default function Faucet() {
  const { connected, connect, privateBalances, publicBalances } = useWallet()
  const {
    loading,
    result,
    error: mintError,
    mintAleo,
    mintUsdcx,
    mintBtcx,
    mintEthx,
    convertToken,
  } = useFaucetMint()

  const mintFns: Record<string, () => Promise<void>> = {
    ALEO: mintAleo,
    USDCx: mintUsdcx,
    BTCx: mintBtcx,
    ETHx: mintEthx,
  }

  // Convert section state
  const [convertSymbol, setConvertSymbol] = useState('ALEO')
  const [convertDirection, setConvertDirection] = useState<'public-to-private' | 'private-to-public'>('public-to-private')
  const [convertAmount, setConvertAmount] = useState('')

  const sourceBalance = convertDirection === 'public-to-private'
    ? publicBalances[convertSymbol] || 0
    : privateBalances[convertSymbol] || 0

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0, 0, 1] }}
        className="text-center mb-10"
      >
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-glass-md border border-border mb-6">
          <Droplet size={24} className="text-cyan" />
        </div>
        <h1 className="font-display text-3xl text-text-primary mb-2">Testnet Faucet</h1>
        <p className="text-sm text-text-tertiary max-w-md mx-auto">
          Mint test tokens for trading on PrivaDEX. These tokens have no real value and
          are only usable on Aleo Testnet.
        </p>
      </motion.div>

      {/* Status banners */}
      <AnimatePresence mode="wait">
        {mintError && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
            className="mb-4"
          >
            <div className="flex items-start gap-2.5 bg-danger-muted border border-danger/20 rounded-xl p-4">
              <AlertCircle size={16} className="text-danger shrink-0 mt-0.5" />
              <p className="text-sm text-danger leading-relaxed break-all">{mintError}</p>
            </div>
          </motion.div>
        )}

        {result && !mintError && (
          <motion.div
            key="success"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
            className="mb-4"
          >
            <div className="flex items-start gap-2.5 bg-emerald-ghost border border-emerald/20 rounded-xl p-4">
              <CheckCircle2 size={16} className="text-emerald shrink-0 mt-0.5" />
              <p className="text-sm text-emerald leading-relaxed font-mono break-all">{result}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Token mint cards */}
      <div className="space-y-4">
        {TOKEN_LIST.map((token, i) => {
          const actionKey = MINT_ACTION_MAP[token.symbol]
          const isLoading = loading === actionKey
          const isAnyLoading = loading !== null
          const isAleo = token.symbol === 'ALEO'
          const isUsdcx = token.symbol === 'USDCx'
          const isExternalFaucet = isAleo || isUsdcx

          return (
            <motion.div
              key={token.symbol}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4, ease: [0.2, 0, 0, 1] }}
            >
              <div className="flex items-center justify-between p-5 rounded-2xl border border-border bg-glass hover:border-border-md transition-all duration-300">
                <div className="flex items-center gap-4">
                  <TokenIcon symbol={token.symbol} size="lg" />
                  <div>
                    <div className="text-base font-medium text-text-primary">{token.symbol}</div>
                    <div className="text-xs text-text-tertiary">{token.name}</div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {!isExternalFaucet && (
                    <div className="text-right hidden sm:block">
                      <div className="font-mono text-sm text-text-primary tabular-nums">
                        {MINT_AMOUNTS[token.symbol]}
                      </div>
                      <div className="text-[10px] text-text-ghost font-mono">per mint</div>
                    </div>
                  )}

                  {isExternalFaucet ? (
                    <a
                      href={isAleo ? 'https://faucet.aleo.org/' : 'https://faucet.circle.com/'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald text-obsidian hover:bg-emerald/90 transition-colors press-scale"
                    >
                      {isAleo ? 'Get ALEO' : 'Get USDCx'}
                      <ExternalLink size={13} />
                    </a>
                  ) : !connected ? (
                    <button
                      onClick={connect}
                      className="px-5 py-2.5 rounded-xl border border-border text-sm text-text-secondary hover:text-text-primary hover:border-border-md transition-all press-scale"
                    >
                      Connect
                    </button>
                  ) : isLoading ? (
                    <button
                      disabled
                      className="px-5 py-2.5 rounded-xl bg-glass border border-border text-sm text-text-tertiary flex items-center gap-2"
                    >
                      <Loader2 size={14} className="animate-spin" />
                      Minting…
                    </button>
                  ) : (
                    <button
                      disabled={isAnyLoading}
                      onClick={() => mintFns[token.symbol]?.()}
                      className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors press-scale ${
                        isAnyLoading
                          ? 'bg-glass border border-border text-text-ghost cursor-not-allowed'
                          : 'bg-emerald text-obsidian hover:bg-emerald/90'
                      }`}
                    >
                      Mint
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* ─── Convert Balance ─── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5, ease: [0.2, 0, 0, 1] }}
        className="mt-10"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-glass-md border border-border">
            <ArrowLeftRight size={16} className="text-emerald" />
          </div>
          <div>
            <h2 className="text-base font-medium text-text-primary">Convert Balance</h2>
            <p className="text-xs text-text-tertiary">
              Convert between public and private balances
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border-md bg-carbon shadow-deep overflow-hidden">
          {/* Direction toggle */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setConvertDirection('public-to-private')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-all ${
                convertDirection === 'public-to-private'
                  ? 'bg-emerald-ghost text-emerald border-b-2 border-emerald'
                  : 'text-text-tertiary hover:text-text-primary'
              }`}
            >
              <Globe size={12} />
              Public
              <ArrowRight size={10} />
              <Lock size={12} />
              Private
            </button>
            <button
              onClick={() => setConvertDirection('private-to-public')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-medium transition-all ${
                convertDirection === 'private-to-public'
                  ? 'bg-cyan/5 text-cyan border-b-2 border-cyan'
                  : 'text-text-tertiary hover:text-text-primary'
              }`}
            >
              <Lock size={12} />
              Private
              <ArrowRight size={10} />
              <Globe size={12} />
              Public
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Token selector */}
            <div>
              <div className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider mb-2">Token</div>
              <div className="flex gap-2">
                {CONVERT_ALL_TOKENS.map(sym => (
                  <button
                    key={sym}
                    onClick={() => { setConvertSymbol(sym); setConvertAmount(''); }}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all press-scale ${
                      convertSymbol === sym
                        ? 'border-emerald/30 bg-emerald-ghost text-emerald'
                        : 'border-border bg-glass text-text-secondary hover:text-text-primary hover:border-border-md'
                    }`}
                  >
                    <TokenIcon symbol={sym} size="sm" />
                    {sym}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount input */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider">Amount</span>
                {connected && (
                  <button
                    onClick={() => setConvertAmount(String(sourceBalance))}
                    className="text-[10px] font-mono text-text-tertiary hover:text-emerald transition-colors"
                  >
                    {convertDirection === 'public-to-private' ? 'Public' : 'Private'}: {sourceBalance.toFixed(4)}
                    <span className="text-emerald ml-1">MAX</span>
                  </button>
                )}
              </div>
              <div className="p-4 rounded-xl border border-border bg-glass">
                <input
                  type="text"
                  value={convertAmount}
                  onChange={e => setConvertAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={loading !== null}
                  className="w-full bg-transparent text-xl font-mono text-text-primary outline-none placeholder:text-text-ghost disabled:opacity-50"
                />
              </div>
            </div>

            {/* Info */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-glass border border-border">
              {convertDirection === 'public-to-private' ? (
                <>
                  <Lock size={12} className="text-emerald shrink-0" />
                  <span className="text-[11px] text-text-tertiary">
                    Tokens will be shielded into private records for use in swaps and liquidity
                  </span>
                </>
              ) : (
                <>
                  <Globe size={12} className="text-cyan shrink-0" />
                  <span className="text-[11px] text-text-tertiary">
                    Private records will be converted to public balance visible on-chain
                  </span>
                </>
              )}
            </div>

            {/* Convert button */}
            {!connected ? (
              <button
                onClick={connect}
                className="w-full py-3 rounded-xl bg-emerald text-obsidian font-semibold text-sm press-scale"
              >
                Connect Wallet
              </button>
            ) : loading === 'convert' ? (
              <button
                disabled
                className="w-full py-3 rounded-xl bg-glass border border-border text-text-tertiary text-sm flex items-center justify-center gap-2"
              >
                <Loader2 size={14} className="animate-spin" />
                Converting…
              </button>
            ) : (
              <button
                disabled={loading !== null || !convertAmount || Number(convertAmount) <= 0}
                onClick={() => convertToken(convertSymbol, Number(convertAmount), convertDirection)}
                className="w-full py-3 rounded-xl bg-emerald text-obsidian font-semibold text-sm hover:bg-emerald/90 transition-colors press-scale disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Convert {convertAmount || '0'} {convertSymbol} to {convertDirection === 'public-to-private' ? 'Private' : 'Public'}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Info */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.5 }}
        className="mt-8 p-5 rounded-2xl border border-border bg-glass"
      >
        <div className="text-xs font-mono text-text-tertiary uppercase tracking-wider mb-3">About the Faucet</div>
        <div className="space-y-3 text-sm text-text-secondary leading-relaxed">
          <p className="text-pretty">
            The faucet distributes test tokens on Aleo's testnet. These assets can be used to
            swap, provide liquidity, and place orders on PrivaDEX.
          </p>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {[
              { label: 'Network', value: 'Aleo Testnet' },
              { label: 'Rate Limit', value: 'Once per hour' },
              { label: 'Token Type', value: 'Synthetic / Test' },
              { label: 'Value', value: 'None (testnet only)' },
            ].map(item => (
              <div key={item.label}>
                <div className="text-[10px] font-mono text-text-ghost uppercase">{item.label}</div>
                <div className="text-xs text-text-primary font-mono">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
