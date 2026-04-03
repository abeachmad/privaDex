import fs from "node:fs";
import path from "node:path";

const DEFAULT_RPC_URL = "https://api.explorer.provable.com/v1";
const DEFAULT_NETWORK = "testnet";
const DEFAULT_DARKPOOL_PROGRAM = "privadex_darkpool_v4.aleo";
const DEFAULT_AMM_PROGRAM = "privadex_amm_v10.aleo";
const DEFAULT_POOL_ID = 4;
const DEFAULT_PRIORITY_FEE = 1.5;
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_POLL_INTERVAL_MS = 4_000;
const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const EPOCH_DURATION = 120;
const EPOCH_KEY_MULTIPLIER = 18446744073709551616n;
const DARKPOOL_AMM_PROGRAM_MAP = Object.freeze({
  "privadex_darkpool_v4.aleo": "privadex_amm_v8.aleo",
  "privadex_darkpool_v3.aleo": "privadex_amm_v7.aleo",
});

let sdkPromise = null;

export function loadEnvFile(root = process.cwd()) {
  const envPath = path.join(root, ".env");
  const env = {};
  if (!fs.existsSync(envPath)) return env;

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

export function parseCliArgs(argv, extraBooleanFlags = []) {
  const args = {
    checkOnly: false,
    force: false,
  };
  const booleanFlags = new Set(extraBooleanFlags.map(flag => String(flag)));

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--check-only") {
      args.checkOnly = true;
      continue;
    }
    if (arg === "--force") {
      args.force = true;
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new Error(`Unknown positional argument: ${arg}`);
    }

    const key = arg.slice(2);
    const value = argv[i + 1];
    if ((value == null || value.startsWith("--")) && booleanFlags.has(key)) {
      args[key] = true;
      continue;
    }
    if (value == null || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }

  return args;
}

export function defaultAmmProgramForDarkPool(darkpoolProgram, fallback = DEFAULT_AMM_PROGRAM) {
  return DARKPOOL_AMM_PROGRAM_MAP[String(darkpoolProgram)] ?? fallback;
}

export function getBaseConfig(args = {}) {
  const env = loadEnvFile();
  const rpcUrl = normalizeRpcBase(args.rpc ?? process.env.VITE_RPC_URL ?? env.VITE_RPC_URL ?? DEFAULT_RPC_URL);
  const network = args.network ?? process.env.VITE_NETWORK ?? env.VITE_NETWORK ?? DEFAULT_NETWORK;
  const darkpoolProgram = args.program ?? process.env.VITE_PROGRAM_DARKPOOL ?? env.VITE_PROGRAM_DARKPOOL ?? DEFAULT_DARKPOOL_PROGRAM;
  const explicitDarkpoolAmmProgram = args["amm-program"] ?? process.env.DARKPOOL_AMM_PROGRAM ?? env.DARKPOOL_AMM_PROGRAM;
  const fallbackAmmProgram = defaultAmmProgramForDarkPool(
    darkpoolProgram,
    process.env.VITE_PROGRAM_AMM ?? env.VITE_PROGRAM_AMM ?? DEFAULT_AMM_PROGRAM,
  );
  const ammProgram = explicitDarkpoolAmmProgram ?? fallbackAmmProgram;
  const poolId = Number(args["pool-id"] ?? DEFAULT_POOL_ID);
  const priorityFee = Number(args["priority-fee"] ?? DEFAULT_PRIORITY_FEE);
  const timeoutMs = Number(args["timeout-ms"] ?? DEFAULT_TIMEOUT_MS);

  if (!Number.isFinite(poolId)) throw new Error(`Invalid --pool-id value: ${args["pool-id"]}`);
  if (!Number.isFinite(priorityFee) || priorityFee < 0) throw new Error(`Invalid --priority-fee value: ${priorityFee}`);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) throw new Error(`Invalid --timeout-ms value: ${timeoutMs}`);

  return {
    env,
    rpcUrl,
    network,
    darkpoolProgram,
    ammProgram,
    poolId,
    priorityFee,
    timeoutMs,
  };
}

export function normalizeRpcBase(rpcUrl) {
  return String(rpcUrl || DEFAULT_RPC_URL).replace(/\/+$/, "");
}

export function apiBase(config) {
  return `${config.rpcUrl}/${config.network}`;
}

export function formatLeo(value, type) {
  return `${value}${type}`;
}

export function parseLeoInt(value, fallback = "0u128") {
  const raw = value ?? fallback;
  return BigInt(String(raw).replace(/\.private$/, "").replace(/\.public$/, "").replace(/u\d+$/, "").replace(/i\d+$/, ""));
}

