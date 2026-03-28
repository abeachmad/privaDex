/**
 * useFaucetMint — Hook for minting test tokens on Aleo testnet.
 * Mirrors MintTestTokens component from /privadex.
 */
import { useState, useCallback } from 'react'
import { useWallet } from '../context/WalletContext'
import {
  executeOnChain, getMappingValue, parseLeoInt,
  convertUsdcxToPrivate, convertRegistryTokenToPrivate,
  pollTransactionStatus, isShieldTempId,
} from '../lib/aleo'
import { PROGRAMS, REGISTRY_TOKEN_IDS } from '../lib/programs'
import { faucetMintPublic } from '../lib/faucetMint'

type MintAction = 'aleo' | 'usdcx' | 'btcx' | 'ethx' | 'convert' | 'convert-usdcx' | 'convert-btcx' | 'convert-ethx' | null
type ConvertDirection = 'public-to-private' | 'private-to-public'

export function useFaucetMint() {
  const { connected, address, executeTransaction: walletExecute, requestRecords, refreshBalances } = useWallet()
  const [loading, setLoading] = useState<MintAction>(null)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  // Mint 5 ALEO to private
  const mintAleo = useCallback(async () => {
    if (!connected || !walletExecute || !address) return
    setLoading('aleo'); reset()
    try {
      const amount = 5_000_000n
      const txId = await executeOnChain(walletExecute, 'credits.aleo', 'transfer_public_to_private', [address, `${amount}u64`], 1_500_000, false)
      setResult(`Converting 5 ALEO to private... TX: ${txId.slice(0, 20)}...`)
      window.dispatchEvent(new Event('privadex:balanceRefresh'))
    } catch (err: any) {
      setError(err?.message ?? 'ALEO conversion failed')
    } finally {
      setLoading(null)
    }
  }, [connected, walletExecute, address, reset])

  // Mint 10,000 USDCx
  const mintUsdcx = useCallback(async () => {
    if (!connected || !walletExecute || !address) return
    setLoading('usdcx'); reset()
    try {
      const amount = 10_000_000_000n
      const txId = await executeOnChain(walletExecute, PROGRAMS.USDCX, 'mint_public', [address, `${amount}u128`], 1_500_000, false)
      setResult(`USDCx minted! TX: ${txId.slice(0, 20)}...`)
      window.dispatchEvent(new Event('privadex:balanceRefresh'))
    } catch (err: any) {
      setError(err?.message ?? 'USDCx mint failed')
    } finally {
      setLoading(null)
    }
  }, [connected, walletExecute, address, reset])

  // Mint 1 BTCx (via faucet admin key → mint_public to user's public balance)
  const mintBtcx = useCallback(async () => {
    if (!connected || !address) return
    setLoading('btcx'); reset()
    try {
      const amount = 1_000_000n
      const txId = await faucetMintPublic(
        REGISTRY_TOKEN_IDS.BTCX,
        address,
        amount,
        (msg) => setResult(msg),
      )
      setResult(`BTCx minted (1 BTCx) to public balance! TX: ${txId.slice(0, 20)}...`)
      window.dispatchEvent(new Event('privadex:balanceRefresh'))
    } catch (err: any) {
      setError(err?.message ?? 'BTCx mint failed')
    } finally {
      setLoading(null)
    }
  }, [connected, address, reset])

  // Mint 10 ETHx (via faucet admin key → mint_public to user's public balance)
  const mintEthx = useCallback(async () => {
    if (!connected || !address) return
    setLoading('ethx'); reset()
    try {
      const amount = 10_000_000n
      const txId = await faucetMintPublic(
        REGISTRY_TOKEN_IDS.ETHX,
        address,
        amount,
        (msg) => setResult(msg),
      )
      setResult(`ETHx minted (10 ETHx) to public balance! TX: ${txId.slice(0, 20)}...`)
      window.dispatchEvent(new Event('privadex:balanceRefresh'))
    } catch (err: any) {
      setError(err?.message ?? 'ETHx mint failed')
    } finally {
      setLoading(null)
    }
  }, [connected, address, reset])

  // Convert public USDCx → private Token records
  const convertUsdcx = useCallback(async () => {
    if (!connected || !walletExecute || !address || !requestRecords) return
    setLoading('convert-usdcx'); reset()
    try {
      const val = await getMappingValue(PROGRAMS.USDCX, 'balances', address)
      if (!val) { setError('No public USDCx balance. Mint USDCx first.'); return }
      const publicBalance = parseLeoInt(val)
      if (publicBalance <= 0n) { setError('Public USDCx is 0. Mint USDCx first.'); return }
      await convertUsdcxToPrivate(walletExecute, requestRecords, address, publicBalance)
      setResult(`Converted ${(Number(publicBalance) / 1e6).toFixed(2)} USDCx to private!`)
      window.dispatchEvent(new Event('privadex:balanceRefresh'))
    } catch (err: any) {
      setError(err?.message ?? 'USDCx conversion failed')
    } finally {
      setLoading(null)
    }
  }, [connected, walletExecute, address, requestRecords, reset])

  // Convert public BTCx → private
  const convertBtcx = useCallback(async () => {
    if (!connected || !walletExecute || !address || !requestRecords) return
    setLoading('convert-btcx'); reset()
    try {
      const amount = 1_000_000n
      await convertRegistryTokenToPrivate(walletExecute, requestRecords, REGISTRY_TOKEN_IDS.BTCX, address, amount)
      setResult('Converted 1 BTCx to private!')
      window.dispatchEvent(new Event('privadex:balanceRefresh'))
    } catch (err: any) {
      setError(err?.message ?? 'BTCx conversion failed')
    } finally {
      setLoading(null)
    }
  }, [connected, walletExecute, address, requestRecords, reset])

  // Convert public ETHx → private
  const convertEthx = useCallback(async () => {
    if (!connected || !walletExecute || !address || !requestRecords) return
    setLoading('convert-ethx'); reset()
    try {
      const amount = 10_000_000n
      await convertRegistryTokenToPrivate(walletExecute, requestRecords, REGISTRY_TOKEN_IDS.ETHX, address, amount)
      setResult('Converted 10 ETHx to private!')
      window.dispatchEvent(new Event('privadex:balanceRefresh'))
    } catch (err: any) {
      setError(err?.message ?? 'ETHx conversion failed')
    } finally {
      setLoading(null)
    }
  }, [connected, walletExecute, address, requestRecords, reset])

  // Generic convert: any token, any direction, custom amount
  const convertToken = useCallback(async (symbol: string, amount: number, direction: ConvertDirection) => {
    if (!connected || !walletExecute || !address || !requestRecords) return
    const addr = address // narrow to string
    setLoading('convert'); reset()
    const amountBig = BigInt(Math.round(amount * 1e6))
    try {
      if (symbol === 'ALEO') {
        if (direction === 'public-to-private') {
          await executeOnChain(walletExecute, 'credits.aleo', 'transfer_public_to_private', [addr, `${amountBig}u64`], 1_500_000, false)
        } else {
          const { fetchRecordsRobust, getRecordCredits } = await import('../lib/aleo')
          const recs = await fetchRecordsRobust(requestRecords, 'credits.aleo')
          const rec = recs.find((r: any) => !r.spent && getRecordCredits(r) >= amountBig)
          if (!rec) throw new Error('No private ALEO record with sufficient balance.')
          const pt = rec.recordPlaintext || rec.plaintext
          await executeOnChain(walletExecute, 'credits.aleo', 'transfer_private_to_public', [pt, addr, `${amountBig}u64`], 1_500_000, false, [0])
        }
      } else if (symbol === 'USDCx') {
        if (direction === 'public-to-private') {
          await convertUsdcxToPrivate(walletExecute, requestRecords, addr, amountBig)
        } else {
          const { prepareUsdcxForTx } = await import('../lib/aleo')
          const { tokenRecord, merkleProofs } = await prepareUsdcxForTx(walletExecute, requestRecords, amountBig, addr)
          await executeOnChain(walletExecute, PROGRAMS.USDCX, 'transfer_private_to_public', [tokenRecord, merkleProofs, addr, `${amountBig}u128`], 1_500_000, false, [0])
        }
      } else {
        const regId = symbol === 'BTCx' ? REGISTRY_TOKEN_IDS.BTCX : REGISTRY_TOKEN_IDS.ETHX
        if (direction === 'public-to-private') {
          await convertRegistryTokenToPrivate(walletExecute, requestRecords, regId, addr, amountBig)
        } else {
          const { prepareRegistryTokenForTx } = await import('../lib/aleo')
          const tokenRec = await prepareRegistryTokenForTx(walletExecute, requestRecords, regId, amountBig, addr)
          await executeOnChain(walletExecute, PROGRAMS.TOKEN_REGISTRY, 'transfer_private_to_public', [tokenRec, regId, addr, `${amountBig}u128`], 1_500_000, false, [0])
        }
      }
      const dirLabel = direction === 'public-to-private' ? 'private' : 'public'
      setResult(`Converted ${amount} ${symbol} to ${dirLabel}!`)
      window.dispatchEvent(new Event('privadex:balanceRefresh'))
    } catch (err: any) {
      setError(err?.message ?? `${symbol} conversion failed`)
    } finally {
      setLoading(null)
    }
  }, [connected, walletExecute, address, requestRecords, reset])

  return {
    loading, result, error, reset,
    mintAleo, mintUsdcx, mintBtcx, mintEthx,
    convertUsdcx, convertBtcx, convertEthx,
    convertToken,
  }
}
