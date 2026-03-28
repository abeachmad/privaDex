// ═══════════════════════════════════════════════════════════════
// PRIVADEX — Token & Trading Data
// ═══════════════════════════════════════════════════════════════

import aleoLogo from '../assets/tokens/aleo-logo.png'
import usdcxLogo from '../assets/tokens/usdcx-logo.png'
import bitcoinLogo from '../assets/tokens/bitcoin-logo.png'
import ethLogo from '../assets/tokens/eth-logo.jpeg'

export interface Token {
  symbol: string
  name: string
  icon: string
  color: string
  decimals: number
}

export const TOKENS: Record<string, Token> = {
  ALEO: {
    symbol: 'ALEO',
    name: 'Aleo',
    icon: aleoLogo,
    color: '#2dd4a0',
    decimals: 6,
  },
  USDCx: {
    symbol: 'USDCx',
    name: 'USD Coin (Test)',
    icon: usdcxLogo,
    color: '#67e8f9',
    decimals: 6,
  },
  BTCx: {
    symbol: 'BTCx',
    name: 'Bitcoin (Synthetic)',
    icon: bitcoinLogo,
    color: '#f7931a',
    decimals: 8,
  },
  ETHx: {
    symbol: 'ETHx',
    name: 'Ethereum (Synthetic)',
    icon: ethLogo,
    color: '#627eea',
    decimals: 18,
  },
}

export const TOKEN_LIST = Object.values(TOKENS)

export interface Pool {
  id: string
  tokenA: string
  tokenB: string
  tvl: number
  volume24h: number
  apr: number
  fee: number
  reserveA: number
  reserveB: number
}

export const POOLS: Pool[] = [
  { id: 'aleo-usdcx', tokenA: 'ALEO', tokenB: 'USDCx', tvl: 2_450_000, volume24h: 890_000, apr: 24.5, fee: 0.3, reserveA: 1_250_000, reserveB: 1_200_000 },
  { id: 'btcx-usdcx', tokenA: 'BTCx', tokenB: 'USDCx', tvl: 4_120_000, volume24h: 1_560_000, apr: 18.2, fee: 0.3, reserveA: 62, reserveB: 2_060_000 },
  { id: 'ethx-usdcx', tokenA: 'ETHx', tokenB: 'USDCx', tvl: 3_280_000, volume24h: 1_120_000, apr: 21.7, fee: 0.3, reserveA: 940, reserveB: 1_640_000 },
  { id: 'aleo-btcx', tokenA: 'ALEO', tokenB: 'BTCx', tvl: 1_680_000, volume24h: 420_000, apr: 31.4, fee: 0.3, reserveA: 840_000, reserveB: 25.4 },
  { id: 'aleo-ethx', tokenA: 'ALEO', tokenB: 'ETHx', tvl: 1_950_000, volume24h: 580_000, apr: 28.9, fee: 0.3, reserveA: 975_000, reserveB: 560 },
  { id: 'btcx-ethx', tokenA: 'BTCx', tokenB: 'ETHx', tvl: 2_890_000, volume24h: 780_000, apr: 15.8, fee: 0.3, reserveA: 43.5, reserveB: 830 },
]

export type Venue = 'amm' | 'darkpool' | 'orderbook'

export interface RouteResult {
  venue: Venue
  label: string
  price: number
  slippage: number
  speed: string
  privacyLevel: 'full' | 'high' | 'standard'
  estimatedOutput: number
  recommended: boolean
}

export interface DarkOrder {
  id: string
  pair: string
  side: 'buy' | 'sell'
  amount: number
  status: 'pending' | 'settled' | 'claimable' | 'cancelled'
  epoch: number
  settledPrice?: number
  settledAmount?: number
  timestamp: number
}

export interface LimitOrder {
  id: string
  pair: string
  side: 'buy' | 'sell'
  amount: number
  price: number
  filled: number
  status: 'active' | 'partial' | 'filled' | 'cancelled'
  timestamp: number
}

export interface LPPosition {
  poolId: string
  tokenA: string
  tokenB: string
  sharePercent: number
  valueUsd: number
  earnedFees: number
  tokenAAmount: number
  tokenBAmount: number
}

// Mock wallet balances
export const MOCK_BALANCES: Record<string, number> = {
  ALEO: 12_500,
  USDCx: 8_750,
  BTCx: 0.45,
  ETHx: 3.2,
}