export function parseLeoBool(value) {
  return String(value).replace(/"/g, "").trim() === "true";
}

export function currentEpochId(height) {
  return Math.floor(height / EPOCH_DURATION);
}

export function epochEndHeight(epochId) {
  return (Number(epochId) + 1) * EPOCH_DURATION;
}

export function darkPoolEpochKey(epochId, poolId) {
  return `${BigInt(epochId) * EPOCH_KEY_MULTIPLIER + BigInt(poolId)}u128`;
}

export async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} when requesting ${url}`);
  }
  const cleaned = (await res.text()).replace(/"/g, "").trim();
  if (!cleaned || cleaned === "null") return null;
  return cleaned;
}

export async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS) });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} when requesting ${url}`);
  }
  return await res.json();
}

export async function readMapping(config, program, mapping, key) {
  return await fetchText(`${apiBase(config)}/program/${program}/mapping/${mapping}/${encodeURIComponent(key)}`);
}

export async function fetchLatestHeight(config) {
  const text = await fetchText(`${apiBase(config)}/latest/height`);
  if (!text) throw new Error("Latest height not available.");
  const height = Number.parseInt(text, 10);
  if (!Number.isFinite(height)) throw new Error(`Invalid latest height: ${text}`);
  return height;
}

export async function fetchAmmSnapshot(config, poolId = config.poolId, ammProgram = config.ammProgram) {
  const key = formatLeo(poolId, "u64");
  const [reserveA, reserveB, feeBps] = await Promise.all([
    readMapping(config, ammProgram, "reserve_a", key),
    readMapping(config, ammProgram, "reserve_b", key),
    readMapping(config, ammProgram, "fee_bps", key),
  ]);

  return {
    reserveA: parseLeoInt(reserveA ?? "0u128"),
    reserveB: parseLeoInt(reserveB ?? "0u128"),
    feeBps: Number(parseLeoInt(feeBps ?? "30u64")),
  };
}

export async function fetchDarkPoolEpochSnapshot(config, epochId, poolId = config.poolId, darkpoolProgram = config.darkpoolProgram) {
  const epochKey = darkPoolEpochKey(epochId, poolId);
  const [buyVolume, sellVolume, closed, midPrice, feeBps, matchedBuy, matchedSell, intentCount] = await Promise.all([
    readMapping(config, darkpoolProgram, "epoch_buy_volume", epochKey),
    readMapping(config, darkpoolProgram, "epoch_sell_volume", epochKey),
    readMapping(config, darkpoolProgram, "epoch_closed", epochKey),
    readMapping(config, darkpoolProgram, "epoch_mid_price", epochKey),
    readMapping(config, darkpoolProgram, "epoch_fee_bps", epochKey),
    readMapping(config, darkpoolProgram, "epoch_matched_buy_volume", epochKey),
    readMapping(config, darkpoolProgram, "epoch_matched_sell_volume", epochKey),
    readMapping(config, darkpoolProgram, "intent_count", epochKey),
  ]);

  return {
    epochId: Number(epochId),
    poolId: Number(poolId),
    key: epochKey,
    buyVolume: parseLeoInt(buyVolume ?? "0u128"),
    sellVolume: parseLeoInt(sellVolume ?? "0u128"),
    closed: parseLeoBool(closed),
    midPrice: parseLeoInt(midPrice ?? "0u128"),
    feeBps: Number(parseLeoInt(feeBps ?? "0u64")),
    matchedBuy: parseLeoInt(matchedBuy ?? "0u128"),
    matchedSell: parseLeoInt(matchedSell ?? "0u128"),
    intentCount: Number(parseLeoInt(intentCount ?? "0u64")),
  };
}

export async function fetchPublicAleoBalance(config, address) {
  return parseLeoInt(
    await fetchText(`${apiBase(config)}/program/credits.aleo/mapping/account/${encodeURIComponent(address)}?t=${Date.now()}`) ?? "0u64",
    "0u64",
  );
}

export async function getSdk() {
  if (!sdkPromise) {
    sdkPromise = import("@provablehq/sdk");
  }
  return sdkPromise;
}

export async function createProgramManager(privateKey, rpcUrl) {
  if (!privateKey) {
    throw new Error("Missing private key.");
  }

  const sdk = await getSdk();
  const account = new sdk.Account({ privateKey });
  const pm = new sdk.ProgramManager(rpcUrl, undefined, undefined);
  pm.setAccount(account);

  return {
    sdk,
    account,
    pm,
    signerAddress: String(account.address()),
  };
}

