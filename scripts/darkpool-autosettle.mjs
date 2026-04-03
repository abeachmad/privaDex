#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

import {
  buildDarkSettleInputs,
  createProgramManager,
  currentEpochId,
  epochEndHeight,
  fetchAmmSnapshot,
  fetchDarkPoolEpochSnapshot,
  fetchLatestHeight,
  fetchPublicAleoBalance,
  formatMicro,
  getBaseConfig,
  parseCliArgs,
  sleep,
  waitForEpochClosed,
  waitForTransaction,
} from "./darkpool-cli-utils.mjs";

const DEFAULT_LOOP_INTERVAL_MS = 20_000;
const DEFAULT_RETRY_COOLDOWN_MS = 120_000;
const DEFAULT_LOOKBACK_EPOCHS = 32;
const DEFAULT_SETTLE_LAG_BLOCKS = 2;
const DEFAULT_MAX_EPOCHS_PER_CYCLE = 1;
const DEFAULT_STATE_FILE = ".darkpool/darkpool-autosettle-state.json";
const DEFAULT_KEEP_WINDOW_EPOCHS = 256;
const STATE_VERSION = 1;

function printHelp() {
  console.log(`Continuously monitor ended dark-pool epochs and submit settle_epoch when needed.

Usage:
  node scripts/darkpool-autosettle.mjs [options]

Options:
  --private-key <key>            Signer key used to submit settle_epoch
  --state-file <path>            JSON state file used for dedupe / cooldown tracking
  --interval-ms <ms>             Loop sleep interval in milliseconds (default: 20000)
  --retry-cooldown-ms <ms>       Minimum wait before retrying the same epoch (default: 120000)
  --lookback-epochs <count>      How many past epochs to scan each cycle (default: 32)
  --start-epoch <number>         Override the first epoch scanned each cycle
  --settle-lag-blocks <count>    Extra blocks to wait after epoch end (default: 2)
  --max-epochs-per-cycle <count> Max epochs to settle per polling cycle (default: 1)
  --pool-id <number>             Pool ID (default: 4 for ALEO/USDCx)
  --program <program.aleo>       Dark pool program (default: from .env)
  --amm-program <program>        AMM program for reserve snapshot (default: inferred for dark pool)
  --rpc <url>                    Explorer RPC base URL
  --network <name>               Network name
  --priority-fee <credits>       Priority fee in ALEO credits (default: 1.5)
  --timeout-ms <ms>              Wait timeout for tx finalization and close confirmation
  --check-only                   Dry run. Print what would be settled without submitting tx
  --once                         Run a single scan cycle, then exit
  --help                         Show this help

Environment:
  DARKPOOL_SETTLER_PRIVATE_KEY   Optional alternative to --private-key
  DARKPOOL_AUTOSETTLE_STATE_FILE Optional alternative to --state-file
  DARKPOOL_AMM_PROGRAM           Optional AMM override for dark-pool settlement

Examples:
  npm run darkpool:autosettle -- --private-key APrivateKey1...
  npm run darkpool:autosettle:once -- --check-only --lookback-epochs 64
  npm run darkpool:autosettle -- --state-file /var/lib/privadex/darkpool-autosettle-state.json
`);
}

function parseNumberOption(value, label, fallback) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid ${label}: ${value ?? fallback}`);
  }
  return parsed;
}

function resolveStateFile(args, env) {
  const file = args["state-file"] ?? process.env.DARKPOOL_AUTOSETTLE_STATE_FILE ?? env.DARKPOOL_AUTOSETTLE_STATE_FILE ?? DEFAULT_STATE_FILE;
  return path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
}

function createEmptyState(config) {
  return {
    version: STATE_VERSION,
    updatedAt: new Date().toISOString(),
    config: {
      network: config.network,
      darkpoolProgram: config.darkpoolProgram,
      ammProgram: config.ammProgram,
      poolId: config.poolId,
    },
    epochs: {},
  };
}

function loadState(stateFile, config) {
  if (!fs.existsSync(stateFile)) {
    return createEmptyState(config);
  }

  const raw = fs.readFileSync(stateFile, "utf8").trim();
  if (!raw) {
    return createEmptyState(config);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Could not parse state file ${stateFile}: ${error?.message || error}`);
  }

  const base = createEmptyState(config);
  return {
    ...base,
    ...parsed,
    config: {
      ...base.config,
      ...(parsed?.config ?? {}),
    },
    epochs: {
      ...(parsed?.epochs ?? {}),
    },
  };
}

