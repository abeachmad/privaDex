
// Aleo on-chain interaction helpers using Shield Wallet SDK
import { markRecordSpent, isRecordManuallySpent } from "./spentRecords";
import { getCachedRecords } from "./recordCache";
import { PROGRAMS, REGISTRY_TOKEN_IDS, USDCX_FNS, EMPTY_MERKLE_PROOFS, POOL_IDS } from "./programs";
import { isScannerReady, fetchRecordsFromScanner } from "./recordScanner";

// ─── Config (from env) ───────────────────────────────────────────────────────
const RPC_URL = import.meta.env.VITE_RPC_URL || "https://api.explorer.provable.com/v1";
const NETWORK = import.meta.env.VITE_NETWORK || "testnet";
const API_BASE = `${RPC_URL}/${NETWORK}`;
let sdkPromise: Promise<typeof import("@provablehq/sdk")> | null = null;
let sdkReadyPromise: Promise<typeof import("@provablehq/sdk")> | null = null;

async function getProvableSdk() {
  if (!sdkPromise) {
    sdkPromise = import("@provablehq/sdk");
  }
  return sdkPromise;
}

async function getReadyProvableSdk() {
  if (!sdkReadyPromise) {
    sdkReadyPromise = (async () => {
      const sdk = await getProvableSdk();
      await sdk.initializeWasm();
      return sdk;
    })();
  }
  return sdkReadyPromise;
}

interface TransactionOptions {
  program: string;
  function: string;
  inputs: string[];
  fee?: number;
  privateFee?: boolean;
  recordIndices?: number[];
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type TxStatus = "pending" | "accepted" | "rejected" | "finalized";

export interface TxResult {
  txId: string;
  status: TxStatus;
}

export interface AleoRecord {
  id:       string;
  program:  string;
  type:     string;
  owner:    string;
  data:     Record<string, string>;
  spent:    boolean;
}

interface RecordFetchOptions {
  preferScanner?: boolean;
  skipCache?: boolean;
  cacheMaxAgeMs?: number;
  scannerRecordName?: string;
}

// ─── Execute a program transition ─────────────────────────────────────────────
/**
 * Calls `executeTransaction` on the connected Shield Wallet.
 * Returns the transaction ID (pending until finalized on-chain).
 *
 * @param walletExecute  - executeTransaction from useWallet()
 * @param program        - e.g. "privadex_amm_v10.aleo"
 * @param functionName   - e.g. "swap_a_for_b"
 * @param inputs         - Leo-typed string array, e.g. ["<record>", "0u64", "100u128"]
 * @param fee            - fee in microcredits (default 300_000 = 0.3 ALEO)
 * @param privateFee     - use private fee record (default false)
 */
export async function executeOnChain(
  walletExecute: (tx: TransactionOptions) => Promise<{ transactionId: string } | undefined>,
  program: string,
  functionName: string,
  inputs: string[],
  fee = 1_500_000,
  privateFee = false,
  recordIndices?: number[],
): Promise<string> {
  const tx: TransactionOptions = {
    program,
    function: functionName,
    inputs,
    fee,
    privateFee,
    ...(recordIndices && { recordIndices }),
  };
  console.log("[executeOnChain] TX:", JSON.stringify({ program, function: functionName, inputCount: inputs.length, fee, privateFee, recordIndices }));
  console.log("[executeOnChain] Inputs:", inputs.map((inp, i) => `[${i}] ${inp.substring(0, 100)}${inp.length > 100 ? '...' : ''}`));

  // Retry logic: Shield Wallet sometimes fails to fetch imported programs
  // (e.g. test_usdcx_multisig_core.aleo) due to transient network issues.
  // Retry up to 3 times with increasing delay.
  const MAX_RETRIES = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await walletExecute(tx);
      console.log("[executeOnChain] Result:", JSON.stringify(result));
      if (!result?.transactionId) throw new Error("Transaction failed — no transaction ID returned.");
      return result.transactionId;
    } catch (e: any) {
      const rawMessage = e?.message || e?.toString() || "Wallet rejected the transaction";
      const lowerMessage = String(rawMessage).toLowerCase();
      const isNetworkError = (
        lowerMessage.includes("failed to fetch") ||
        lowerMessage.includes("error finding") ||
        lowerMessage.includes("network error") ||
        lowerMessage.includes("load failed") ||
        lowerMessage.includes("imported program")
      );

      if (isNetworkError && attempt < MAX_RETRIES - 1) {
        const delay = (attempt + 1) * 3_000; // 3s, 6s
        console.warn(`[executeOnChain] Network error on attempt ${attempt + 1}/${MAX_RETRIES}, retrying in ${delay / 1000}s...`, rawMessage.substring(0, 200));
        await sleep(delay);
        lastError = new Error(rawMessage);
        continue;
      }

      console.error("[executeOnChain] walletExecute threw:", e);
      console.error("[executeOnChain] Error details:", { name: e?.name, code: e?.code, message: e?.message, stack: e?.stack?.substring(0, 300) });

      if (isNetworkError) {
        throw new Error(
          `Shield Wallet gagal memuat program dari network setelah ${MAX_RETRIES} percobaan. ` +
          `Coba: 1) Disconnect & reconnect wallet, 2) Refresh halaman, 3) Coba lagi nanti. ` +
          `Detail: ${rawMessage.substring(0, 200)}`,
        );
      }
      throw new Error(rawMessage);
    }
  }

  throw lastError || new Error("Transaction failed after retries.");
}

// ─── Poll transaction status ───────────────────────────────────────────────────
/**
 * Check if a transaction ID is a Shield Wallet temporary ID (not a real on-chain tx).
 * Real Aleo tx IDs start with "at1". Anything else is a wallet-internal temp ID.
 */
export function isShieldTempId(txId: string): boolean {
  return !txId.startsWith("at1");
}

function normalizeWalletTransactionStatus(result: any): TxStatus | null {
  const rawStatus = typeof result === "string" ? result : result?.status;
  if (typeof rawStatus !== "string") return null;

  switch (rawStatus.trim().toLowerCase()) {
    case "accepted":
      return "accepted";
    case "finalized":
      return "finalized";
    case "rejected":
    case "failed":
      return "rejected";
    case "pending":
      return "pending";
    default:
      return null;
  }
}

function extractWalletTransactionId(result: any): string | null {
  const candidates = [
    result?.transactionId,
    result?.transaction_id,
    result?.transaction?.id,
    result?.data?.transactionId,
    result?.data?.transaction_id,
  ];

  return candidates.find((candidate): candidate is string => typeof candidate === "string" && candidate.length > 0) ?? null;
}

