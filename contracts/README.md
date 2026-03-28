# Local Contracts Workspace

This repository now treats `contracts/` as the only contract workspace we use for frontend-adjacent contract review and edits.

## Rules

- Use paths under `contracts/` only.
- Keep contract inspection and edits inside this local `contracts/` folder only.
- Treat `contracts/local-programs.json` as the local source of truth for active frontend program references.

## Canonical Local References

- Versioned Leo sources live under paths like `contracts/<program>/src/main.leo`.
- Built Aleo artifacts live under paths like `contracts/<program>/build/main.aleo`.
- Shared imported artifacts have canonical top-level copies:
  - `contracts/credits.aleo`
  - `contracts/token_registry.aleo`
  - `contracts/test_usdcx_stablecoin.aleo`
  - `contracts/merkle_tree.aleo`
  - `contracts/test_usdcx_multisig_core.aleo`
  - `contracts/test_usdcx_freezelist.aleo`

## Current Caveats

- `.env` can still point to older live program IDs even when the local `contracts/` sources have already been hardened.
- Because most active programs use `@noupgrade`, the hardened sources usually need fresh deployments and new program IDs before the frontend can rely on the new mappings and behaviors on-chain.
- Frontend helpers may therefore support schema fields that are present in local hardened sources but not yet available on the currently deployed contracts.

See [../docs/redeploy-checklist.md](/media/mdlog/mdlog/Project-MDlabs/frontend-privadex/docs/redeploy-checklist.md) for the deployment order and `.env` migration checklist.

## Native LP Upgrade Path

- `contracts/privadex_amm_native_btcx_v4` and `contracts/privadex_amm_native_ethx_v4` are local upgrade candidates for the native LP flow.
- These `v4` contracts accept `amount_a` explicitly during `add_liquidity`, so the frontend can use any private ALEO record with balance `>= deposit` and receive ALEO change back.
- The active frontend still points to the deployed `v3` program IDs in `.env`, so the no-exact-record flow only becomes active after deploying `v4` and switching those env values.

## Active Hardened Programs

The local workspace now includes source folders for the hardened stack, including:

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

## Handy Command

Run `npm run contracts:active` to print the active `.env` program names and their canonical local references.
