#!/usr/bin/env node
/**
 * Diagnose add_liquidity rejection by querying on-chain state
 * and simulating the finalize logic.
 *
 * Usage: node scripts/diagnose-add-liq.mjs
 */

const API = 'https://api.explorer.provable.com/v1/testnet';
const AMM = 'privadex_amm_v7.aleo';
const USDCX = 'test_usdcx_stablecoin.aleo';
const FREEZE = 'test_usdcx_freezelist.aleo';
const POOL_ID = '4u64';

async function getMapping(program, mapping, key) {
  const res = await fetch(`${API}/program/${program}/mapping/${mapping}/${encodeURIComponent(key)}`);
  if (!res.ok) return null;
  const text = await res.text();
  const cleaned = text.replace(/"/g, '').trim();
  return cleaned === 'null' ? null : cleaned;
}

async function main() {
  console.log('=== PrivaDEX Add Liquidity Diagnostics ===\n');

  // 1. Pool state
  const [resA, resB, shares, feeBps] = await Promise.all([
    getMapping(AMM, 'reserve_a', POOL_ID),
    getMapping(AMM, 'reserve_b', POOL_ID),
    getMapping(AMM, 'total_shares', POOL_ID),
    getMapping(AMM, 'fee_bps', POOL_ID),
  ]);
  console.log('Pool state (pool_id=4):');
  console.log(`  reserve_a:    ${resA}`);
  console.log(`  reserve_b:    ${resB}`);
  console.log(`  total_shares: ${shares}`);
  console.log(`  fee_bps:      ${feeBps || '30u64 (default)'}`);

  // 2. USDCx stablecoin state
  const [paused, root1, root2, window, lastIdx] = await Promise.all([
    getMapping(USDCX, 'pause', 'true'),
    getMapping(FREEZE, 'freeze_list_root', '1u8'),
    getMapping(FREEZE, 'freeze_list_root', '2u8'),
    getMapping(FREEZE, 'block_height_window', 'true'),
    getMapping(FREEZE, 'freeze_list_last_index', 'true'),
  ]);
  console.log('\nUSDCx stablecoin state:');
  console.log(`  paused:              ${paused}`);
  console.log(`  freeze_list_root[1]: ${root1}`);
  console.log(`  freeze_list_root[2]: ${root2 || 'NULL (never updated)'}`);
  console.log(`  block_height_window: ${window}`);
  console.log(`  freeze_list_last_idx: ${lastIdx}`);

  // 3. AMM balances
  const [ammCredits, ammUsdcx] = await Promise.all([
    getMapping('credits.aleo', 'account', AMM),
    getMapping(USDCX, 'balances', AMM),
  ]);
  console.log('\nAMM program balances:');
  console.log(`  credits.aleo/account: ${ammCredits}`);
  console.log(`  USDCx balances:       ${ammUsdcx}`);

  // 4. Check if AMM address is frozen
  const ammFrozen = await getMapping(FREEZE, 'freeze_list', AMM);
  console.log(`  AMM frozen:           ${ammFrozen || 'false (not in list)'}`);

  // 5. Recent transactions on AMM
  console.log('\n--- Analysis ---');

  if (paused === 'true') {
    console.log('❌ USDCx contract is PAUSED — all transfers will fail');
    return;
  }

  if (!root1) {
    console.log('❌ freeze_list_root[1u8] is NULL — finalize will panic on get');
    return;
  }

  if (!root2) {
    console.log('⚠️  freeze_list_root[2u8] is NULL — if computed root ≠ root[1], finalize panics');
    console.log('   Expected root from empty proofs: hash.psd4([1field, 0field, 0field])');
    console.log('   On-chain root[1]: ' + root1);
    console.log('   These MUST match, otherwise transfer_private_to_public always fails.');
  }

  // 6. Simulate shares calculation
  if (resA && shares) {
    const ra = BigInt(resA.replace(/u\d+$/, ''));
    const ts = BigInt(shares.replace(/u\d+$/, ''));
    console.log('\nShares simulation (1 ALEO deposit):');
    const amtA = 1_000_000n;
    const calc = ts === 0n ? amtA * 1000n : (amtA * ts) / (ra || 1n);
    const slipped = calc * 98n / 100n;
    console.log(`  calculated: ${calc}`);
    console.log(`  with 2% slippage: ${slipped}`);
    console.log(`  assertion (slipped <= calc): ${slipped <= calc}`);
  }

  // 7. Check latest height
  try {
    const heightRes = await fetch(`${API}/latest/height`);
    const height = await heightRes.text();
    console.log(`\nCurrent block height: ${height}`);
  } catch { /* ignore */ }

  console.log('\n=== Done ===');
}

main().catch(console.error);
