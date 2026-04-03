#!/usr/bin/env node

import {
  buildDarkCancelBuyInputs,
  createProgramManager,
  extractBuyIntentContextFromSubmitTx,
  fetchDarkPoolEpochSnapshot,
  fetchPublicAleoBalance,
  fetchTransactionDetails,
  formatMicro,
  getBaseConfig,
  parseCliArgs,
  waitForIntentCountChange,
  waitForTransaction,
} from "./darkpool-cli-utils.mjs";

function printHelp() {
  console.log(`Cancel a buy-side dark pool intent before settlement.

Usage:
  node scripts/darkpool-cancel-buy-intent.mjs [options]

Options:
  --private-key <key>         Owner key for the DarkIntent record
  --intent-tx-id <txId>       Submit-buy transaction ID used to recover the DarkIntent record
  --intent-record <record>    DarkIntent record plaintext (alternative to --intent-tx-id)
  --epoch-id <number>         Epoch id if --intent-record is provided manually
  --pool-id <number>          Pool ID (default: 4)
  --program <program.aleo>    Dark pool program
  --rpc <url>                 Explorer RPC base URL
  --network <name>            Network name
  --priority-fee <credits>    Priority fee in ALEO credits (default: 1.5)
  --timeout-ms <ms>           Wait timeout for tx finalization
  --check-only                Only inspect cancellability and refund context
  --force                     Allow submit even if preflight warns
  --help                      Show this help

Examples:
  npm run darkpool:cancel-buy -- --private-key APrivateKey1... --intent-tx-id at1...
  npm run darkpool:cancel-buy -- --check-only --intent-tx-id at1...
`);
}

async function resolveIntentContext(config, args) {
  if (args["intent-tx-id"]) {
    const tx = await fetchTransactionDetails(config, args["intent-tx-id"]);
    return extractBuyIntentContextFromSubmitTx(tx, config.darkpoolProgram);
  }

  if (!args["intent-record"]) {
    throw new Error("Provide --intent-tx-id or --intent-record.");
  }
  if (args["epoch-id"] == null) {
    throw new Error("When using --intent-record manually, also provide --epoch-id.");
  }

  return {
    intentRecord: args["intent-record"],
    epochId: Number(args["epoch-id"]),
    poolId: Number(args["pool-id"] ?? config.poolId),
    isBuy: true,
    amount: args.amount != null ? BigInt(args.amount) : null,
  };
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const config = getBaseConfig(args);
  const intent = await resolveIntentContext(config, args);
  const snapshot = await fetchDarkPoolEpochSnapshot(config, intent.epochId, intent.poolId);

  console.log(`[DarkPoolCancelBuy] Program: ${config.darkpoolProgram}`);
  console.log(`[DarkPoolCancelBuy] Pool: ${intent.poolId}`);
  console.log(`[DarkPoolCancelBuy] Epoch: ${intent.epochId}`);
  console.log(`[DarkPoolCancelBuy] Closed: ${snapshot.closed}`);
  console.log(`[DarkPoolCancelBuy] Intent count: ${snapshot.intentCount}`);
  console.log(`[DarkPoolCancelBuy] Epoch buy volume: ${snapshot.buyVolume}`);
  if (intent.amount != null) {
    console.log(`[DarkPoolCancelBuy] Estimated refund: ${intent.amount} (${formatMicro(intent.amount)} USDCx)`);
  }

  if (args.checkOnly) {
    return;
  }

  if (!args["private-key"]) {
    throw new Error("Missing --private-key.");
  }
  if (snapshot.closed && !args.force) {
    throw new Error(`Epoch ${intent.epochId} is already closed. Use claim_buy_fill instead.`);
  }

  const { pm, signerAddress } = await createProgramManager(args["private-key"], config.rpcUrl);
  const publicBalance = await fetchPublicAleoBalance(config, signerAddress);

  console.log(`[DarkPoolCancelBuy] Signer address: ${signerAddress}`);
  console.log(`[DarkPoolCancelBuy] Public ALEO balance: ${formatMicro(publicBalance)} ALEO`);
  console.log("[DarkPoolCancelBuy] Submitting cancel_buy_intent...");

  const txId = await pm.execute({
    programName: config.darkpoolProgram,
    functionName: "cancel_buy_intent",
    inputs: buildDarkCancelBuyInputs(intent.intentRecord),
    priorityFee: config.priorityFee,
    privateFee: false,
  });

  const normalizedTxId = String(txId);
  console.log(`[DarkPoolCancelBuy] Transaction submitted: ${normalizedTxId}`);

  const txStatus = await waitForTransaction(normalizedTxId, config, config.timeoutMs);
  if (txStatus.status === "rejected") {
    throw new Error(`Transaction rejected on-chain. TX: ${normalizedTxId}`);
  }

  const updatedSnapshot = await waitForIntentCountChange(
    config,
    intent.epochId,
    snapshot.intentCount,
    intent.poolId,
    config.timeoutMs,
  );
  if (!updatedSnapshot && !args.force) {
    throw new Error(`cancel_buy_intent finalized but intent count did not change within ${config.timeoutMs}ms. TX: ${normalizedTxId}`);
  }

  console.log("[DarkPoolCancelBuy] Cancel transaction finalized.");
}

main().catch((error) => {
  console.error(`[DarkPoolCancelBuy] Failed: ${error?.message || error}`);
  process.exitCode = 1;
});