export function extractWalletTransactionError(result: any): string | null {
  const directCandidates = [
    result?.error,
    result?.reason,
    result?.message,
    result?.details,
    result?.status_message,
    result?.data?.error,
    result?.data?.reason,
    result?.data?.message,
    result?.transaction?.error,
    result?.transaction?.reason,
    result?.transaction?.message,
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  try {
    const serialized = JSON.stringify(result);
    if (serialized && serialized !== "{}") {
      return serialized;
    }
  } catch {
    // ignore JSON serialization failure
  }

  return null;
}

async function pollOnChainTransactionStatus(
  txId: string,
  start: number,
  onStatusChange?: (status: TxStatus) => void,
  intervalMs = 3_000,
  maxWaitMs = 120_000,
): Promise<TxStatus> {
  while (Date.now() - start < maxWaitMs) {
    await sleep(intervalMs);
    try {
      const res = await fetch(`${API_BASE}/transaction/${txId}`);
      if (res.status === 404) continue;
      if (!res.ok) continue;

      const body = (await res.text()).toLowerCase();
      if (body.includes("rejected")) {
        console.warn(`[pollTxStatus] Transaction ${txId} was REJECTED on-chain`);
        onStatusChange?.("rejected");
        return "rejected";
      }

      onStatusChange?.("finalized");
      return "finalized";
    } catch {
      // network hiccup — keep polling
    }
  }

  return "pending";
}

/**
 * Polls the Aleo testnet REST API until the transaction is finalized or rejected.
 * For Shield Wallet temporary IDs, uses the wallet's transactionStatus API.
 * Times out after `maxWaitMs` (default 120s).
 */
export async function pollTransactionStatus(
  txId: string,
  onStatusChange?: (status: TxStatus) => void,
  intervalMs = 3_000,
  maxWaitMs  = 120_000,
  walletTransactionStatus?: (txId: string) => Promise<any>,
): Promise<TxStatus> {
  const start = Date.now();

  // Shield Wallet returns temporary IDs — use wallet API if available, otherwise treat as submitted
  if (isShieldTempId(txId)) {
    if (!walletTransactionStatus) {
      onStatusChange?.("pending");
      return "pending";
    }
    let lastKnownStatus: TxStatus = "pending";
    while (Date.now() - start < maxWaitMs) {
      await sleep(intervalMs);
      try {
        const result = await walletTransactionStatus(txId);
        console.log(`[pollTxStatus] Shield wallet status for ${txId}:`, JSON.stringify(result));
        const status = normalizeWalletTransactionStatus(result) ?? "pending";
        const realTxId = extractWalletTransactionId(result);

        lastKnownStatus = status;
        onStatusChange?.(status);

        if (status === "accepted" && realTxId && !isShieldTempId(realTxId)) {
          console.log(`[pollTxStatus] Switching from Shield temp ID ${txId} to on-chain tx ID ${realTxId}`);
          return pollOnChainTransactionStatus(realTxId, start, onStatusChange, intervalMs, maxWaitMs);
        }

        if (status === "finalized" || status === "rejected") {
          if (realTxId && !isShieldTempId(realTxId)) {
            console.log(`[pollTxStatus] Real on-chain tx ID: ${realTxId}`);
            // Fetch the actual tx to see rejection reason
            try {
              const txRes = await fetch(`${API_BASE}/transaction/${realTxId}`);
              if (txRes.ok) {
                const txBody = await txRes.text();
                console.log(`[pollTxStatus] On-chain tx body (first 500):`, txBody.substring(0, 500));
              }
            } catch { /* ignore */ }
          }
          return status;
        }
      } catch (e) {
        console.warn(`[pollTxStatus] walletTransactionStatus error:`, e);
      }
    }
    return lastKnownStatus;
  }

  return pollOnChainTransactionStatus(txId, start, onStatusChange, intervalMs, maxWaitMs);
}

export async function resolveOnChainTransactionId(
  txId: string,
  walletTransactionStatus?: (txId: string) => Promise<any>,
): Promise<string | null> {
  if (!isShieldTempId(txId)) return txId;
  if (!walletTransactionStatus) return null;
  try {
    const result = await walletTransactionStatus(txId);
    return extractWalletTransactionId(result);
  } catch {
    return null;
  }
}

export async function fetchTransactionBody(txId: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/transaction/${txId}`);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ─── Fetch public mapping value ────────────────────────────────────────────────
/**
 * Reads a public mapping value from the Aleo testnet REST API.
 * Returns null if the key does not exist.
 */
export async function getMappingValue(
  program: string,
  mapping: string,
  key: string,
): Promise<string | null> {
  const base = API_BASE;
  try {
    const res  = await fetch(`${base}/program/${program}/mapping/${mapping}/${encodeURIComponent(key)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const cleaned = text.replace(/"/g, "").trim();
    if (!cleaned || cleaned === "null") return null;
    return cleaned;
  } catch {
    return null;
  }
}

async function getMappingValueDetailed(
  program: string,
  mapping: string,
  key: string,
): Promise<{ value: string | null; reachable: boolean }> {
  const base = API_BASE;
  try {
    const res = await fetch(`${base}/program/${program}/mapping/${mapping}/${encodeURIComponent(key)}`);
    if (res.status === 404) return { value: null, reachable: true };
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const cleaned = text.replace(/"/g, "").trim();
    if (!cleaned || cleaned === "null") return { value: null, reachable: true };
    return { value: cleaned, reachable: true };
  } catch {
    return { value: null, reachable: false };
  }
}

// ─── AMM pool reserves ────────────────────────────────────────────────────────
export interface PoolReserves {
  reserveA:    bigint;
  reserveB:    bigint;
  totalShares: bigint;
  feesBps:     number;
}

export interface PoolMetrics {
  cumulativeVolumeA: bigint;
  cumulativeVolumeB: bigint;
  cumulativeFeeA: bigint;
  cumulativeFeeB: bigint;
  lastSwapBlock: number | null;
  available: boolean;
  reachable: boolean;
}

export async function fetchPoolReserves(poolId: number, ammProgram?: string): Promise<PoolReserves> {
  const program = ammProgram || import.meta.env.VITE_PROGRAM_AMM || "privadex_amm_v10.aleo";
  const key     = `${poolId}u64`;

  const [ra, rb, ts, fb] = await Promise.all([
    getMappingValue(program, "reserve_a",    key),
    getMappingValue(program, "reserve_b",    key),
    getMappingValue(program, "total_shares", key),
    getMappingValue(program, "fee_bps",      key),
  ]);

  return {
    reserveA:    parseLeoInt(ra ?? "0u128"),
    reserveB:    parseLeoInt(rb ?? "0u128"),
    totalShares: parseLeoInt(ts ?? "0u128"),
    feesBps:     Number(parseLeoInt(fb ?? "30u64")),
  };
}

export async function fetchPoolReservesStrict(poolId: number, ammProgram?: string): Promise<PoolReserves> {
  const program = ammProgram || import.meta.env.VITE_PROGRAM_AMM || "privadex_amm_v10.aleo";
  const key = `${poolId}u64`;

  const [ra, rb, ts, fb] = await Promise.all([
    getMappingValueDetailed(program, "reserve_a", key),
    getMappingValueDetailed(program, "reserve_b", key),
    getMappingValueDetailed(program, "total_shares", key),
    getMappingValueDetailed(program, "fee_bps", key),
  ]);

  if (![ra, rb, ts, fb].every((result) => result.reachable)) {
    throw new Error(`Failed to fetch live pool state for ${program} (${key}). Check RPC connectivity and try again.`);
  }

  return {
    reserveA: parseLeoInt(ra.value ?? "0u128"),
    reserveB: parseLeoInt(rb.value ?? "0u128"),
    totalShares: parseLeoInt(ts.value ?? "0u128"),
    feesBps: Number(parseLeoInt(fb.value ?? "30u64")),
  };
}

export async function fetchPoolMetrics(poolId: number, ammProgram?: string): Promise<PoolMetrics> {
  const program = ammProgram || import.meta.env.VITE_PROGRAM_AMM || "privadex_amm_v10.aleo";
  const key = `${poolId}u64`;

  const [va, vb, fa, fb, lb] = await Promise.all([
    getMappingValueDetailed(program, "cumulative_volume_a", key),
    getMappingValueDetailed(program, "cumulative_volume_b", key),
    getMappingValueDetailed(program, "cumulative_fee_a", key),
    getMappingValueDetailed(program, "cumulative_fee_b", key),
    getMappingValueDetailed(program, "last_swap_block", key),
  ]);

  const reachable = [va, vb, fa, fb, lb].every((result) => result.reachable);
  const available = [va, vb, fa, fb, lb].some((result) => result.value !== null);

  return {
    cumulativeVolumeA: parseLeoInt(va.value ?? "0u128"),
    cumulativeVolumeB: parseLeoInt(vb.value ?? "0u128"),
    cumulativeFeeA: parseLeoInt(fa.value ?? "0u128"),
    cumulativeFeeB: parseLeoInt(fb.value ?? "0u128"),
    lastSwapBlock: lb.value ? Number(parseLeoInt(lb.value)) : null,
    available,
    reachable,
  };
}

// ─── Dark pool epoch state ────────────────────────────────────────────────────
export interface EpochState {
  buyVolume:  bigint;
  sellVolume: bigint;
  closed:     boolean;
  midPrice:   bigint;
  feeBps:     number;
  matchedBuy: bigint;
  matchedSell: bigint;
  intentCount: number;
}

export interface DarkPoolInitializationState {
  initialized: boolean;
  reachable: boolean;
}

const DARKPOOL_EPOCH_KEY_MULTIPLIER = 18446744073709551616n;

function darkPoolEpochKey(epochId: number, poolId: number): string {
  return `${BigInt(epochId) * DARKPOOL_EPOCH_KEY_MULTIPLIER + BigInt(poolId)}u128`;
}

export async function fetchDarkPoolInitializationState(): Promise<DarkPoolInitializationState> {
  const program = import.meta.env.VITE_PROGRAM_DARKPOOL || "privadex_darkpool_v4.aleo";
  const { value, reachable } = await getMappingValueDetailed(program, "initialized", "true");

  return {
    initialized: value === "true",
    reachable,
  };
}

export async function fetchEpochState(
  epochId: number,
  poolId: number = POOL_IDS.ALEO_USDCX,
): Promise<EpochState> {
  const program = import.meta.env.VITE_PROGRAM_DARKPOOL || "privadex_darkpool_v4.aleo";
  const key     = darkPoolEpochKey(epochId, poolId);

  const [bv, sv, cl, mp, fb, mb, ms, ic] = await Promise.all([
    getMappingValue(program, "epoch_buy_volume",  key),
    getMappingValue(program, "epoch_sell_volume", key),
    getMappingValue(program, "epoch_closed",      key),
    getMappingValue(program, "epoch_mid_price",   key),
    getMappingValue(program, "epoch_fee_bps",     key),
    getMappingValue(program, "epoch_matched_buy_volume", key),
    getMappingValue(program, "epoch_matched_sell_volume", key),
    getMappingValue(program, "intent_count",      key),
  ]);

  return {
    buyVolume:   parseLeoInt(bv ?? "0u128"),
    sellVolume:  parseLeoInt(sv ?? "0u128"),
    closed:      cl === "true",
    midPrice:    parseLeoInt(mp ?? "0u128"),
    feeBps:      Number(parseLeoInt(fb ?? "0u64")),
    matchedBuy:  parseLeoInt(mb ?? "0u128"),
    matchedSell: parseLeoInt(ms ?? "0u128"),
    intentCount: Number(parseLeoInt(ic ?? "0u64")),
  };
}

export interface DarkPoolSettlementPreview {
  matchedInput: bigint;
  refundInput: bigint;
  amountOut: bigint;
  feePaid: bigint;
}

export function estimateDarkPoolBuyClaim(epoch: EpochState, amount: bigint): DarkPoolSettlementPreview {
  const matchedInput = epoch.buyVolume === 0n
    ? 0n
    : (amount * epoch.matchedBuy) / epoch.buyVolume;
  const refundInput = amount - matchedInput;
  const grossBaseOut = epoch.buyVolume === 0n
    ? 0n
    : (amount * epoch.matchedSell) / epoch.buyVolume;
  const feePaid = (grossBaseOut * BigInt(epoch.feeBps)) / 10_000n;

  return {
    matchedInput,
    refundInput,
    amountOut: grossBaseOut - feePaid,
    feePaid,
  };
}

export function estimateDarkPoolSellClaim(epoch: EpochState, amount: bigint): DarkPoolSettlementPreview {
  const matchedInput = epoch.sellVolume === 0n
    ? 0n
    : (amount * epoch.matchedSell) / epoch.sellVolume;
  const refundInput = amount - matchedInput;
  const grossQuoteOut = epoch.sellVolume === 0n
    ? 0n
    : (amount * epoch.matchedBuy) / epoch.sellVolume;
  const feePaid = (grossQuoteOut * BigInt(epoch.feeBps)) / 10_000n;

  return {
    matchedInput,
    refundInput,
    amountOut: grossQuoteOut - feePaid,
    feePaid,
  };
}

// ─── AMM price calculation (client-side, mirrors Leo formula) ─────────────────
/**
 * Returns the output amount for a constant-product swap (no fee applied here —
 * call with fee-adjusted amount_in).
 */
export function cpmmOutput(amountIn: bigint, reserveIn: bigint, reserveOut: bigint): bigint {
  if (reserveIn === 0n || reserveOut === 0n) return 0n;
  return (reserveOut * amountIn) / (reserveIn + amountIn);
}

/**
 * Returns amount_out for a swap including fee.
 * fee is in basis points (e.g. 30 for 0.30%).
 */
export function cpmmOutputWithFee(
  amountIn:  bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps = 30,
): bigint {
  const BPS = 10_000n;
  const adj = amountIn * (BPS - BigInt(feeBps));
  const num  = reserveOut * adj;
  const den  = reserveIn * BPS + adj;
  return num / den;
}

/**
 * Returns real price impact percentage (0–100) for a constant-product swap.
 * Compares the execution price (amountOut/amountIn) against the spot price
 * (reserveOut/reserveIn) before the trade.
 */
export function priceImpact(
  amountIn:   bigint,
  reserveIn:  bigint,
  reserveOut: bigint,
  feeBps = 30,
): number {
  if (reserveIn === 0n || reserveOut === 0n || amountIn === 0n) return 0;
  const spotPrice = Number(reserveOut) / Number(reserveIn);
  const amountOut = Number(cpmmOutputWithFee(amountIn, reserveIn, reserveOut, feeBps));
  const execPrice = amountOut / Number(amountIn);
  const impact = ((spotPrice - execPrice) / spotPrice) * 100;
  return Math.max(0, Math.min(impact, 100));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/** Parse a Leo integer literal like "1234u128" or "1234u128.private" → BigInt */
export function parseLeoInt(s: string): bigint {
  return BigInt(s.replace(/\.private$/, "").replace(/\.public$/, "").replace(/u\d+$/, "").replace(/i\d+$/, ""));
}

/**
 * Extract a field value from a Shield Wallet record.
 * Checks r.data.field, r.field, and parses recordPlaintext/plaintext as fallback.
 * Shield Wallet uses `recordPlaintext` for the plaintext string.
 */
/**
 * Get the short record type name from a Shield Wallet record.
 * Shield Wallet may return "Token", "program.aleo/Token", or undefined.
 */
export function getRecordType(r: any): string {
  const raw = r.recordName || r.type || "";
  if (!raw) return "";
  return raw.includes("/") ? raw.split("/").pop()! : raw;
}

export function getRecordField(r: any, field: string): string | undefined {
  // Try r.data.field first
  let val = r.data?.[field] ?? r[field];
  if (val != null && field !== "owner" && field !== "spent") {
    val = String(val).replace(/\.private$/, "").replace(/\.public$/, "");
    return val;
  }
  // Fallback: parse recordPlaintext or plaintext
  const pt = r.recordPlaintext ?? r.plaintext;
  if (pt) {
    const match = pt.match(new RegExp(`${field}:\\s*([\\w.]+)`));
    if (match) return match[1].replace(/\.private$/, "").replace(/\.public$/, "");
  }
  return undefined;
}

/** Get token_id from a PrivateToken record as a number */
export function getRecordTokenId(r: any): number {
  const raw = getRecordField(r, "token_id") ?? "0u64";
  return Number(parseLeoInt(raw));
}

/** Get amount from a record as bigint */
export function getRecordAmount(r: any, field = "amount"): bigint {
  const raw = getRecordField(r, field) ?? "0u128";
  return parseLeoInt(raw);
}

/** Get microcredits from a credits.aleo record as bigint */
export function getRecordCredits(r: any): bigint {
  const raw = getRecordField(r, "microcredits") ?? getRecordField(r, "amount") ?? "0u64";
  return parseLeoInt(raw);
}

function getRecordPlaintext(r: any): string {
  return r?.recordPlaintext || r?.plaintext || "";
}

function isExcludedRecord(r: any, excludedPlaintexts?: Set<string>): boolean {
  if (!excludedPlaintexts || excludedPlaintexts.size === 0) return false;
  const pt = getRecordPlaintext(r);
  return !!pt && excludedPlaintexts.has(pt);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

const TX_CRITICAL_RECORD_FETCH: RecordFetchOptions = Object.freeze({
  preferScanner: true,
  skipCache: true,
});

const TX_CRITICAL_TOKEN_FETCH: RecordFetchOptions = Object.freeze({
  preferScanner: true,
  skipCache: true,
  scannerRecordName: "Token",
});

// ─── Robust record fetcher ──────────────────────────────────────────────────
/**
 * Fetches records for a program using the React context requestRecords first,
 * then falls back to window.shield directly if the context returns empty.
 * Shield Wallet's React wrapper can fail silently when adapter state changes
 * during wallet interactions (proof generation, signing, etc).
 */
export async function fetchRecordsRobust(
  requestRecords: any,
  program: string,
  options?: RecordFetchOptions,
): Promise<any[]> {
  const preferScanner = options?.preferScanner ?? false;
  const skipCache = options?.skipCache ?? false;
  const cacheMaxAgeMs = options?.cacheMaxAgeMs ?? 120_000;
  const scannerRecordName = options?.scannerRecordName;

  const fetchFromScanner = async (): Promise<any[]> => {
    if (!isScannerReady()) return [];
    try {
      const recs = await fetchRecordsFromScanner(program, scannerRecordName);
      if (recs.length > 0) {
        console.log(`[fetchRecordsRobust] RecordScanner(${program}${scannerRecordName ? `/${scannerRecordName}` : ""}) returned ${recs.length} records`);
        return recs;
      }
    } catch (e) {
      console.warn(`[fetchRecordsRobust] RecordScanner(${program}) failed:`, e);
    }
    return [];
  };

  const fetchFromWallet = async (): Promise<any[]> => {
    // Try 1: React context requestRecords
    try {
      const recs = requestRecords
        ? await requestRecords(program, true)
        : [];
      if (Array.isArray(recs) && recs.length > 0) {
        console.log(`[fetchRecordsRobust] React context(${program}) returned ${recs.length} records`);
        return recs;
      }
    } catch (e) {
      console.warn(`[fetchRecordsRobust] React requestRecords(${program}) failed:`, e);
    }

    // Try 2: Direct window.shield access (bypasses React state issues)
    try {
      const shield = (window as any).shield;
      if (shield?.requestRecords) {
        const recs = await shield.requestRecords(program, true);
        if (Array.isArray(recs) && recs.length > 0) {
          console.log(`[fetchRecordsRobust] window.shield(${program}) returned ${recs.length} records`);
          return recs;
        }
      }
    } catch (e) {
      console.warn(`[fetchRecordsRobust] window.shield(${program}) failed:`, e);
    }

    return [];
  };

  if (preferScanner) {
    const scannerRecords = await fetchFromScanner();
    if (scannerRecords.length > 0) return scannerRecords;
  }

  const walletRecords = await fetchFromWallet();
  if (walletRecords.length > 0) return walletRecords;

  if (!skipCache) {
    const cached = getCachedRecords(program, cacheMaxAgeMs);
    if (cached.length > 0) {
      console.log(`[fetchRecordsRobust] Using cached records for ${program}: ${cached.length} records`);
      return cached;
    }
  }

  if (!preferScanner) {
    const scannerRecords = await fetchFromScanner();
    if (scannerRecords.length > 0) return scannerRecords;
  }

  return [];
}

export async function fetchRecordsForTx(
  requestRecords: any,
  program: string,
  scannerRecordName?: string,
): Promise<any[]> {
  return fetchRecordsRobust(requestRecords, program, {
    ...TX_CRITICAL_RECORD_FETCH,
    ...(scannerRecordName ? { scannerRecordName } : {}),
  });
}

// ─── Smart split helper ──────────────────────────────────────────────────────
/**
 * Produces a private credits record of exact targetAmount.
 * Uses transfer_private to self (more reliable than split with Shield Wallet)
 * and passes recordIndices: [0] so the wallet knows which input is a record.
 *
 * Fee mode logic:
 * 1. If public ALEO balance ≥ fee → privateFee: false (most reliable)
 * 2. If a SEPARATE unspent record with ≥ fee exists → privateFee: true
 * 3. Otherwise → descriptive error
 *
 * Returns the plaintext of the exact-amount record.
 */
export async function splitToExact(
  walletExecute: any,
  requestRecords: any,
  address: string,
  recordPlaintext: string,
  targetAmount: bigint,
  fee = 1_500_000,
): Promise<string> {
  // 1. Determine fee mode
  const creditsRecs = getSpendableCreditsRecords(
    await fetchRecordsForTx(requestRecords, "credits.aleo"),
  );
  const unspent = creditsRecs;

  // Check public ALEO balance
  let publicBalance = 0n;
  try {
    const res = await fetch(
      `${API_BASE}/program/credits.aleo/mapping/account/${address}?t=${Date.now()}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const text = await res.text();
      const cleaned = text.replace(/"/g, "").trim();
      if (cleaned && cleaned !== "null") {
        publicBalance = parseLeoInt(cleaned);
      }
    }
  } catch { /* ignore */ }

  const feeBI = BigInt(fee);
  const hasPublicBalance = publicBalance >= feeBI;

  // Check if a SEPARATE record (not the one being split) has enough for the fee
  const hasFeeRecord = unspent.some((r: any) => {
    const rpt = r.recordPlaintext || r.plaintext;
    return rpt !== recordPlaintext && getRecordCredits(r) >= feeBI;
  });

  let privateFee: boolean;
  // Prefer public fee (most reliable — no record conflicts)
  if (hasPublicBalance) {
    privateFee = false;
  } else if (hasFeeRecord) {
    privateFee = true;
  } else {
    throw new Error(
      "Cannot split: no way to pay the 3 ALEO transaction fee. " +
      `You have ${unspent.length} private record(s) and ${(Number(publicBalance) / 1_000_000).toFixed(2)} public ALEO. ` +
      "Transfer some ALEO to your public balance first (credits.aleo → transfer_private_to_public)."
    );
  }

  console.log(`[splitToExact] records=${unspent.length}, publicBal=${(Number(publicBalance) / 1e6).toFixed(2)}, hasFeeRec=${hasFeeRecord}, privateFee=${privateFee}, target=${(Number(targetAmount) / 1e6).toFixed(2)}`);

  // 2. Execute transfer_private to self (functionally same as split, better Shield Wallet support)
  //    Produces: record1(targetAmount, owner=address), record2(remainder, owner=address)
  //    recordIndices: [0] tells Shield Wallet that input[0] is a record
  await executeOnChain(
    walletExecute,
    "credits.aleo",
    "transfer_private",
    [recordPlaintext, address, `${targetAmount}u64`],
    fee,
    privateFee,
    [0],
  );

  // Mark original record as spent so it won't be reused
  markRecordSpent(recordPlaintext);

  // 3. Poll for the exact-amount record (initial 5s wait, then 3s intervals)
  await sleep(5_000);
  for (let attempt = 0; attempt < 15; attempt++) {
    const fresh = getSpendableCreditsRecords(
      await fetchRecordsForTx(requestRecords, "credits.aleo"),
    );
    const exact = fresh
      .find((r: any) => getRecordCredits(r) === targetAmount);
    if (exact) {
      console.log(`[splitToExact] Found exact record on attempt ${attempt}`);
      return exact.recordPlaintext || exact.plaintext;
    }
    if (attempt < 14) await sleep(3_000);
  }

  throw new Error("Split ALEO record not found after split. Please try again.");
}

function getSpendableCreditsRecords(records: any[], excludedPlaintexts?: Set<string>): any[] {
  return records.filter((r: any) => (
    !r.spent &&
    !isRecordManuallySpent(r) &&
    !isExcludedRecord(r, excludedPlaintexts) &&
    getRecordCredits(r) > 0n
  ));
}

function totalCreditsBalance(records: any[]): bigint {
  return records.reduce((sum: bigint, r: any) => sum + getRecordCredits(r), 0n);
}

function selectCreditsRecord(
  records: any[],
  requiredAmount: bigint,
): any | null {
  const candidates = records
    .filter((r: any) => getRecordCredits(r) >= requiredAmount)
    .sort((a: any, b: any) => {
      const aAmt = getRecordCredits(a);
      const bAmt = getRecordCredits(b);
      if (aAmt < bAmt) return -1;
      if (aAmt > bAmt) return 1;
      return 0;
    });
  return candidates[0] ?? null;
}

async function pollForCreditsRecordAtLeast(
  requestRecords: any,
  minimumAmount: bigint,
  excludedPlaintexts?: Set<string>,
): Promise<string> {
  let lastPlaintext: string | null = null;
  await sleep(3_000);
  for (let attempt = 0; attempt < 20; attempt++) {
    const fresh = getSpendableCreditsRecords(
      await fetchRecordsForTx(requestRecords, "credits.aleo"),
      excludedPlaintexts,
    );
    const match = selectCreditsRecord(fresh, minimumAmount);
    if (match) {
      const pt = getRecordPlaintext(match);
      if (pt && pt === lastPlaintext) {
        console.log(`[pollForCreditsRecordAtLeast] Stable record found on attempt ${attempt}`);
        return pt;
      }
      lastPlaintext = pt;
      console.log(`[pollForCreditsRecordAtLeast] Found candidate on attempt ${attempt}, verifying stability…`);
    } else {
      lastPlaintext = null;
    }
    if (attempt < 19) await sleep(3_000);
  }
  if (lastPlaintext) {
    console.warn("[pollForCreditsRecordAtLeast] Using record without stability confirmation");
    return lastPlaintext;
  }
  throw new Error("Suitable ALEO record not found. Please try again.");
}

export async function joinCreditsRecords(
  walletExecute: any,
  requestRecords: any,
  record1Plaintext: string,
  record2Plaintext: string,
  minimumJoinedAmount: bigint,
  fee = 1_500_000,
  onTxSubmitted?: (txId: string) => void | Promise<void>,
): Promise<string> {
  const txId = await executeOnChain(
    walletExecute,
    "credits.aleo",
    "join",
    [record1Plaintext, record2Plaintext],
    fee,
    false,
    [0, 1],
  );
  await onTxSubmitted?.(txId);

  markRecordSpent(record1Plaintext);
  markRecordSpent(record2Plaintext);

  return await pollForCreditsRecordAtLeast(requestRecords, minimumJoinedAmount);
}

/**
 * Prepare a private ALEO credits record with balance >= requiredAmount.
 *
 * Unlike prepareExactCreditsRecord(), this helper does not require an exact
 * amount. It is intended for contracts that accept `amount_a` explicitly and
 * return change from the credits record.
 */
export async function prepareCreditsRecordForTx(
  walletExecute: any,
  requestRecords: any,
  requiredAmount: bigint,
  address?: string,
  onStatus?: (msg: string) => void,
  excludedPlaintexts?: Set<string>,
  onTxSubmitted?: (txId: string) => void | Promise<void>,
): Promise<string> {
  const JOIN_FEE = 1_500_000;
  const feeBig = BigInt(JOIN_FEE);

  let spendable = getSpendableCreditsRecords(
    await fetchRecordsForTx(requestRecords, "credits.aleo"),
    excludedPlaintexts,
  );
  let sufficient = selectCreditsRecord(spendable, requiredAmount);
  if (sufficient) {
    const pt = getRecordPlaintext(sufficient);
    if (pt) {
      console.log(`[prepareCreditsRecordForTx] Using existing ALEO record ${(Number(getRecordCredits(sufficient)) / 1e6).toFixed(2)} (need ${(Number(requiredAmount) / 1e6).toFixed(2)})`);
      return pt;
    }
  }

  const privateTotal = totalCreditsBalance(spendable);
  if (privateTotal >= requiredAmount && spendable.length > 1) {
    if (address) {
      const publicBalance = await getPublicAleoBalance(address);
      if (publicBalance < feeBig) {
        throw new Error("Insufficient public ALEO to join private credits records.");
      }
    }

    onStatus?.("Combining ALEO records…");
    while (true) {
      spendable = getSpendableCreditsRecords(
        await fetchRecordsForTx(requestRecords, "credits.aleo"),
        excludedPlaintexts,
      );
      sufficient = selectCreditsRecord(spendable, requiredAmount);
      if (sufficient) {
        const pt = getRecordPlaintext(sufficient);
        if (pt) return pt;
      }
      if (spendable.length < 2) break;

      const sorted = [...spendable].sort((a: any, b: any) => {
        const diff = getRecordCredits(b) - getRecordCredits(a);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      });
      const left = sorted[0];
      const right = sorted[1];
      const leftPt = getRecordPlaintext(left);
      const rightPt = getRecordPlaintext(right);
      if (!leftPt || !rightPt) break;

      const minimumJoinedAmount = getRecordCredits(left) + getRecordCredits(right);
      console.log(
        `[prepareCreditsRecordForTx] Joining ${(Number(getRecordCredits(left)) / 1e6).toFixed(2)} + ${(Number(getRecordCredits(right)) / 1e6).toFixed(2)} ALEO`,
      );
      await joinCreditsRecords(
        walletExecute,
        requestRecords,
        leftPt,
        rightPt,
        minimumJoinedAmount,
        JOIN_FEE,
        onTxSubmitted,
      );
    }

    spendable = getSpendableCreditsRecords(
      await fetchRecordsForTx(requestRecords, "credits.aleo"),
      excludedPlaintexts,
    );
    sufficient = selectCreditsRecord(spendable, requiredAmount);
    if (sufficient) {
      const pt = getRecordPlaintext(sufficient);
      if (pt) return pt;
    }
  }

  let publicBalance = 0n;
  if (address) {
    publicBalance = await getPublicAleoBalance(address);
    if (publicBalance >= requiredAmount + feeBig) {
      onStatus?.("Creating ALEO record from public balance…");
      const txId = await executeOnChain(
        walletExecute,
        "credits.aleo",
        "transfer_public_to_private",
        [address, `${requiredAmount}u64`],
        JOIN_FEE,
        false,
      );
      await onTxSubmitted?.(txId);
      return await pollForCreditsRecordAtLeast(requestRecords, requiredAmount, excludedPlaintexts);
    }
  }

  const totalBalance = privateTotal + publicBalance;
  throw new Error(
    `Insufficient ALEO: have ${(Number(totalBalance) / 1e6).toFixed(2)} ` +
    `(${(Number(privateTotal) / 1e6).toFixed(2)} private + ${(Number(publicBalance) / 1e6).toFixed(2)} public), ` +
    `need ${(Number(requiredAmount) / 1e6).toFixed(2)} private ALEO plus fee.`,
  );
}

// ─── Exact-amount credits record (auto-join safe) ─────────────────────────────
/**
 * Prepare a credits record with EXACT targetAmount microcredits.
 *
 * Shield Wallet auto-joins private records in the background, which breaks
 * splitToExact (the split output gets merged back before it can be used).
 *
 * This function avoids auto-join by routing through the PUBLIC balance:
 * 1. If an exact-amount record already exists → return it
 * 2. If public balance >= targetAmount + fee → create from public directly
 * 3. Else → drain the biggest private record to public, wait for on-chain
 *    confirmation, then create exact record from public.
 *
 * After drain, only a 0-microcredits change record remains. Even if auto-join
 * merges {0, targetAmount} → {targetAmount}, the amount stays the same, so
 * our polling by exact amount still finds the record.
 */
export async function prepareExactCreditsRecord(
  walletExecute: any,
  requestRecords: any,
  address: string,
  targetAmount: bigint,
  onStatus?: (msg: string) => void,
  excludedPlaintexts?: Set<string>,
): Promise<string> {
  const FEE = 1_500_000; // 1.5 ALEO
  const feeBig = BigInt(FEE);

  // 1. Check for exact match — no extra tx needed if it's the only record
  const records = await fetchRecordsForTx(requestRecords, "credits.aleo");
  const nonZero = getSpendableCreditsRecords(records, excludedPlaintexts);

  const exactRec = nonZero.find((r: any) => getRecordCredits(r) === targetAmount);

  if (exactRec && nonZero.length === 1) {
    // Only one record and it's exact — no auto-join risk
    console.log(`[prepareExactCredits] Single exact record found — no extra tx needed`);
    return exactRec.recordPlaintext || exactRec.plaintext;
  }

  if (exactRec && nonZero.length > 1) {
    // Exact record exists but other records risk auto-join.
    // Drain ONLY the other records, keep the exact one. Saves 1 tx vs full drain + create.
    const others = nonZero.filter((r: any) => r !== exactRec);
    onStatus?.(`Draining ${others.length} other record(s) to prevent auto-join…`);
    console.log(`[prepareExactCredits] Exact record found! Draining ${others.length} other record(s) to protect it`);

    for (const rec of others) {
      const amount = getRecordCredits(rec);
      const pt = rec.recordPlaintext || rec.plaintext;
      if (!pt || amount <= 0n) continue;

      const curPublic = await getPublicAleoBalance(address);
      const usePublicFee = curPublic >= feeBig;
      const drainAmt = usePublicFee ? amount : (amount > feeBig ? amount - feeBig : 0n);
      if (drainAmt <= 0n) continue;

      console.log(`[prepareExactCredits] Draining ${(Number(drainAmt) / 1e6).toFixed(2)} ALEO to public (publicFee: ${usePublicFee})`);
      try {
        await executeOnChain(
          walletExecute, "credits.aleo", "transfer_private_to_public",
          [pt, address, `${drainAmt}u64`], FEE, !usePublicFee, [0],
        );
        markRecordSpent(pt);
      } catch (e: any) {
        console.warn(`[prepareExactCredits] Drain failed: ${e?.message}`);
      }
    }

    // Small wait for drain to settle, then return the exact record
    await sleep(3_000);
    // Re-verify the exact record still exists (auto-join might have already merged it)
    const freshRecords = await fetchRecordsForTx(requestRecords, "credits.aleo");
    const freshExact = freshRecords
      .filter((r: any) => !r.spent && !isRecordManuallySpent(r) && !isExcludedRecord(r, excludedPlaintexts))
      .find((r: any) => getRecordCredits(r) === targetAmount);
    if (freshExact) {
      console.log(`[prepareExactCredits] Exact record still valid after drain — using directly`);
      return freshExact.recordPlaintext || freshExact.plaintext;
    }
    console.warn(`[prepareExactCredits] Exact record disappeared (auto-join?) — falling back to public path`);
  }

  // 2. No exact record — check if public balance is already sufficient
  let publicBalance = await getPublicAleoBalance(address);
  const neededPublic = targetAmount + feeBig;

  if (nonZero.length === 0 && publicBalance >= neededPublic) {
    // No private records → no auto-join risk → create directly from public (1 tx)
    console.log(`[prepareExactCredits] No private records, public sufficient — creating directly`);
    onStatus?.("Creating exact ALEO record…");
    await executeOnChain(
      walletExecute, "credits.aleo", "transfer_public_to_private",
      [address, `${targetAmount}u64`], FEE, false,
    );
    return await pollForExactCreditsRecord(requestRecords, targetAmount, excludedPlaintexts);
  }

  // 3. No exact record, private records exist → drain ALL to public first.
  //    Shield Wallet auto-joins records in the background. If we create a new
  //    record from public while other private records exist, auto-join will
  //    merge them immediately, destroying the exact-amount record.
  if (nonZero.length > 0) {
    onStatus?.(`Draining ${nonZero.length} private record(s) to public…`);
    for (const rec of nonZero) {
      const amount = getRecordCredits(rec);
      const pt = rec.recordPlaintext || rec.plaintext;
      if (!pt || amount <= 0n) continue;

      const curPublic = await getPublicAleoBalance(address);
      const usePublicFee = curPublic >= feeBig;
      const drainAmt = usePublicFee ? amount : (amount > feeBig ? amount - feeBig : 0n);
      if (drainAmt <= 0n) continue;

      console.log(`[prepareExactCredits] Draining ${(Number(drainAmt) / 1e6).toFixed(2)} ALEO to public (publicFee: ${usePublicFee})`);
      try {
        await executeOnChain(
          walletExecute, "credits.aleo", "transfer_private_to_public",
          [pt, address, `${drainAmt}u64`], FEE, !usePublicFee, [0],
        );
        markRecordSpent(pt);
      } catch (e: any) {
        console.warn(`[prepareExactCredits] Drain failed: ${e?.message}`);
      }
    }

    // Wait for public balance to reflect the drain
    onStatus?.("Waiting for on-chain confirmation…");
    await sleep(5_000);
    for (let attempt = 0; attempt < 30; attempt++) {
      publicBalance = await getPublicAleoBalance(address);
      if (publicBalance >= neededPublic) {
        console.log(`[prepareExactCredits] Public balance ready: ${(Number(publicBalance) / 1e6).toFixed(2)} ALEO`);
        break;
      }
      if (attempt >= 29) {
        throw new Error(
          `Timeout waiting for ALEO in public balance. ` +
          `Current: ${(Number(publicBalance) / 1e6).toFixed(2)}, need: ${(Number(neededPublic) / 1e6).toFixed(2)}. Try again shortly.`,
        );
      }
      await sleep(5_000);
    }
  }

  // 4. Verify sufficient public balance
  publicBalance = await getPublicAleoBalance(address);
  if (publicBalance < neededPublic) {
    throw new Error(
      `Insufficient ALEO: ${(Number(publicBalance) / 1e6).toFixed(2)} public, ` +
      `need ${(Number(neededPublic) / 1e6).toFixed(2)} (${(Number(targetAmount) / 1e6).toFixed(2)} + fee).`,
    );
  }

  // 5. Create exact record from public — no other private records to auto-join with
  onStatus?.("Creating exact ALEO record…");
  console.log(`[prepareExactCredits] Creating exact: ${(Number(targetAmount) / 1e6).toFixed(2)} ALEO from public`);

  await executeOnChain(
    walletExecute, "credits.aleo", "transfer_public_to_private",
    [address, `${targetAmount}u64`], FEE, false,
  );

  return await pollForExactCreditsRecord(requestRecords, targetAmount, excludedPlaintexts);
}

/** Read public ALEO balance from on-chain mapping */
export async function getPublicAleoBalance(address: string): Promise<bigint> {
  try {
    const res = await fetch(
      `${API_BASE}/program/credits.aleo/mapping/account/${address}?t=${Date.now()}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const text = await res.text();
      const cleaned = text.replace(/"/g, "").trim();
      if (cleaned && cleaned !== "null") return parseLeoInt(cleaned);
    }
  } catch { /* ignore */ }
  return 0n;
}

/**
 * Poll wallet for a credits record with exact amount.
 * Includes a stability check: verifies the same record plaintext appears
 * on two consecutive polls, ensuring auto-join has settled.
 */
async function pollForExactCreditsRecord(
  requestRecords: any,
  targetAmount: bigint,
  excludedPlaintexts?: Set<string>,
): Promise<string> {
  let lastPlaintext: string | null = null;
  await sleep(3_000);
  for (let attempt = 0; attempt < 20; attempt++) {
    const fresh = await fetchRecordsForTx(requestRecords, "credits.aleo");
    const match = fresh
      .filter((r: any) => !r.spent && !isRecordManuallySpent(r) && !isExcludedRecord(r, excludedPlaintexts))
      .find((r: any) => getRecordCredits(r) === targetAmount);
    if (match) {
      const pt = match.recordPlaintext || match.plaintext;
      if (pt && pt === lastPlaintext) {
        // Same record on consecutive polls → stable, auto-join settled
        console.log(`[prepareExactCredits] Stable record found on attempt ${attempt}`);
        return pt;
      }
      lastPlaintext = pt;
      console.log(`[prepareExactCredits] Found record on attempt ${attempt}, verifying stability…`);
    } else {
      lastPlaintext = null;
    }
    if (attempt < 19) await sleep(3_000);
  }
  // If we found a record but couldn't confirm stability, use the last one
  if (lastPlaintext) {
    console.warn(`[prepareExactCredits] Using record without stability confirmation`);
    return lastPlaintext;
  }
  throw new Error("Exact ALEO record not found. Please try again.");
}

// ═══════════════════════════════════════════════════════════════════════════════
// USDCx Private Token Record Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch USDCx Token records from the wallet.
 * Returns unspent Token records (filters out ComplianceRecord, Credentials, etc).
 */
export async function fetchUsdcxTokenRecords(
  requestRecords: any,
  excludedPlaintexts?: Set<string>,
  fetchOptions?: RecordFetchOptions,
): Promise<any[]> {
  const allRecs = await fetchRecordsRobust(requestRecords, PROGRAMS.USDCX, fetchOptions);
  console.log(`[fetchUsdcxTokenRecords] Got ${allRecs.length} raw records from ${PROGRAMS.USDCX}`);
  return allRecs.filter((r: any) => {
    if (r.spent || isRecordManuallySpent(r)) return false;
    if (isExcludedRecord(r, excludedPlaintexts)) return false;
    // Only Token records (not ComplianceRecord, Credentials, etc)
    // Shield Wallet may return recordName as "Token" or "test_usdcx_stablecoin.aleo/Token"
    const recordType = r.recordName || r.type || "";
    if (recordType) {
      const shortName = recordType.includes("/") ? recordType.split("/").pop() : recordType;
      if (shortName !== "Token") return false;
    }
    // If we can't determine type, check for 'amount' field (Token) vs 'sender' (ComplianceRecord)
    if (!recordType) {
      const pt = r.recordPlaintext || r.plaintext || "";
      if (pt.includes("sender:") || pt.includes("freeze_list_root:")) return false;
    }
    return getRecordAmount(r) > 0n;
  });
}

/**
 * Get total private USDCx balance from Token records.
 */
export function totalUsdcxBalance(records: any[]): bigint {
  return records.reduce((sum: bigint, r: any) => sum + getRecordAmount(r), 0n);
}

/**
 * Select the best Token record for a given amount.
 * Returns the smallest record that covers the amount (to minimize waste).
 * Returns null if no suitable record exists.
 */
export function selectTokenRecord(
  records: any[],
  requiredAmount: bigint,
): any | null {
  const candidates = records
    .filter((r: any) => getRecordAmount(r) >= requiredAmount)
    .sort((a: any, b: any) => {
      const aAmt = getRecordAmount(a);
      const bAmt = getRecordAmount(b);
      if (aAmt < bAmt) return -1;
      if (aAmt > bAmt) return 1;
      return 0;
    });
  return candidates[0] ?? null;
}

async function pollForStableUsdcxTokenRecord(
  requestRecords: any,
  requiredAmount: bigint,
  options?: {
    exactAmount?: bigint;
    initialDelayMs?: number;
    intervalMs?: number;
    maxAttempts?: number;
    excludedPlaintexts?: Set<string>;
  },
): Promise<string> {
  const exactAmount = options?.exactAmount;
  const initialDelayMs = options?.initialDelayMs ?? 5_000;
  const intervalMs = options?.intervalMs ?? 3_000;
  const maxAttempts = options?.maxAttempts ?? 20;
  const excludedPlaintexts = options?.excludedPlaintexts;

  let lastPlaintext: string | null = null;
  if (initialDelayMs > 0) await sleep(initialDelayMs);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const fresh = await fetchUsdcxTokenRecords(requestRecords, excludedPlaintexts, TX_CRITICAL_TOKEN_FETCH);
    const match = exactAmount != null
      ? fresh.find((r: any) => getRecordAmount(r) === exactAmount)
      : selectTokenRecord(fresh, requiredAmount);

    if (match) {
      const pt = getRecordPlaintext(match);
      if (pt && pt === lastPlaintext) {
        console.log(`[pollForStableUsdcxTokenRecord] Stable Token found on attempt ${attempt}`);
        return pt;
      }
      lastPlaintext = pt;
      console.log(`[pollForStableUsdcxTokenRecord] Found candidate on attempt ${attempt}, verifying stability…`);
    } else {
      lastPlaintext = null;
    }

    if (attempt < maxAttempts - 1) await sleep(intervalMs);
  }

  if (lastPlaintext) {
    console.warn("[pollForStableUsdcxTokenRecord] Using record without stability confirmation");
    return lastPlaintext;
  }

  throw new Error(
    exactAmount != null
      ? "USDCx exact Token record not found. Please try again."
      : "Suitable USDCx Token record not found. Please try again.",
  );
}

/**
 * Split a USDCx Token record to exact amount.
 * Uses test_usdcx_stablecoin.aleo/split which is a pure transition (no finalize, no compliance).
 * Returns the plaintext of the exact-amount Token record.
 */
export async function splitUsdcxToExact(
  walletExecute: any,
  requestRecords: any,
  tokenRecordPlaintext: string,
  targetAmount: bigint,
  fee = 1_500_000,
): Promise<string> {
  console.log(`[splitUsdcxToExact] Splitting USDCx Token to ${(Number(targetAmount) / 1e6).toFixed(6)}`);

  // split(Token, u128) → (Token(exact), Token(change))
  // input[0] is a record → recordIndices: [0]
  await executeOnChain(
    walletExecute,
    PROGRAMS.USDCX,
    USDCX_FNS.SPLIT,
    [tokenRecordPlaintext, `${targetAmount}u128`],
    fee,
    false,
    [0],
  );

  // Mark original record as spent
  markRecordSpent(tokenRecordPlaintext);

  return await pollForStableUsdcxTokenRecord(requestRecords, targetAmount, { exactAmount: targetAmount });
}

/**
 * Join two USDCx Token records into one.
 * Uses test_usdcx_stablecoin.aleo/join which is a pure transition (no finalize).
 */
export async function joinUsdcxTokens(
  walletExecute: any,
  requestRecords: any,
  tokenRecord1: string,
  tokenRecord2: string,
  minimumJoinedAmount = 0n,
  fee = 1_500_000,
  onTxSubmitted?: (txId: string) => void | Promise<void>,
): Promise<string> {
  // join(Token, Token) → Token(combined)
  // input[0] and input[1] are records → recordIndices: [0, 1]
  const txId = await executeOnChain(
    walletExecute,
    PROGRAMS.USDCX,
    USDCX_FNS.JOIN,
    [tokenRecord1, tokenRecord2],
    fee,
    false,
    [0, 1],
  );
  await onTxSubmitted?.(txId);

  markRecordSpent(tokenRecord1);
  markRecordSpent(tokenRecord2);

  return await pollForStableUsdcxTokenRecord(requestRecords, minimumJoinedAmount);
}

/**
 * Convert user's public USDCx balance to a private Token record.
 * Calls test_usdcx_stablecoin.aleo/transfer_public_to_private.
 * This is a one-time migration step for users who hold public USDCx.
 */
export async function convertUsdcxToPrivate(
  walletExecute: any,
  requestRecords: any,
  recipientAddress: string,
  amount: bigint,
  fee = 1_500_000,
  onTxSubmitted?: (txId: string) => void | Promise<void>,
): Promise<string> {
  console.log(`[convertUsdcxToPrivate] Converting ${(Number(amount) / 1e6).toFixed(6)} USDCx to private`);

  // transfer_public_to_private(address, u128) → (ComplianceRecord, Token)
  // No record inputs → no recordIndices needed
  const txId = await executeOnChain(
    walletExecute,
    PROGRAMS.USDCX,
    USDCX_FNS.TRANSFER_PUBLIC_TO_PRIVATE,
    [recipientAddress, `${amount}u128`],
    fee,
    false,
  );
  await onTxSubmitted?.(txId);

  // Wallets can auto-join newly created Token records, so accept any stable
  // private Token that still covers the requested amount.
  return await pollForStableUsdcxTokenRecord(requestRecords, amount);
}

/**
 * Prepare a USDCx Token record for a transaction.
 *
 * The AMM/DEX contracts handle change internally — transfer_private_to_public
 * only transfers `amount_b` and returns a change Token record. So the Token
 * record does NOT need to be exact amount, just >= requiredAmount.
 *
 * Strategy (in priority order):
 * 1. Use an existing private Token record with amount >= requiredAmount (no extra tx!)
 * 2. Convert from PUBLIC USDCx balance → private record (if no sufficient private record)
 */
export async function prepareUsdcxForTx(
  walletExecute: any,
  requestRecords: any,
  requiredAmount: bigint,
  address?: string,
  excludedPlaintexts?: Set<string>,
  onTxSubmitted?: (txId: string) => void | Promise<void>,
): Promise<{ tokenRecord: string; merkleProofs: string }> {
  let records = await fetchUsdcxTokenRecords(requestRecords, excludedPlaintexts, TX_CRITICAL_TOKEN_FETCH);
  let privateTotal = totalUsdcxBalance(records);

  // Give Shield Wallet a short chance to finish background joins before we
  // decide there is no usable private Token record.
  for (let attempt = 0; attempt < 3; attempt++) {
    const sufficient = selectTokenRecord(records, requiredAmount);
    if (sufficient) {
      const pt = await pollForStableUsdcxTokenRecord(requestRecords, requiredAmount, {
        initialDelayMs: 0,
        intervalMs: 1_500,
        maxAttempts: 4,
        excludedPlaintexts,
      });
      const amt = getRecordAmount(sufficient);
      console.log(`[prepareUsdcxForTx] Using stable Token record: ${(Number(amt) / 1e6).toFixed(2)} USDCx (need ${(Number(requiredAmount) / 1e6).toFixed(2)})`);
      return { tokenRecord: pt, merkleProofs: EMPTY_MERKLE_PROOFS };
    }
    if (attempt < 2) {
      await sleep(1_500);
      records = await fetchUsdcxTokenRecords(requestRecords, excludedPlaintexts, TX_CRITICAL_TOKEN_FETCH);
      privateTotal = totalUsdcxBalance(records);
    }
  }

  // 2. If private balance exists but is fragmented, join private records first.
  if (privateTotal >= requiredAmount && records.length > 1) {
    console.log(`[prepareUsdcxForTx] Joining fragmented USDCx records to reach ${(Number(requiredAmount) / 1e6).toFixed(2)}`);
    while (true) {
      records = await fetchUsdcxTokenRecords(requestRecords, excludedPlaintexts, TX_CRITICAL_TOKEN_FETCH);
      const sufficient = selectTokenRecord(records, requiredAmount);
      if (sufficient) {
        const pt = await pollForStableUsdcxTokenRecord(requestRecords, requiredAmount, {
          initialDelayMs: 0,
          intervalMs: 1_500,
          maxAttempts: 4,
          excludedPlaintexts,
        });
        return { tokenRecord: pt, merkleProofs: EMPTY_MERKLE_PROOFS };
      }
      if (records.length < 2) break;

      const sorted = [...records].sort((a: any, b: any) => {
        const diff = getRecordAmount(b) - getRecordAmount(a);
        return diff > 0n ? 1 : diff < 0n ? -1 : 0;
      });
      const left = sorted[0];
      const right = sorted[1];
      const leftPt = getRecordPlaintext(left);
      const rightPt = getRecordPlaintext(right);
      if (!leftPt || !rightPt) break;

      const minimumJoinedAmount = getRecordAmount(left) + getRecordAmount(right);
      await joinUsdcxTokens(
        walletExecute,
        requestRecords,
        leftPt,
        rightPt,
        minimumJoinedAmount,
        1_500_000,
        onTxSubmitted,
      );
    }
  }

  // 3. Convert from PUBLIC balance (only if no sufficient private record exists)
  let publicBalance = 0n;
  if (address) {
    try {
      const val = await getMappingValue(PROGRAMS.USDCX, "balances", address);
      if (val) publicBalance = parseLeoInt(val);
    } catch { /* ignore */ }

    if (publicBalance >= requiredAmount) {
      console.log(`[prepareUsdcxForTx] No sufficient private record. Converting from public: ${(Number(requiredAmount) / 1e6).toFixed(2)} USDCx`);
      const newPt = await convertUsdcxToPrivate(
        walletExecute, requestRecords, address, requiredAmount, 1_500_000, onTxSubmitted,
      );
      return { tokenRecord: newPt, merkleProofs: EMPTY_MERKLE_PROOFS };
    }
  }

  const totalBalance = privateTotal + publicBalance;
  throw new Error(
    `Insufficient USDCx: have ${(Number(totalBalance) / 1e6).toFixed(2)} USDCx ` +
    `(${(Number(privateTotal) / 1e6).toFixed(2)} private + ${(Number(publicBalance) / 1e6).toFixed(2)} public), ` +
    `need ${(Number(requiredAmount) / 1e6).toFixed(2)} USDCx. Mint more USDCx first.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Generic simple token helpers (BTCx, ETHx — no MerkleProof/compliance)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch Token records for a simple token program (BTCx or ETHx).
 * These only have Token records (no ComplianceRecord, no Credentials).
 */
export async function fetchSimpleTokenRecords(
  requestRecords: any,
  programId: string,
): Promise<any[]> {
  const allRecs = await fetchRecordsRobust(requestRecords, programId);
  console.log(`[fetchSimpleTokenRecords] Got ${allRecs.length} raw records from ${programId}`);
  return allRecs.filter((r: any) => {
    if (r.spent || isRecordManuallySpent(r)) return false;
    const recordType = r.recordName || r.type || "";
    if (recordType) {
      const shortName = recordType.includes("/") ? recordType.split("/").pop() : recordType;
      if (shortName !== "Token") return false;
    }
    return getRecordAmount(r) > 0n;
  });
}

/**
 * Get total private balance for a simple token.
 */
export function totalSimpleTokenBalance(records: any[]): bigint {
  return records.reduce((sum: bigint, r: any) => sum + getRecordAmount(r), 0n);
}

/**
 * Convert public balance to private Token record for a simple token.
 * Calls <program>/transfer_public_to_private(address, u128)
 * Returns the plaintext of the new Token record.
 */
export async function convertSimpleTokenToPrivate(
  walletExecute: any,
  requestRecords: any,
  programId: string,
  recipientAddress: string,
  amount: bigint,
  fee = 1_500_000,
): Promise<string> {
  console.log(`[convertSimpleTokenToPrivate] Converting ${(Number(amount) / 1e6).toFixed(6)} of ${programId} to private`);

  // transfer_public_to_private(address, u128) → (Token)
  // No record inputs → no recordIndices
  await executeOnChain(
    walletExecute,
    programId,
    "transfer_public_to_private",
    [recipientAddress, `${amount}u128`],
    fee,
    false,
  );

  // Poll for the new Token record with stability check
  // (verify same plaintext on consecutive polls to ensure wallet state settled)
  let lastPlaintext: string | null = null;
  await sleep(5_000);
  for (let attempt = 0; attempt < 20; attempt++) {
    const fresh = await fetchSimpleTokenRecords(requestRecords, programId);
    const match = fresh.find((r: any) => getRecordAmount(r) === amount);
    if (match) {
      const pt = match.recordPlaintext || match.plaintext;
      if (pt && pt === lastPlaintext) {
        // Same record on consecutive polls → stable
        console.log(`[convertSimpleTokenToPrivate] Stable record found on attempt ${attempt}`);
        return pt;
      }
      lastPlaintext = pt;
      console.log(`[convertSimpleTokenToPrivate] Found record on attempt ${attempt}, verifying stability…`);
    } else {
      lastPlaintext = null;
    }
    if (attempt < 19) await sleep(3_000);
  }
  // Use last found record even without stability confirmation
  if (lastPlaintext) {
    console.warn(`[convertSimpleTokenToPrivate] Using record without stability confirmation`);
    return lastPlaintext;
  }
  throw new Error(`${programId} conversion Token record not found. Please try again.`);
}

/**
 * Prepare a simple token (BTCx/ETHx) record for a transaction.
 * Strategy:
 * 1. Use existing private Token record with amount >= requiredAmount
 * 2. Convert from PUBLIC balance → private record
 */
export async function prepareSimpleTokenForTx(
  walletExecute: any,
  requestRecords: any,
  programId: string,
  requiredAmount: bigint,
  address?: string,
): Promise<string> {
  const records = await fetchSimpleTokenRecords(requestRecords, programId);
  const privateTotal = totalSimpleTokenBalance(records);

  // 1. Any private Token record with sufficient balance
  const sufficient = selectTokenRecord(records, requiredAmount);
  if (sufficient) {
    const pt = sufficient.recordPlaintext || sufficient.plaintext;
    if (pt) {
      const amt = getRecordAmount(sufficient);
      console.log(`[prepareSimpleTokenForTx] Using existing ${programId} Token: ${(Number(amt) / 1e6).toFixed(2)} (need ${(Number(requiredAmount) / 1e6).toFixed(2)})`);
      return pt;
    }
  }

  // 2. Convert from PUBLIC balance
  let publicBalance = 0n;
  if (address) {
    try {
      const val = await getMappingValue(programId, "balances", address);
      if (val) publicBalance = parseLeoInt(val);
    } catch { /* ignore */ }

    if (publicBalance >= requiredAmount) {
      console.log(`[prepareSimpleTokenForTx] No sufficient private record. Converting from public: ${(Number(requiredAmount) / 1e6).toFixed(2)}`);
      return await convertSimpleTokenToPrivate(
        walletExecute, requestRecords, programId, address, requiredAmount, 1_500_000,
      );
    }
  }

  const symbol = programId.replace("test_", "").replace("_token.aleo", "").toUpperCase();
  const totalBalance = privateTotal + publicBalance;
  throw new Error(
    `Insufficient ${symbol}: have ${(Number(totalBalance) / 1e6).toFixed(2)} ` +
    `(${(Number(privateTotal) / 1e6).toFixed(2)} private + ${(Number(publicBalance) / 1e6).toFixed(2)} public), ` +
    `need ${(Number(requiredAmount) / 1e6).toFixed(2)}. Mint more ${symbol} first.`
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Token Registry helpers (BTCx/ETHx via token_registry.aleo)
// All registry tokens share one program — differentiated by token_id field
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Fetch Token records from token_registry.aleo filtered by token_id.
 * Since all registry tokens use the same program, we filter by the
 * token_id field in the record data.
 */
export async function fetchRegistryTokenRecords(
  requestRecords: any,
  registryTokenId: string,
  fetchOptions?: RecordFetchOptions,
  excludedPlaintexts?: Set<string>,
): Promise<any[]> {
  const allRecs = await fetchRecordsRobust(requestRecords, PROGRAMS.TOKEN_REGISTRY, fetchOptions);
  console.log(`[fetchRegistryTokenRecords] Got ${allRecs.length} raw records from ${PROGRAMS.TOKEN_REGISTRY}, filtering for token_id=${registryTokenId}`);
  return allRecs.filter((r: any) => {
    if (r.spent || isRecordManuallySpent(r)) return false;
    if (isExcludedRecord(r, excludedPlaintexts)) return false;
    const recordType = r.recordName || r.type || "";
    if (recordType) {
      const shortName = recordType.includes("/") ? recordType.split("/").pop() : recordType;
      if (shortName !== "Token") return false;
    }
    // Filter by token_id field
    const recTokenId = getRecordField(r, "token_id");
    if (!recTokenId) return false;
    // Normalize: "1field" vs "1field.private" etc
    const normalized = recTokenId.replace(/\.private$/, "").replace(/\.public$/, "");
    if (normalized !== registryTokenId) return false;
    return getRecordAmount(r) > 0n;
  });
}

/**
 * Get total private balance for a registry token.
 */
export function totalRegistryTokenBalance(records: any[]): bigint {
  return records.reduce((sum: bigint, r: any) => sum + getRecordAmount(r), 0n);
}

/**
 * Resolve the registry token_id for a given symbol.
 */
export function registryTokenIdForSymbol(symbol: string): string | null {
  if (symbol === "BTCx") return REGISTRY_TOKEN_IDS.BTCX;
  if (symbol === "ETHx") return REGISTRY_TOKEN_IDS.ETHX;
  return null;
}

/**
 * Convert public token_registry balance to private Token record.
 * Calls token_registry.aleo/transfer_public_to_private(token_id, recipient, amount, false)
 * No record inputs → no recordIndices needed.
 */
export async function convertRegistryTokenToPrivate(
  walletExecute: any,
  requestRecords: any,
  registryTokenId: string,
  recipientAddress: string,
  amount: bigint,
  fee = 1_500_000,
  onTxSubmitted?: (txId: string) => void | Promise<void>,
): Promise<string> {
  console.log(`[convertRegistryTokenToPrivate] Converting ${(Number(amount) / 1e6).toFixed(6)} of token_id=${registryTokenId} to private`);

  // transfer_public_to_private(token_id, recipient, amount, external_authorization_required)
  const txId = await executeOnChain(
    walletExecute,
    PROGRAMS.TOKEN_REGISTRY,
    "transfer_public_to_private",
    [registryTokenId, recipientAddress, `${amount}u128`, "false"],
    fee,
    false,
  );
  await onTxSubmitted?.(txId);

  // Poll for the new Token record with stability check
  let lastPlaintext: string | null = null;
  await sleep(5_000);
  for (let attempt = 0; attempt < 20; attempt++) {
    const fresh = await fetchRegistryTokenRecords(requestRecords, registryTokenId, TX_CRITICAL_TOKEN_FETCH);
    const match = fresh.find((r: any) => getRecordAmount(r) === amount);
    if (match) {
      const pt = match.recordPlaintext || match.plaintext;
      if (pt && pt === lastPlaintext) {
        console.log(`[convertRegistryTokenToPrivate] Stable record found on attempt ${attempt}`);
        return pt;
      }
      lastPlaintext = pt;
      console.log(`[convertRegistryTokenToPrivate] Found record on attempt ${attempt}, verifying stability…`);
    } else {
      lastPlaintext = null;
    }
    if (attempt < 19) await sleep(3_000);
  }
  if (lastPlaintext) {
    console.warn(`[convertRegistryTokenToPrivate] Using record without stability confirmation`);
    return lastPlaintext;
  }
  throw new Error(`Registry token (token_id=${registryTokenId}) conversion record not found. Please try again.`);
}

/**
 * Get public balance for a registry token.
 * token_registry.aleo stores public balances under:
 * authorized_balances[hash.bhp256(TokenOwner{account, token_id})]
 */
export async function getRegistryPublicBalance(
  address: string,
  registryTokenId: string,
): Promise<bigint> {
  try {
    const sdk = await getReadyProvableSdk();
    const tokenOwner = `{ account: ${address}, token_id: ${registryTokenId} }`;
    const ownerPlaintext = sdk.Plaintext.fromString(tokenOwner);
    const ownerKey = new sdk.BHP256().hash(ownerPlaintext.toBitsLe()).toString();

    const raw =
      await getMappingValue(PROGRAMS.TOKEN_REGISTRY, "authorized_balances", ownerKey) ??
      await getMappingValue(PROGRAMS.TOKEN_REGISTRY, "balances", ownerKey);

    if (!raw) return 0n;

    const balanceRaw = getRecordField({ plaintext: raw }, "balance");
    return balanceRaw ? parseLeoInt(balanceRaw) : 0n;
  } catch (e) {
    console.warn("[getRegistryPublicBalance] Failed:", e);
    return 0n;
  }
}

/**
 * Prepare a registry token (BTCx/ETHx) record for a transaction.
 * Strategy:
 * 1. Use existing private Token record with amount >= requiredAmount
 * 2. Convert from PUBLIC balance → private record
 */
export async function prepareRegistryTokenForTx(
  walletExecute: any,
  requestRecords: any,
  registryTokenId: string,
  requiredAmount: bigint,
  address?: string,
  excludedPlaintexts?: Set<string>,
  onTxSubmitted?: (txId: string) => void | Promise<void>,
): Promise<string> {
  const records = await fetchRegistryTokenRecords(
    requestRecords,
    registryTokenId,
    TX_CRITICAL_TOKEN_FETCH,
    excludedPlaintexts,
  );
  const privateTotal = totalRegistryTokenBalance(records);
  const symbol = registryTokenId === REGISTRY_TOKEN_IDS.BTCX ? "BTCx" : "ETHx";

  // 1. Any private Token record with sufficient balance
  const sufficient = selectTokenRecord(records, requiredAmount);
  if (sufficient) {
    const pt = sufficient.recordPlaintext || sufficient.plaintext;
    if (pt) {
      const amt = getRecordAmount(sufficient);
      console.log(`[prepareRegistryTokenForTx] Using existing registry Token (id=${registryTokenId}): ${(Number(amt) / 1e6).toFixed(2)} (need ${(Number(requiredAmount) / 1e6).toFixed(2)})`);
      return pt;
    }
  }

  // 2. Convert from PUBLIC balance when available
  let publicBalance = 0n;
  if (address) {
    publicBalance = await getRegistryPublicBalance(address, registryTokenId);
    if (publicBalance >= requiredAmount) {
      console.log(`[prepareRegistryTokenForTx] No private ${symbol} record found. Trying public -> private conversion for ${(Number(requiredAmount) / 1e6).toFixed(2)} ${symbol}`);
      return await convertRegistryTokenToPrivate(
        walletExecute, requestRecords, registryTokenId, address, requiredAmount, 1_500_000, onTxSubmitted,
      );
    }
  }

  const totalBalance = privateTotal + publicBalance;
  throw new Error(
    `Insufficient ${symbol}: have ${(Number(totalBalance) / 1e6).toFixed(2)} ` +
    `(${(Number(privateTotal) / 1e6).toFixed(2)} private + ${(Number(publicBalance) / 1e6).toFixed(2)} public), ` +
    `need ${(Number(requiredAmount) / 1e6).toFixed(2)}. Mint more ${symbol} first.`
  );
}