export async function waitForTransaction(txId, config, timeoutMs = config.timeoutMs, intervalMs = DEFAULT_POLL_INTERVAL_MS) {
  const startedAt = Date.now();
  const url = `${apiBase(config)}/transaction/${txId}`;

  while (Date.now() - startedAt < timeoutMs) {
    const res = await fetch(url, { signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS) });
    if (res.status === 404) {
      await sleep(intervalMs);
      continue;
    }
    if (!res.ok) {
      await sleep(intervalMs);
      continue;
    }

    const body = await res.text();
    if (body.toLowerCase().includes("rejected")) {
      return { status: "rejected", body };
    }
    return { status: "finalized", body };
  }

  return { status: "pending", body: null };
}

export async function waitForEpochClosed(config, epochId, poolId = config.poolId, expected = true, timeoutMs = config.timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await fetchDarkPoolEpochSnapshot(config, epochId, poolId);
    if (snapshot.closed === expected) return snapshot;
    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }
  return null;
}

export async function waitForIntentCountChange(config, epochId, previousIntentCount, poolId = config.poolId, timeoutMs = config.timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await fetchDarkPoolEpochSnapshot(config, epochId, poolId);
    if (snapshot.intentCount !== previousIntentCount) return snapshot;
    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }
  return null;
}

export async function fetchTransactionDetails(config, txId) {
  const tx = await fetchJson(`${apiBase(config)}/transaction/${txId}`);
  if (!tx) {
    throw new Error(`Transaction ${txId} not found on explorer.`);
  }
  return tx;
}

export function extractBuyIntentContextFromSubmitTx(tx, darkpoolProgram = DEFAULT_DARKPOOL_PROGRAM) {
  const transition = tx?.execution?.transitions?.find(
    (item) => item.program === darkpoolProgram && item.function === "submit_buy_aleo",
  );
  if (!transition) {
    throw new Error("submit_buy_aleo transition not found in transaction.");
  }

  const intentOutput = transition.outputs?.find((output) => output.type === "record");
  if (!intentOutput?.value) {
    throw new Error("DarkIntent record output not found in transaction.");
  }

  const futureOutput = transition.outputs?.find((output) => output.type === "future");
  const futureValue = futureOutput?.value ?? "";
  const argsMatch = futureValue.match(/arguments:\s*\[\s*(\d+)u64,\s*(\d+)u64,\s*(true|false),\s*(\d+)u128/s);
  if (!argsMatch) {
    throw new Error("Could not parse epoch context from submit_buy_aleo future output.");
  }

  return {
    intentRecord: intentOutput.value,
    poolId: Number(argsMatch[1]),
    epochId: Number(argsMatch[2]),
    isBuy: argsMatch[3] === "true",
    amount: BigInt(argsMatch[4]),
  };
}

export function formatMicro(amount, decimals = 6) {
  return (Number(amount) / 10 ** decimals).toFixed(decimals);
}

export function estimateBuyClaim(snapshot, intentAmount) {
  const matchedInput = snapshot.buyVolume === 0n
    ? 0n
    : (intentAmount * snapshot.matchedBuy) / snapshot.buyVolume;
  const refundInput = intentAmount - matchedInput;
  const grossBaseOut = snapshot.buyVolume === 0n
    ? 0n
    : (intentAmount * snapshot.matchedSell) / snapshot.buyVolume;
  const feeBase = (grossBaseOut * BigInt(snapshot.feeBps)) / 10_000n;
  const netBaseOut = grossBaseOut - feeBase;

  return {
    matchedInput,
    refundInput,
    grossBaseOut,
    feeBase,
    netBaseOut,
  };
}

export function buildDarkSettleInputs(poolId, epochId, snapshot, ammSnapshot) {
  return [
    formatLeo(poolId, "u64"),
    formatLeo(epochId, "u64"),
    formatLeo(snapshot.buyVolume, "u128"),
    formatLeo(snapshot.sellVolume, "u128"),
    formatLeo(ammSnapshot.feeBps, "u64"),
    formatLeo(ammSnapshot.reserveA, "u128"),
    formatLeo(ammSnapshot.reserveB, "u128"),
  ];
}

export function buildDarkBuyClaimInputs(intentRecord, snapshot) {
  return [
    intentRecord,
    formatLeo(snapshot.buyVolume, "u128"),
    formatLeo(snapshot.matchedSell, "u128"),
    formatLeo(snapshot.matchedBuy, "u128"),
    formatLeo(snapshot.midPrice, "u128"),
    formatLeo(snapshot.feeBps, "u64"),
  ];
}

export function buildDarkCancelBuyInputs(intentRecord) {
  return [intentRecord];
}

export async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
