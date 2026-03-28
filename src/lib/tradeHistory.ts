/**
 * Client-side trade history stored in localStorage.
 * Tracks completed swaps, dark pool fills, and liquidity operations.
 * Privacy-preserving: all data stays local to the user's browser.
 */

const STORAGE_PREFIX = "privadex_trade_history";
const MAX_ENTRIES = 50;

export type TradeType = "Swap" | "Dark Pool" | "Add Liquidity" | "Remove Liquidity" | "Limit Order";
export type TradeSide = "BUY" | "SELL";

export interface TradeEntry {
  id: string;
  timestamp: number;
  type: TradeType;
  pair: string;
  side: TradeSide;
  amountIn: string;   // human-readable, e.g. "10 ALEO"
  amountOut: string;   // human-readable, e.g. "0.63 USDCx"
  txId: string;
  venue: string;       // "AMM" | "Dark Pool" | "Order Book"
}

function storageKey(address: string): string {
  return `${STORAGE_PREFIX}_${address}`;
}

function getEntries(address: string): TradeEntry[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey(address)) || "[]");
  } catch {
    return [];
  }
}

function setEntries(address: string, entries: TradeEntry[]) {
  localStorage.setItem(storageKey(address), JSON.stringify(entries));
}

/** Add a completed trade to history (scoped to wallet address) */
export function addTradeEntry(address: string, entry: Omit<TradeEntry, "id" | "timestamp">) {
  if (!address) return;
  const entries = getEntries(address);
  const newEntry: TradeEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
  };
  entries.unshift(newEntry); // newest first
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  setEntries(address, entries);
}

/** Get all trade history entries for a specific wallet (newest first) */
export function getTradeHistory(address: string): TradeEntry[] {
  if (!address) return [];
  return getEntries(address);
}

/** Clear trade history for a specific wallet */
export function clearTradeHistory(address: string) {
  if (!address) return;
  localStorage.removeItem(storageKey(address));
}

// ─── Pool Volume Tracker (global, not per-address) ──────────────────────────
// Records swap volume per pool pair in localStorage.
// Used to display 24h volume on Pool and Analytics pages since
// Aleo on-chain mappings do not store historical volume data.

const VOLUME_KEY = "privadex_pool_volume";

interface VolumeEntry {
  pool: string;    // e.g. "aleo-usdcx"
  usdValue: number;
  timestamp: number;
}

function getVolumeEntries(): VolumeEntry[] {
  try {
    return JSON.parse(localStorage.getItem(VOLUME_KEY) || "[]");
  } catch {
    return [];
  }
}

/** Record a swap's USD volume for a pool */
export function recordSwapVolume(poolId: string, usdValue: number) {
  if (!poolId || usdValue <= 0) return;
  const entries = getVolumeEntries();
  entries.push({ pool: poolId, usdValue, timestamp: Date.now() });
  // Keep only last 7 days of entries
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const filtered = entries.filter(e => e.timestamp > cutoff);
  localStorage.setItem(VOLUME_KEY, JSON.stringify(filtered));
}

/** Get 24h volume per pool (returns map of poolId → USD volume) */
export function get24hVolume(): Record<string, number> {
  const entries = getVolumeEntries();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const result: Record<string, number> = {};
  for (const e of entries) {
    if (e.timestamp > cutoff) {
      result[e.pool] = (result[e.pool] || 0) + e.usdValue;
    }
  }
  return result;
}

/** Get total 24h volume across all pools */
export function getTotal24hVolume(): number {
  const volumes = get24hVolume();
  return Object.values(volumes).reduce((sum, v) => sum + v, 0);
}
