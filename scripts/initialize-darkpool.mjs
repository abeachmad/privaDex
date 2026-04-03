#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_RPC_URL = "https://api.explorer.provable.com/v1";
const DEFAULT_NETWORK = "testnet";
const DEFAULT_PROGRAM = "privadex_darkpool_v4.aleo";
const DEFAULT_PRIORITY_FEE = 1.5;
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_POLL_INTERVAL_MS = 4_000;

function printHelp() {
  console.log(`Initialize PrivaDEX dark pool program on-chain.

Usage:
  node scripts/initialize-darkpool.mjs [options]

Options:
  --private-key <key>         Admin private key used to sign the transaction
  --admin <address>           Admin address passed to initialize(admin)
  --program <program.aleo>    Dark pool program ID (default: from .env or ${DEFAULT_PROGRAM})
  --rpc <url>                 Explorer RPC base URL (default: from .env or ${DEFAULT_RPC_URL})
  --network <name>            Network path segment (default: from .env or ${DEFAULT_NETWORK})
  --priority-fee <credits>    Priority fee in ALEO credits (default: ${DEFAULT_PRIORITY_FEE})
  --timeout-ms <ms>           Max wait time for finalized init check (default: ${DEFAULT_TIMEOUT_MS})
  --check-only                Only read current initialized state, do not submit a tx
  --force                     Submit initialize even if mapping already reports true
  --help                      Show this help

Environment variables:
  DARKPOOL_ADMIN_PRIVATE_KEY  Fallback signer key if --private-key is omitted
  DARKPOOL_ADMIN_ADDRESS      Fallback admin address if --admin is omitted
  VITE_PROGRAM_DARKPOOL       Default program if --program is omitted
  VITE_RPC_URL                Default RPC base URL if --rpc is omitted
  VITE_NETWORK                Default network if --network is omitted

Examples:
  node scripts/initialize-darkpool.mjs --private-key APrivateKey1... --admin aleo1...
  node scripts/initialize-darkpool.mjs --check-only
  npm run darkpool:init -- --private-key APrivateKey1...
`);
}

function parseArgs(argv) {
  const args = {
    checkOnly: false,
    force: false,
  };

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
    if (value == null || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    i += 1;
  }

  return args;
}

function loadEnvFile(envPath) {
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

function normalizeRpcBase(rpcUrl) {
  return String(rpcUrl || DEFAULT_RPC_URL).replace(/\/+$/, "");
}

function toApiBase(rpcUrl, network) {
  return `${normalizeRpcBase(rpcUrl)}/${network}`;
}

async function fetchText(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} when requesting ${url}`);
  }
  return (await res.text()).replace(/"/g, "").trim();
}

async function readInitializedState({ rpcUrl, network, program }) {
  const url = `${toApiBase(rpcUrl, network)}/program/${program}/mapping/initialized/true`;
  try {
    const text = await fetchText(url);
    return text === "true";
  } catch (error) {
    if (String(error?.message || error).includes("HTTP 404")) {
      return false;
    }
    throw error;
  }
}

async function waitForInitialized(config) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < config.timeoutMs) {
    if (await readInitializedState(config)) return true;
    await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS));
  }
  return false;
}

function asString(value) {
  return typeof value === "string" ? value : String(value);
}

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  if (argv.help) {
    printHelp();
    return;
  }

  const root = process.cwd();
  const env = loadEnvFile(path.join(root, ".env"));

  const rpcUrl = normalizeRpcBase(argv.rpc ?? process.env.VITE_RPC_URL ?? env.VITE_RPC_URL ?? DEFAULT_RPC_URL);
  const network = argv.network ?? process.env.VITE_NETWORK ?? env.VITE_NETWORK ?? DEFAULT_NETWORK;
  const program = argv.program ?? process.env.VITE_PROGRAM_DARKPOOL ?? env.VITE_PROGRAM_DARKPOOL ?? DEFAULT_PROGRAM;
  const privateKey = argv["private-key"] ?? process.env.DARKPOOL_ADMIN_PRIVATE_KEY ?? env.DARKPOOL_ADMIN_PRIVATE_KEY;
  const priorityFee = Number(argv["priority-fee"] ?? process.env.DARKPOOL_INIT_PRIORITY_FEE ?? DEFAULT_PRIORITY_FEE);
  const timeoutMs = Number(argv["timeout-ms"] ?? process.env.DARKPOOL_INIT_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);

  console.log(`[DarkPoolInit] RPC: ${rpcUrl}`);
  console.log(`[DarkPoolInit] Network: ${network}`);
  console.log(`[DarkPoolInit] Program: ${program}`);

  const initialized = await readInitializedState({ rpcUrl, network, program });
  console.log(`[DarkPoolInit] Current initialized state: ${initialized}`);

  if (argv.checkOnly) {
    return;
  }

  if (initialized && !argv.force) {
    console.log("[DarkPoolInit] Program already initialized. Use --force only if you intentionally want to submit again.");
    return;
  }

  if (!privateKey) {
    throw new Error("Missing admin private key. Pass --private-key or set DARKPOOL_ADMIN_PRIVATE_KEY.");
  }

  if (!Number.isFinite(priorityFee) || priorityFee < 0) {
    throw new Error(`Invalid --priority-fee value: ${priorityFee}`);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) {
    throw new Error(`Invalid --timeout-ms value: ${timeoutMs}`);
  }

  const sdk = await import("@provablehq/sdk");
  const account = new sdk.Account({ privateKey });
  const signerAddress = asString(account.address());
  const admin = argv.admin ?? process.env.DARKPOOL_ADMIN_ADDRESS ?? env.DARKPOOL_ADMIN_ADDRESS ?? signerAddress;

  console.log(`[DarkPoolInit] Signer address: ${signerAddress}`);
  console.log(`[DarkPoolInit] Admin input: ${admin}`);

  if (admin !== signerAddress) {
    throw new Error(
      `Admin address must match signer address for initialize(admin). ` +
      `Expected ${signerAddress}, received ${admin}.`,
    );
  }

  const pm = new sdk.ProgramManager(rpcUrl, undefined, undefined);
  pm.setAccount(account);

  console.log("[DarkPoolInit] Submitting initialize(admin)...");
  const txId = await pm.execute({
    programName: program,
    functionName: "initialize",
    inputs: [admin],
    priorityFee,
    privateFee: false,
  });

  console.log(`[DarkPoolInit] Transaction submitted: ${asString(txId)}`);
  console.log("[DarkPoolInit] Waiting for initialized mapping to flip to true...");

  const didInitialize = await waitForInitialized({
    rpcUrl,
    network,
    program,
    timeoutMs,
  });

  if (!didInitialize) {
    throw new Error(
      `Initialization transaction was submitted but initialized mapping did not become true within ${timeoutMs}ms. ` +
      `Check the transaction status and retry state check with --check-only.`,
    );
  }

  console.log("[DarkPoolInit] Success. Dark pool contract is now initialized.");
}

main().catch((error) => {
  console.error(`[DarkPoolInit] Failed: ${error?.message || error}`);
  process.exitCode = 1;
});
