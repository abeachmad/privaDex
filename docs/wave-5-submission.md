# Wave 5 Submission Form — Draft Content

Character limits:
- **Updates in this Wave**: max 3,000 characters
- **7th Wave Milestone**: ~1,000 characters (matching 6th Wave length)

---

## Updates in this Wave

> Paste this into the "Updates in this Wave" field (max 3,000 chars)
> Actual count: ~2,700 characters

Live demo: https://privadex.vercel.app/

**Jury Feedback #1 — LP Fee Distribution (DONE)**
Implemented end-to-end LP fee tracking via `src/lib/lpTracker.ts`. `recordLpDeposit()` persists USD deposit value to localStorage on every successful add_liquidity. `calculateFeeEarned()` computes `earnedFees = currentPositionValue - totalDeposited`. Displayed in the Pool page "My Positions" tab and Portfolio page per-position. Fees accumulate naturally as 0.3% swap fees increase pool reserves under constant-product math, so an LP's share of reserves grows over time.

**Jury Feedback #2 — Dark Pool Expansion (DONE)**
Deployed and initialized 3 new dark pool contracts beyond the original ALEO/USDCx: `privadex_darkpool_btcx_v1` (BTCx/USDCx), `privadex_darkpool_ethx_v1` (ETHx/USDCx), `privadex_darkpool_btcx_ethx_v1` (BTCx/ETHx). All 4 pools use epoch-based batch settlement at AMM mid-price. Added `assert_pool_snapshot()` public function to 5 AMM contracts (v7/v8) so dark pools can verify oracle prices via cross-program snapshot verification. Blind router routes dark pool venue for all 4 pairs. DarkPool page has dynamic pair selector.

**Security & Production Hardening (Independent Audit)**
- Faucet admin key moved from browser to `/api/faucet-mint` Vercel serverless function. Rate-limited 10 mints/hour per IP, max 10 BTCx / 100 ETHx. Production bundle verified: zero private keys.
- `console.log/debug/info/trace` stripped from production via Vite esbuild `pure`. Diagnostic dumps wrapped in `import.meta.env.DEV`.
- Removed all mock data fallbacks. UI shows empty states on RPC failure (was showing fake $2.45M TVL).
- Vercel build now runs typecheck (`npm run build` = `tsc -b && vite build`). Fixed rewrite rule that was capturing `/api/` routes.
- Network configurable via `VITE_NETWORK` (testnet/mainnet) — removed hardcoded TESTNET.

**Remove Liquidity UI**
Wired the Remove button to `removeLiquidity` hook. New modal with percent slider, quick buttons (25/50/75/100%), real-time output preview, and 2% slippage protection on min outputs. Auto-refetches positions after success.

**Dark Pool Keeper**
Added `scripts/darkpool-autosettle.mjs` (526 lines) that polls epochs, settles expired ones via `settle_epoch`, and can run as a long-lived keeper or one-shot. npm scripts: `darkpool:init`, `darkpool:autosettle`, `darkpool:settle`, `darkpool:claim-buy`, `darkpool:cancel-buy`.

**Deployed Programs (16 total)**
6 AMM pools + 4 dark pools + orderbook + token + 2 shared infrastructure. Router contract written but blocked by a snarkOS cross-program simulation bug — direct AMM swap fallback is used.

---

## 6th Wave Milestone (already filled — reference only)

> This field is already filled in the form. Shown here for context when writing Wave 7.

After the hackathon, Veiled Markets will focus on mainnet readiness. This includes a comprehensive security audit of all four contracts, optimizing gas costs for cross-program calls, and implementing proper rate limiting and monitoring infrastructure. We plan to integrate additional Aleo wallets beyond Shield, build an SDK for third-party market creation, and explore cross-chain oracle integration for automated market resolution of real-world events. The governance system will be fully activated with community-elected resolver committees and protocol parameter voting. Long-term, we aim to become the primary privacy-preserving prediction market on Aleo with institutional-grade liquidity and compliance tooling.

---

## 7th Wave Milestone

> Paste this into the "7th Wave" field (max ~1,000 chars)
> Actual count: ~960 characters

Following mainnet readiness in Wave 6, Wave 7 targets the public mainnet launch and ecosystem expansion. Priorities: (1) execute the mainnet deployment with a phased liquidity bootstrap program and LP incentive emissions to seed all 6 AMM pools and 4 dark pools; (2) launch an institutional gateway featuring KYC-gated deposit flows, compliance reporting hooks, and fiat on/off ramps via USDCx; (3) ship a mobile-first progressive web app with full swap, LP, and dark pool intent submission parity with the desktop client; (4) integrate additional execution venues including a perpetuals module using existing reserve snapshot patterns, and a shielded limit-order aggregator; (5) expand beyond Aleo via a cross-chain messaging bridge for shielded ALEO ↔ EVM stablecoin swaps; (6) open a public bug bounty program with tiered rewards tied to TVL, and publish quarterly transparency reports covering volume, fees, and governance activity.

---

## How to use this file

1. Copy the **Updates in this Wave** section (between the code fences) into the form field
2. Leave **6th Wave Milestone** as is (already filled)
3. Copy the **7th Wave Milestone** section into the 7th Wave field
4. Product Category: `prediction market` (already filled)
5. Click **Submit the product**