// Mock LP positions
export const MOCK_LP_POSITIONS: LPPosition[] = [
  { poolId: 'aleo-usdcx', tokenA: 'ALEO', tokenB: 'USDCx', sharePercent: 0.42, valueUsd: 10_290, earnedFees: 127.50, tokenAAmount: 5_250, tokenBAmount: 5_040 },
  { poolId: 'ethx-usdcx', tokenA: 'ETHx', tokenB: 'USDCx', sharePercent: 0.18, valueUsd: 5_904, earnedFees: 68.20, tokenAAmount: 1.692, tokenBAmount: 2_952 },
]

// Mock dark orders
export const MOCK_DARK_ORDERS: DarkOrder[] = [
  { id: 'dk-001', pair: 'ALEO/USDCx', side: 'buy', amount: 5000, status: 'pending', epoch: 847, timestamp: Date.now() - 1800_000 },
  { id: 'dk-002', pair: 'ALEO/USDCx', side: 'sell', amount: 2000, status: 'claimable', epoch: 846, settledPrice: 0.98, settledAmount: 1960, timestamp: Date.now() - 7200_000 },
  { id: 'dk-003', pair: 'ALEO/USDCx', side: 'buy', amount: 10000, status: 'settled', epoch: 845, settledPrice: 0.96, settledAmount: 10416.67, timestamp: Date.now() - 14400_000 },
]

// Mock limit orders
export const MOCK_LIMIT_ORDERS: LimitOrder[] = [
  { id: 'lo-001', pair: 'ALEO/USDCx', side: 'buy', amount: 3000, price: 0.92, filled: 0, status: 'active', timestamp: Date.now() - 3600_000 },
  { id: 'lo-002', pair: 'ALEO/USDCx', side: 'sell', amount: 5000, price: 1.10, filled: 2100, status: 'partial', timestamp: Date.now() - 10800_000 },
  { id: 'lo-003', pair: 'ALEO/USDCx', side: 'buy', amount: 1500, price: 0.88, filled: 1500, status: 'filled', timestamp: Date.now() - 21600_000 },
]

// Analytics data
export const ANALYTICS_TVL_DATA = [
  { date: 'Mar 1', tvl: 12.4 },
  { date: 'Mar 3', tvl: 13.1 },
  { date: 'Mar 5', tvl: 12.8 },
  { date: 'Mar 7', tvl: 14.2 },
  { date: 'Mar 9', tvl: 15.1 },
  { date: 'Mar 11', tvl: 14.8 },
  { date: 'Mar 13', tvl: 15.9 },
  { date: 'Mar 15', tvl: 16.2 },
  { date: 'Mar 17', tvl: 16.8 },
  { date: 'Mar 19', tvl: 16.4 },
  { date: 'Mar 21', tvl: 17.1 },
  { date: 'Mar 23', tvl: 16.5 },
  { date: 'Mar 24', tvl: 16.37 },
]

export const ANALYTICS_VOLUME_DATA = [
  { date: 'Mar 1', volume: 3.2 },
  { date: 'Mar 3', volume: 4.1 },
  { date: 'Mar 5', volume: 3.8 },
  { date: 'Mar 7', volume: 5.2 },
  { date: 'Mar 9', volume: 4.9 },
  { date: 'Mar 11', volume: 5.5 },
  { date: 'Mar 13', volume: 6.1 },
  { date: 'Mar 15', volume: 5.8 },
  { date: 'Mar 17', volume: 6.4 },
  { date: 'Mar 19', volume: 5.9 },
  { date: 'Mar 21', volume: 7.2 },
  { date: 'Mar 23', volume: 6.8 },
  { date: 'Mar 24', volume: 5.35 },
]

export const VENUE_DISTRIBUTION = [
  { venue: 'Shielded AMM', share: 58, color: '#2dd4a0' },
  { venue: 'Dark Pool', share: 27, color: '#67e8f9' },
  { venue: 'Order Book', share: 15, color: '#d4a853' },
]

// Utility
export function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/** Smart format: auto-increases decimals for small values so they don't show as 0.00 */
export function formatAmount(value: number): string {
  if (value === 0) return '0.00'
  const abs = Math.abs(value)
  if (abs >= 1) return formatNumber(value, 2)
  if (abs >= 0.01) return formatNumber(value, 4)
  if (abs >= 0.0001) return formatNumber(value, 6)
  return formatNumber(value, 8)
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}