function saveState(stateFile, state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const payload = {
    ...state,
    version: STATE_VERSION,
    updatedAt: new Date().toISOString(),
  };
  const tempFile = `${stateFile}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(tempFile, stateFile);
}

function epochStateKey(config, epochId) {
  return `${config.network}:${config.darkpoolProgram}:${config.poolId}:${Number(epochId)}`;
}

function getEpochEntry(state, config, epochId) {
  return state.epochs[epochStateKey(config, epochId)] ?? null;
}

function updateEpochEntry(state, config, epochId, patch) {
  const key = epochStateKey(config, epochId);
  const existing = state.epochs[key] ?? {
    epochId: Number(epochId),
    poolId: config.poolId,
    darkpoolProgram: config.darkpoolProgram,
    status: "new",
    attemptCount: 0,
  };

  state.epochs[key] = {
    ...existing,
    ...patch,
    epochId: Number(epochId),
    poolId: config.poolId,
    darkpoolProgram: config.darkpoolProgram,
    lastUpdatedAt: new Date().toISOString(),
  };

  return state.epochs[key];
}

function pruneState(state, config, liveEpoch, minEpochToKeep) {
  const floorEpoch = Math.max(0, Math.min(Number(minEpochToKeep), liveEpoch) - DEFAULT_KEEP_WINDOW_EPOCHS);

  for (const [key, entry] of Object.entries(state.epochs ?? {})) {
    if (entry?.darkpoolProgram !== config.darkpoolProgram || entry?.poolId !== config.poolId) {
      continue;
    }

    const isTerminal = entry?.status === "closed" || entry?.status === "empty";
    if (isTerminal && Number(entry.epochId) < floorEpoch) {
      delete state.epochs[key];
    }
  }
}

function formatIso(timestampMs) {
  return new Date(timestampMs).toISOString();
}

function buildRuntimeConfig(args) {
  const config = getBaseConfig(args);
  const loopIntervalMs = parseNumberOption(args["interval-ms"], "--interval-ms", DEFAULT_LOOP_INTERVAL_MS);
  const retryCooldownMs = parseNumberOption(args["retry-cooldown-ms"], "--retry-cooldown-ms", DEFAULT_RETRY_COOLDOWN_MS);
  const lookbackEpochs = Math.max(1, Math.trunc(parseNumberOption(args["lookback-epochs"], "--lookback-epochs", DEFAULT_LOOKBACK_EPOCHS)));
  const settleLagBlocks = Math.trunc(parseNumberOption(args["settle-lag-blocks"], "--settle-lag-blocks", DEFAULT_SETTLE_LAG_BLOCKS));
  const maxEpochsPerCycle = Math.max(1, Math.trunc(parseNumberOption(args["max-epochs-per-cycle"], "--max-epochs-per-cycle", DEFAULT_MAX_EPOCHS_PER_CYCLE)));
  const startEpoch = args["start-epoch"] != null ? Math.trunc(parseNumberOption(args["start-epoch"], "--start-epoch", 0)) : null;
  const privateKey = args["private-key"] ?? process.env.DARKPOOL_SETTLER_PRIVATE_KEY ?? config.env.DARKPOOL_SETTLER_PRIVATE_KEY ?? null;
  const stateFile = resolveStateFile(args, config.env);

  return {
    ...config,
    checkOnly: Boolean(args.checkOnly),
    once: Boolean(args.once),
    loopIntervalMs,
    retryCooldownMs,
    lookbackEpochs,
    settleLagBlocks,
    maxEpochsPerCycle,
    startEpoch,
    privateKey,
    stateFile,
  };
}

function candidateEpochsForCycle(state, runtime, liveEpoch) {
  const configuredStart = runtime.startEpoch != null
    ? Math.max(0, runtime.startEpoch)
    : Math.max(0, liveEpoch - runtime.lookbackEpochs);
  const epochs = new Set();

  for (let epoch = configuredStart; epoch < liveEpoch; epoch += 1) {
    epochs.add(epoch);
  }

  for (const entry of Object.values(state.epochs ?? {})) {
    if (!entry || entry.darkpoolProgram !== runtime.darkpoolProgram || entry.poolId !== runtime.poolId) {
      continue;
    }

    const epochId = Number(entry.epochId);
    if (!Number.isFinite(epochId)) {
      continue;
    }

    if (epochId < liveEpoch && entry.status !== "closed" && entry.status !== "empty") {
      epochs.add(epochId);
    }
  }

  return [...epochs].sort((left, right) => left - right);
}

function priorityFeeMicrocredits(priorityFee) {
  return BigInt(Math.ceil(priorityFee * 1_000_000));
}

async function ensureProgramManager(runtime, signerContext) {
  if (runtime.checkOnly) {
    return null;
  }

  if (signerContext.pmContext) {
    return signerContext.pmContext;
  }

  signerContext.pmContext = await createProgramManager(runtime.privateKey, runtime.rpcUrl);
  return signerContext.pmContext;
}

async function attemptSettleEpoch(runtime, state, signerContext, latestHeight, liveEpoch, epochId) {
  const now = Date.now();
  const snapshot = await fetchDarkPoolEpochSnapshot(runtime, epochId, runtime.poolId);
  const entry = getEpochEntry(state, runtime, epochId);
  const settleReadyHeight = epochEndHeight(epochId) + runtime.settleLagBlocks;
  const hasIntentVolume = snapshot.intentCount > 0 || snapshot.buyVolume > 0n || snapshot.sellVolume > 0n;

  if (snapshot.closed) {
    updateEpochEntry(state, runtime, epochId, {
      status: "closed",
      nextEligibleAt: null,
      lastObservedHeight: latestHeight,
      liveEpoch,
      intentCount: snapshot.intentCount,
      buyVolume: String(snapshot.buyVolume),
      sellVolume: String(snapshot.sellVolume),
      matchedBuy: String(snapshot.matchedBuy),
      matchedSell: String(snapshot.matchedSell),
      midPrice: String(snapshot.midPrice),
    });
    return { action: "closed" };
  }

  if (!hasIntentVolume) {
    updateEpochEntry(state, runtime, epochId, {
      status: "empty",
      nextEligibleAt: null,
      lastObservedHeight: latestHeight,
      liveEpoch,
      intentCount: snapshot.intentCount,
      buyVolume: String(snapshot.buyVolume),
      sellVolume: String(snapshot.sellVolume),
    });
    return { action: "empty" };
  }

  if (latestHeight < settleReadyHeight) {
    updateEpochEntry(state, runtime, epochId, {
      status: "waiting",
      nextEligibleAt: null,
      lastObservedHeight: latestHeight,
      liveEpoch,
      settleReadyHeight,
      intentCount: snapshot.intentCount,
      buyVolume: String(snapshot.buyVolume),
      sellVolume: String(snapshot.sellVolume),
    });
    console.log(
      `[DarkPoolAutoSettle] Epoch ${epochId} still waiting: height ${latestHeight}/${settleReadyHeight}, intents ${snapshot.intentCount}.`,
    );
    return { action: "waiting" };
  }

  if (entry?.nextEligibleAt && now < entry.nextEligibleAt) {
    const remainingMs = entry.nextEligibleAt - now;
    console.log(
      `[DarkPoolAutoSettle] Epoch ${epochId} cooling down for ${Math.ceil(remainingMs / 1000)}s after ${entry.status}.`,
    );
    return { action: "cooldown" };
  }

  const ammSnapshot = await fetchAmmSnapshot(runtime, runtime.poolId, runtime.ammProgram);
  if (ammSnapshot.reserveA <= 0n || ammSnapshot.reserveB <= 0n) {
    const nextEligibleAt = now + runtime.retryCooldownMs;
    updateEpochEntry(state, runtime, epochId, {
      status: "error",
      nextEligibleAt,
      lastObservedHeight: latestHeight,
      liveEpoch,
      lastError: "AMM reserves are zero; refusing to settle.",
      intentCount: snapshot.intentCount,
      buyVolume: String(snapshot.buyVolume),
      sellVolume: String(snapshot.sellVolume),
    });
    console.error(`[DarkPoolAutoSettle] Epoch ${epochId} skipped: AMM reserves are zero.`);
    return { action: "error" };
  }

  if (runtime.checkOnly) {
    updateEpochEntry(state, runtime, epochId, {
      status: "ready",
      nextEligibleAt: null,
      lastObservedHeight: latestHeight,
      liveEpoch,
      intentCount: snapshot.intentCount,
      buyVolume: String(snapshot.buyVolume),
      sellVolume: String(snapshot.sellVolume),
      reserveA: String(ammSnapshot.reserveA),
      reserveB: String(ammSnapshot.reserveB),
      feeBps: ammSnapshot.feeBps,
    });
    console.log(
      `[DarkPoolAutoSettle] Would settle epoch ${epochId}: intents ${snapshot.intentCount}, buy ${snapshot.buyVolume}, sell ${snapshot.sellVolume}.`,
    );
    return { action: "ready" };
  }

  const pmContext = await ensureProgramManager(runtime, signerContext);
  const publicBalance = await fetchPublicAleoBalance(runtime, pmContext.signerAddress);
  if (publicBalance < priorityFeeMicrocredits(runtime.priorityFee)) {
    const nextEligibleAt = now + runtime.retryCooldownMs;
    const errorMessage = `Not enough public ALEO for priority fee. Need ${runtime.priorityFee} ALEO, have ${formatMicro(publicBalance)} ALEO.`;
    updateEpochEntry(state, runtime, epochId, {
      status: "error",
      nextEligibleAt,
      lastObservedHeight: latestHeight,
      liveEpoch,
      lastError: errorMessage,
      intentCount: snapshot.intentCount,
      buyVolume: String(snapshot.buyVolume),
      sellVolume: String(snapshot.sellVolume),
      publicBalance: String(publicBalance),
    });
    console.error(`[DarkPoolAutoSettle] Epoch ${epochId} skipped: ${errorMessage}`);
    return { action: "error" };
  }

  updateEpochEntry(state, runtime, epochId, {
    status: "submitting",
    nextEligibleAt: now + runtime.retryCooldownMs,
    lastAttemptAt: formatIso(now),
    lastObservedHeight: latestHeight,
    liveEpoch,
    attemptCount: (entry?.attemptCount ?? 0) + 1,
    intentCount: snapshot.intentCount,
    buyVolume: String(snapshot.buyVolume),
    sellVolume: String(snapshot.sellVolume),
    reserveA: String(ammSnapshot.reserveA),
    reserveB: String(ammSnapshot.reserveB),
    feeBps: ammSnapshot.feeBps,
    publicBalance: String(publicBalance),
    lastError: null,
  });

  console.log(
    `[DarkPoolAutoSettle] Settling epoch ${epochId} with ${snapshot.intentCount} intents, buy ${snapshot.buyVolume}, sell ${snapshot.sellVolume}.`,
  );

  try {
    const txId = await pmContext.pm.execute({
      programName: runtime.darkpoolProgram,
      functionName: "settle_epoch",
      inputs: buildDarkSettleInputs(runtime.poolId, epochId, snapshot, ammSnapshot),
      priorityFee: runtime.priorityFee,
      privateFee: false,
    });

    const normalizedTxId = String(txId);
    updateEpochEntry(state, runtime, epochId, {
      status: "submitted",
      lastTxId: normalizedTxId,
    });
    console.log(`[DarkPoolAutoSettle] TX submitted for epoch ${epochId}: ${normalizedTxId}`);

    const txStatus = await waitForTransaction(normalizedTxId, runtime, runtime.timeoutMs);
    if (txStatus.status === "rejected") {
      throw new Error(`Transaction rejected on-chain. TX: ${normalizedTxId}`);
    }

    const closedSnapshot = await waitForEpochClosed(runtime, epochId, runtime.poolId, true, runtime.timeoutMs);
    if (!closedSnapshot) {
      throw new Error(`Epoch ${epochId} did not close within ${runtime.timeoutMs}ms. TX: ${normalizedTxId}`);
    }

    updateEpochEntry(state, runtime, epochId, {
      status: "closed",
      nextEligibleAt: null,
      lastSuccessAt: new Date().toISOString(),
      lastTxId: normalizedTxId,
      matchedBuy: String(closedSnapshot.matchedBuy),
      matchedSell: String(closedSnapshot.matchedSell),
      midPrice: String(closedSnapshot.midPrice),
      feeBps: closedSnapshot.feeBps,
      intentCount: closedSnapshot.intentCount,
      buyVolume: String(closedSnapshot.buyVolume),
      sellVolume: String(closedSnapshot.sellVolume),
    });
    console.log(
      `[DarkPoolAutoSettle] Epoch ${epochId} closed. TX ${normalizedTxId}. Matched buy ${closedSnapshot.matchedBuy}, matched sell ${closedSnapshot.matchedSell}.`,
    );
    return { action: "settled", txId: normalizedTxId };
  } catch (error) {
    const nextEligibleAt = Date.now() + runtime.retryCooldownMs;
    updateEpochEntry(state, runtime, epochId, {
      status: "error",
      nextEligibleAt,
      lastError: error?.message || String(error),
    });
    console.error(`[DarkPoolAutoSettle] Epoch ${epochId} failed: ${error?.message || error}`);
    return { action: "error", error };
  }
}

async function runCycle(runtime, state, signerContext) {
  const latestHeight = await fetchLatestHeight(runtime);
  const liveEpoch = currentEpochId(latestHeight);
  const candidates = candidateEpochsForCycle(state, runtime, liveEpoch);
  const cycleFloorEpoch = candidates[0] ?? Math.max(0, liveEpoch - runtime.lookbackEpochs);

  pruneState(state, runtime, liveEpoch, cycleFloorEpoch);

  console.log(
    `[DarkPoolAutoSettle] Cycle: height ${latestHeight}, live epoch ${liveEpoch}, scanning ${candidates.length} epochs (${runtime.darkpoolProgram}, AMM ${runtime.ammProgram}).`,
  );

  let settledThisCycle = 0;
  for (const epochId of candidates) {
    const result = await attemptSettleEpoch(runtime, state, signerContext, latestHeight, liveEpoch, epochId);
    saveState(runtime.stateFile, state);
    if (result.action === "settled" || result.action === "ready") {
      settledThisCycle += 1;
    }
    if (settledThisCycle >= runtime.maxEpochsPerCycle) {
      break;
    }
  }

  if (settledThisCycle === 0) {
    console.log("[DarkPoolAutoSettle] Nothing to settle in this cycle.");
  }
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2), ["once"]);
  if (args.help) {
    printHelp();
    return;
  }

  const runtime = buildRuntimeConfig(args);
  const state = loadState(runtime.stateFile, runtime);

  if (!runtime.checkOnly && !runtime.privateKey) {
    throw new Error("Missing settler private key. Pass --private-key or set DARKPOOL_SETTLER_PRIVATE_KEY.");
  }

  console.log(`[DarkPoolAutoSettle] RPC: ${runtime.rpcUrl}`);
  console.log(`[DarkPoolAutoSettle] Network: ${runtime.network}`);
  console.log(`[DarkPoolAutoSettle] Program: ${runtime.darkpoolProgram}`);
  console.log(`[DarkPoolAutoSettle] AMM: ${runtime.ammProgram}`);
  console.log(`[DarkPoolAutoSettle] Pool: ${runtime.poolId}`);
  console.log(`[DarkPoolAutoSettle] State file: ${runtime.stateFile}`);
  console.log(`[DarkPoolAutoSettle] Mode: ${runtime.checkOnly ? "check-only" : runtime.once ? "single-cycle" : "loop"}`);

  const signerContext = {};

  do {
    try {
      await runCycle(runtime, state, signerContext);
      saveState(runtime.stateFile, state);
    } catch (error) {
      console.error(`[DarkPoolAutoSettle] Cycle failed: ${error?.message || error}`);
      saveState(runtime.stateFile, state);
    }

    if (runtime.once) {
      break;
    }

    await sleep(runtime.loopIntervalMs);
  } while (true);
}

main().catch((error) => {
  console.error(`[DarkPoolAutoSettle] Failed: ${error?.message || error}`);
  process.exitCode = 1;
});
