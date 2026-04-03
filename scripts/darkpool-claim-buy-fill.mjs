#!/usr/bin/env node

import {
  buildDarkBuyClaimInputs,
  createProgramManager,
  estimateBuyClaim,
  extractBuyIntentContextFromSubmitTx,
  fetchDarkPoolEpochSnapshot,
  fetchPublicAleoBalance,
  fetchTransactionDetails,
  formatMicro,
  getBaseConfig,
  parseCliArgs,
  waitForTransaction,
} from "./darkpool-cli-utils.mjs";

function printHelp() {
  console.log(`Claim a settled buy-side dark pool intent.

Usage:
  node scripts/darkpool-claim-buy-fill.mjs [options]

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
  --check-only                Only inspect claimability and preview the payout
  --force                     Allow submit even if preflight warns
  --help                      Show this help

Examples:
  npm run darkpool:claim-buy -- --private-key APrivateKey1... --intent-tx-id at1...
  npm run darkpool:claim-buy -- --check-only --intent-tx-id at1...
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
  const preview = intent.amount != null ? estimateBuyClaim(snapshot, intent.amount) : null;

  console.log(`[DarkPoolClaimBuy] Program: ${config.darkpoolProgram}`);
  console.log(`[DarkPoolClaimBuy] Pool: ${intent.poolId}`);
  console.log(`[DarkPoolClaimBuy] Epoch: ${intent.epochId}`);
  console.log(`[DarkPoolClaimBuy] Closed: ${snapshot.closed}`);
  console.log(`[DarkPoolClaimBuy] Total buy volume: ${snapshot.buyVolume}`);
  console.log(`[DarkPoolClaimBuy] Matched buy volume: ${snapshot.matchedBuy}`);
  console.log(`[DarkPoolClaimBuy] Matched sell volume: ${snapshot.matchedSell}`);
  console.log(`[DarkPoolClaimBuy] Mid price: ${snapshot.midPrice}`);
  console.log(`[DarkPoolClaimBuy] Epoch fee bps: ${snapshot.feeBps}`);

  if (preview) {
    console.log(`[DarkPoolClaimBuy] Estimated matched input: ${preview.matchedInput}`);
    console.log(`[DarkPoolClaimBuy] Estimated refund: ${preview.refundInput} (${formatMicro(preview.refundInput)} USDCx)`);
    console.log(`[DarkPoolClaimBuy] Estimated ALEO out: ${preview.netBaseOut} (${formatMicro(preview.netBaseOut)} ALEO)`);
    console.log(`[DarkPoolClaimBuy] Estimated base fee: ${preview.feeBase}`);
  }

  if (args.checkOnly) {
    return;
  }

  if (!args["private-key"]) {
    throw new Error("Missing --private-key.");
  }
  if (!snapshot.closed && !args.force) {
    throw new Error(`Epoch ${intent.epochId} is not closed yet. Run settle_epoch first.`);
  }

  const { pm, signerAddress } = await createProgramManager(args["private-key"], config.rpcUrl);
  const publicBalance = await fetchPublicAleoBalance(config, signerAddress);

  console.log(`[DarkPoolClaimBuy] Signer address: ${signerAddress}`);
  console.log(`[DarkPoolClaimBuy] Public ALEO balance: ${formatMicro(publicBalance)} ALEO`);
  console.log("[DarkPoolClaimBuy] Submitting claim_buy_fill...");

  const txId = await pm.execute({
    programName: config.darkpoolProgram,
    functionName: "claim_buy_fill",
    inputs: buildDarkBuyClaimInputs(intent.intentRecord, snapshot),
    priorityFee: config.priorityFee,
    privateFee: false,
  });

  const normalizedTxId = String(txId);
  console.log(`[DarkPoolClaimBuy] Transaction submitted: ${normalizedTxId}`);

  const txStatus = await waitForTransaction(normalizedTxId, config, config.timeoutMs);
  if (txStatus.status === "rejected") {
    throw new Error(`Transaction rejected on-chain. TX: ${normalizedTxId}`);
  }

  console.log("[DarkPoolClaimBuy] Claim transaction finalized.");
}

main().catch((error) => {
  console.error(`[DarkPoolClaimBuy] Failed: ${error?.message || error}`);
  process.exitCode = 1;
});
