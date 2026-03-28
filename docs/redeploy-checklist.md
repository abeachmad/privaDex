# Redeploy Checklist

This checklist is for activating the hardened contracts that now exist in the local workspace.

## Important Constraint

Most active contracts in this repo declare `@noupgrade`.

That means:
- if the old program is already deployed on testnet, you cannot replace it in-place with `leo upgrade`
- activating the hardened version requires deploying a new program ID
- after deployment, `.env` must point `VITE_PROGRAM_*` to the new program IDs

In practice, the safest flow is:
1. create new versioned program IDs
2. deploy those new program IDs in dependency order
3. update `.env`
4. restart the frontend

## Contracts That Need New Deployments

Deploy these if you want the full hardened stack live:

- `privadex_token`
- `privadex_amm_v7`
- `privadex_amm_btcx_v3`
- `privadex_amm_ethx_v3`
- `privadex_amm_native_btcx_v3`
- `privadex_amm_native_ethx_v3`
- `privadex_amm_btcx_ethx_v3`
- `privadex_darkpool_v3`
- `privadex_orderbook_v3`
- `privadex_router`

External dependencies do not need redeploy here:

- `credits.aleo`
- `token_registry.aleo`
- `test_usdcx_stablecoin.aleo`

## Recommended Deployment Order

Deploy in this order so imports and frontend routing stay coherent:

1. `privadex_token`
2. `privadex_amm_v7`
3. `privadex_amm_btcx_v3`
4. `privadex_amm_ethx_v3`
5. `privadex_amm_native_btcx_v3`
6. `privadex_amm_native_ethx_v3`
7. `privadex_amm_btcx_ethx_v3`
8. `privadex_darkpool_v3`
9. `privadex_orderbook_v3`
10. `privadex_router`

Why this order:
- `darkpool` imports the hardened `amm_v7` snapshot assertion
- `router` imports the hardened native BTCx/ETHx AMMs

## Versioning Strategy

Because `@noupgrade` is active, do not assume the current names can be reused on testnet.

Use fresh IDs, for example:

- `privadex_token_v2.aleo`
- `privadex_amm_v8.aleo`
- `privadex_amm_btcx_v4.aleo`
- `privadex_amm_ethx_v4.aleo`
- `privadex_amm_native_btcx_v4.aleo`
- `privadex_amm_native_ethx_v4.aleo`
- `privadex_amm_btcx_ethx_v4.aleo`
- `privadex_darkpool_v4.aleo`
- `privadex_orderbook_v4.aleo`
- `privadex_router_v2.aleo`

You can choose a different naming scheme, but keep it explicit and consistent.

## Before Deploying

For each contract you are renaming:

1. update the `program ...` declaration in `src/main.leo`
2. update `"program"` in `program.json`
3. update local dependency names in downstream contracts if an imported program ID changed
4. run `leo build`

## Leo Commands

Example build:

```bash
leo build --path contracts/privadex_amm_v7
```

Example deploy:

```bash
leo deploy \
  --path contracts/privadex_amm_v7 \
  --network testnet \
  --endpoint https://api.explorer.provable.com/v1 \
  --private-key <DEPLOYER_PRIVATE_KEY> \
  --priority-fees 0 \
  --broadcast
```

Notes:
- use the real deployer key, not the faucet key unless that key is intentionally the deployer
- if you want to inspect the transaction first, add `--print` before broadcasting
- if a contract imports local dependencies, deploy the dependencies first

## Per-Contract Paths

- `contracts/privadex_token`
- `contracts/privadex_amm_v7`
- `contracts/privadex_amm_btcx_v3`
- `contracts/privadex_amm_ethx_v3`
- `contracts/privadex_amm_native_btcx_v3`
- `contracts/privadex_amm_native_ethx_v3`
- `contracts/privadex_amm_btcx_ethx_v3`
- `contracts/privadex_darkpool_v3`
- `contracts/privadex_orderbook_v3`
- `contracts/privadex_router`

## `.env` Update Checklist

After all deployments succeed, replace the active program IDs in `.env`:

```bash
VITE_PROGRAM_TOKEN=<new-token-program-id>
VITE_PROGRAM_AMM=<new-aleo-usdcx-amm-id>
VITE_PROGRAM_AMM_BTCX=<new-btcx-usdcx-amm-id>
VITE_PROGRAM_AMM_ETHX=<new-ethx-usdcx-amm-id>
VITE_PROGRAM_AMM_NATIVE_BTCX=<new-aleo-btcx-amm-id>
VITE_PROGRAM_AMM_NATIVE_ETHX=<new-aleo-ethx-amm-id>
VITE_PROGRAM_AMM_BTCX_ETHX=<new-btcx-ethx-amm-id>
VITE_PROGRAM_DARKPOOL=<new-darkpool-id>
VITE_PROGRAM_ORDERBOOK=<new-orderbook-id>
VITE_PROGRAM_ROUTER=<new-router-id>
```

Then restart the frontend dev server.

## Post-Deploy Smoke Checks

Run these checks after `.env` is updated:

1. load the app and confirm pool reserves still fetch
2. confirm no `mapping not found` warning for cumulative AMM metrics
3. test direct AMM swap on `ALEO/USDCx`
4. test atomic routed swap on one supported pair:
   `ALEO -> BTCx`, `ALEO -> ETHx`, or `BTCx -> ETHx`
5. test dark-pool submit and settle
6. test orderbook place/fill/cancel

## Current Frontend Behavior Before Redeploy

Until redeploy is done:
- pool reserves are live on-chain
- dark-pool epoch state is live on-chain
- cumulative AMM metrics may be unavailable on current deployments
- the frontend now labels those cases as observed estimates instead of pretending the missing metrics are real zeros
