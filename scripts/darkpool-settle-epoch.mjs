#!/usr/bin/env node

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
  waitForEpochClosed,
  waitForTransaction,
} from "./darkpool-cli-utils.mjs";

function printHelp() {
  console.log(`Settle a dark pool epoch on-chain.

Usage:
  node scripts/darkpool-settle-epoch.mjs [options]

Options:
  --private-key <key>         Signer key used to submit settle_epoch
  --epoch-id <number>         Epoch to settle (default: current epoch - 1)
  --pool-id <number>          Pool ID (default: 4 for ALEO/USDCx)
  --program <program.aleo>    Dark pool program (default: from .env)
  --amm-program <program>     AMM program for reserve snapshot (default: inferred for dark pool)
  --rpc <url>                 Explorer RPC base URL
  --network <name>            Network name
  --priority-fee <credits>    Priority fee in ALEO credits (default: 1.5)
  --timeout-ms <ms>           Wait timeout for close confirmation
  --check-only                Print the settle snapshot without submitting tx
  --force                     Allow settle attempt even if preflight would normally abort
  --help                      Show this help

Example:
  npm run darkpool:settle -- --private-key APrivateKey1... --epoch-id 128352
  npm run darkpool:settle -- --check-only --epoch-id 128352
`);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const config = getBaseConfig(args);
  const latestHeight = await fetchLatestHeight(config);
  const liveEpoch = currentEpochId(latestHeight);
  const epochId = args["epoch-id"] != null ? Number(args["epoch-id"]) : liveEpoch - 1;

  if (!Number.isFinite(epochId) || epochId < 0) {
    throw new Error(`Invalid epoch id: ${args["epoch-id"] ?? epochId}`);
  }

  const snapshot = await fetchDarkPoolEpochSnapshot(config, epochId, config.poolId);
  const ammSnapshot = await fetchAmmSnapshot(config, config.poolId, config.ammProgram);
  const epochHasEnded = latestHeight >= epochEndHeight(epochId);

  console.log(`[DarkPoolSettle] Program: ${config.darkpoolProgram}`);
  console.log(`[DarkPoolSettle] AMM: ${config.ammProgram}`);
  console.log(`[DarkPoolSettle] Pool: ${config.poolId}`);
  console.log(`[DarkPoolSettle] Latest height: ${latestHeight}`);
  console.log(`[DarkPoolSettle] Live epoch: ${liveEpoch}`);
  console.log(`[DarkPoolSettle] Target epoch: ${epochId}`);
  console.log(`[DarkPoolSettle] Epoch ended: ${epochHasEnded}`);
  console.log(`[DarkPoolSettle] Closed: ${snapshot.closed}`);
  console.log(`[DarkPoolSettle] Intent count: ${snapshot.intentCount}`);
  console.log(`[DarkPoolSettle] Buy volume: ${snapshot.buyVolume} (${formatMicro(snapshot.buyVolume)} quote)`);
  console.log(`[DarkPoolSettle] Sell volume: ${snapshot.sellVolume} (${formatMicro(snapshot.sellVolume)} base)`);
  console.log(`[DarkPoolSettle] AMM reserve A: ${ammSnapshot.reserveA}`);
  console.log(`[DarkPoolSettle] AMM reserve B: ${ammSnapshot.reserveB}`);
  console.log(`[DarkPoolSettle] AMM fee bps: ${ammSnapshot.feeBps}`);

  if (args.checkOnly) {
    return;
  }

  if (!args["private-key"]) {
    throw new Error("Missing --private-key.");
  }
  if (snapshot.closed && !args.force) {
    throw new Error(`Epoch ${epochId} is already closed.`);
  }
  if (!epochHasEnded && !args.force) {
    throw new Error(`Epoch ${epochId} has not ended yet. Current height ${latestHeight}, need >= ${epochEndHeight(epochId)}.`);
  }
  if (ammSnapshot.reserveA <= 0n || ammSnapshot.reserveB <= 0n) {
    throw new Error("AMM reserves are zero; cannot settle with an empty snapshot.");
  }

  const { pm, signerAddress } = await createProgramManager(args["private-key"], config.rpcUrl);
  const publicBalance = await fetchPublicAleoBalance(config, signerAddress);

  console.log(`[DarkPoolSettle] Signer address: ${signerAddress}`);
  console.log(`[DarkPoolSettle] Public ALEO balance: ${formatMicro(publicBalance)} ALEO`);
  console.log("[DarkPoolSettle] Submitting settle_epoch...");

  const txId = await pm.execute({
    programName: config.darkpoolProgram,
    functionName: "settle_epoch",
    inputs: buildDarkSettleInputs(config.poolId, epochId, snapshot, ammSnapshot),
    priorityFee: config.priorityFee,
    privateFee: false,
  });

  const normalizedTxId = String(txId);
  console.log(`[DarkPoolSettle] Transaction submitted: ${normalizedTxId}`);

  const txStatus = await waitForTransaction(normalizedTxId, config, config.timeoutMs);
  if (txStatus.status === "rejected") {
    throw new Error(`Transaction rejected on-chain. TX: ${normalizedTxId}`);
  }

  const closedSnapshot = await waitForEpochClosed(config, epochId, config.poolId, true, config.timeoutMs);
  if (!closedSnapshot) {
    throw new Error(`settle_epoch submitted but epoch ${epochId} did not become closed within ${config.timeoutMs}ms. TX: ${normalizedTxId}`);
  }

  console.log(`[DarkPoolSettle] Success. Epoch ${epochId} is now closed.`);
  console.log(`[DarkPoolSettle] Matched buy volume: ${closedSnapshot.matchedBuy}`);
  console.log(`[DarkPoolSettle] Matched sell volume: ${closedSnapshot.matchedSell}`);
  console.log(`[DarkPoolSettle] Mid price: ${closedSnapshot.midPrice}`);
}

main().catch((error) => {
  console.error(`[DarkPoolSettle] Failed: ${error?.message || error}`);
  process.exitCode = 1;
});
