// On-chain program IDs and function input builders for PrivaDEX contracts
// v7/v3: Private USDCx Token records + MerkleProofs for all venues

export const PROGRAMS = {
  TOKEN:          import.meta.env.VITE_PROGRAM_TOKEN          || "privadex_token_v2.aleo",
  AMM:            import.meta.env.VITE_PROGRAM_AMM            || "privadex_amm_v10.aleo",
  AMM_BTCX:       import.meta.env.VITE_PROGRAM_AMM_BTCX       || "privadex_amm_btcx_v7.aleo",
  AMM_ETHX:       import.meta.env.VITE_PROGRAM_AMM_ETHX       || "privadex_amm_ethx_v7.aleo",
  AMM_NATIVE_BTCX: import.meta.env.VITE_PROGRAM_AMM_NATIVE_BTCX || "privadex_amm_native_btcx_v8.aleo",
  AMM_NATIVE_ETHX: import.meta.env.VITE_PROGRAM_AMM_NATIVE_ETHX || "privadex_amm_native_ethx_v8.aleo",
  AMM_BTCX_ETHX:   import.meta.env.VITE_PROGRAM_AMM_BTCX_ETHX   || "privadex_amm_btcx_ethx_v7.aleo",
  USDCX:          import.meta.env.VITE_PROGRAM_USDCX          || "test_usdcx_stablecoin.aleo",
  TOKEN_REGISTRY: import.meta.env.VITE_PROGRAM_TOKEN_REGISTRY || "token_registry.aleo",
  // Legacy standalone programs (kept for balance migration)
  BTCX_LEGACY:    "test_btcx_token.aleo",
  ETHX_LEGACY:    "test_ethx_token.aleo",
  DARKPOOL:       import.meta.env.VITE_PROGRAM_DARKPOOL       || "privadex_darkpool_v4.aleo",
  DARKPOOL_BTCX:  import.meta.env.VITE_PROGRAM_DARKPOOL_BTCX  || "privadex_darkpool_btcx_v1.aleo",
  DARKPOOL_ETHX:  import.meta.env.VITE_PROGRAM_DARKPOOL_ETHX  || "privadex_darkpool_ethx_v1.aleo",
  DARKPOOL_BTCX_ETHX: import.meta.env.VITE_PROGRAM_DARKPOOL_BTCX_ETHX || "privadex_darkpool_btcx_ethx_v1.aleo",
  ORDERBOOK:      import.meta.env.VITE_PROGRAM_ORDERBOOK      || "privadex_orderbook_v4.aleo",
  ROUTER:         import.meta.env.VITE_PROGRAM_ROUTER         || "privadex_router_v2.aleo",
} as const;

// ─── Token Registry IDs ────────────────────────────────────────────────────
// field values matching on-chain register_token calls
export const REGISTRY_TOKEN_IDS = {
  BTCX: "201field",
  ETHX: "202field",
} as const;

// ─── Token functions ─────────────────────────────────────────────────────────
export const TOKEN_FNS = {
  INITIALIZE: "initialize",
  SET_ADMIN: "set_admin",
  SET_MINTER: "set_minter",
  SET_SUPPORTED_TOKEN: "set_supported_token",
  TRANSFER:  "transfer_private",
  TRANSFER_ALL: "transfer_private_all",
  WRAP:      "wrap",
  UNWRAP:    "unwrap",
  BURN:      "burn",
  JOIN:      "join",
  SPLIT:     "split",
} as const;

// ─── USDCx Token record functions ────────────────────────────────────────────
// Private Token record management (split, join are pure transitions — no finalize)
export const USDCX_FNS = {
  SPLIT:                    "split",
  JOIN:                     "join",
  TRANSFER_PRIVATE:         "transfer_private",
  TRANSFER_PRIVATE_TO_PUBLIC: "transfer_private_to_public",
  TRANSFER_PUBLIC_TO_PRIVATE: "transfer_public_to_private",
  MINT_PUBLIC:              "mint_public",
} as const;

// ─── AMM v7 functions (ALEO/USDCx) ────────────────────────────────────────
// ALEO: private credits records (transfer_private_to_public)
// USDCx: private Token records (transfer_private_to_public via MerkleProof)
export const AMM_FNS = {
  ADD_LIQUIDITY:        "add_liquidity",
  REMOVE_LIQUIDITY:     "remove_liquidity",
  SWAP_ALEO_FOR_USDCX:  "swap_aleo_for_usdcx",
  SWAP_USDCX_FOR_ALEO:  "swap_usdcx_for_aleo",
} as const;

// ─── AMM BTCx functions (BTCx/USDCx) ─────────────────────────────────────
export const AMM_BTCX_FNS = {
  ADD_LIQUIDITY:         "add_liquidity",
  REMOVE_LIQUIDITY:      "remove_liquidity",
  SWAP_BTCX_FOR_USDCX:  "swap_btcx_for_usdcx",
  SWAP_USDCX_FOR_BTCX:  "swap_usdcx_for_btcx",
} as const;

// ─── AMM ETHx functions (ETHx/USDCx) ─────────────────────────────────────
export const AMM_ETHX_FNS = {
  ADD_LIQUIDITY:         "add_liquidity",
  REMOVE_LIQUIDITY:      "remove_liquidity",
  SWAP_ETHX_FOR_USDCX:  "swap_ethx_for_usdcx",
  SWAP_USDCX_FOR_ETHX:  "swap_usdcx_for_ethx",
} as const;

// ─── AMM Native BTCx functions (ALEO/BTCx) ──────────────────────────────
export const AMM_NATIVE_BTCX_FNS = {
  ADD_LIQUIDITY:           "add_liquidity",
  REMOVE_LIQUIDITY:        "remove_liquidity",
  SWAP_NATIVE_FOR_BTCX:    "swap_native_for_btcx",
  SWAP_BTCX_FOR_NATIVE:    "swap_btcx_for_native",
} as const;

// ─── AMM Native ETHx functions (ALEO/ETHx) ──────────────────────────────
export const AMM_NATIVE_ETHX_FNS = {
  ADD_LIQUIDITY:           "add_liquidity",
  REMOVE_LIQUIDITY:        "remove_liquidity",
  SWAP_NATIVE_FOR_ETHX:    "swap_native_for_ethx",
  SWAP_ETHX_FOR_NATIVE:    "swap_ethx_for_native",
} as const;

// ─── AMM BTCx/ETHx functions ────────────────────────────────────────────
export const AMM_BTCX_ETHX_FNS = {
  ADD_LIQUIDITY:         "add_liquidity",
  REMOVE_LIQUIDITY:      "remove_liquidity",
  SWAP_BTCX_FOR_ETHX:   "swap_btcx_for_ethx",
  SWAP_ETHX_FOR_BTCX:   "swap_ethx_for_btcx",
} as const;

// ─── Dark Pool v3 functions ─────────────────────────────────────────────────
// ALEO: private credits records. USDCx: private Token records + MerkleProofs.
export const DARKPOOL_FNS = {
  INITIALIZE:       "initialize",
  SET_ADMIN:        "set_admin",
  SET_FEE_BPS:      "set_fee_bps",
  SUBMIT_SELL_ALEO: "submit_sell_aleo",
  SUBMIT_BUY_ALEO:  "submit_buy_aleo",
  SETTLE_EPOCH:     "settle_epoch",
  CLAIM_SELL_FILL:  "claim_sell_fill",
  CLAIM_BUY_FILL:   "claim_buy_fill",
  CANCEL_SELL:      "cancel_sell_intent",
  CANCEL_BUY:       "cancel_buy_intent",
} as const;

// ─── Order Book v3 functions ────────────────────────────────────────────────
// ALEO: private credits records. USDCx: private Token records + MerkleProofs.
export const ORDERBOOK_FNS = {
  INITIALIZE:         "initialize",
  SET_ADMIN:          "set_admin",
  SET_MATCHER:        "set_matcher",
  SET_FEE_BPS:        "set_fee_bps",
  PLACE_SELL_LIMIT:  "place_sell_limit",
  PLACE_BUY_LIMIT:   "place_buy_limit",
  FILL_SELL:         "fill_sell_order",
  FILL_BUY:          "fill_buy_order",
  CANCEL_SELL:       "cancel_sell_order",
  CANCEL_BUY:        "cancel_buy_order",
} as const;

// ─── Router functions ─────────────────────────────────────────────────────────
export const ROUTER_FNS = {
  INITIALIZE:      "initialize",
  SET_ADMIN:       "set_admin",
  SET_EXECUTOR:    "set_executor",
  SWAP_BTCX_FOR_ETHX_VIA_ALEO: "swap_btcx_for_ethx_via_aleo",
  SWAP_ETHX_FOR_BTCX_VIA_ALEO: "swap_ethx_for_btcx_via_aleo",
  SWAP_ALEO_FOR_BTCX_VIA_ETHX: "swap_aleo_for_btcx_via_ethx",
  SWAP_BTCX_FOR_ALEO_VIA_ETHX: "swap_btcx_for_aleo_via_ethx",
  SWAP_ALEO_FOR_ETHX_VIA_BTCX: "swap_aleo_for_ethx_via_btcx",
  SWAP_ETHX_FOR_ALEO_VIA_BTCX: "swap_ethx_for_aleo_via_btcx",
  SUBMIT_INTENT:   "submit_route_intent",
  EXECUTE_ROUTE:   "execute_route",
  FAIL_ROUTE:      "fail_route",
  CANCEL_INTENT:   "cancel_route_intent",
  QUOTE_BEST:      "quote_best_route",
} as const;

// ─── Pool IDs (matching Leo constants) ───────────────────────────────────────
export const POOL_IDS = {
  ALEO_USDC:  0,
  ETH_USDC:   1,
  WBTC_USDC:  2,
  ETH_ALEO:   3,
  ALEO_USDCX: 4,
  ETH_USDCX:  5,
  BTCX_USDCX:  6,
  ETHX_USDCX:  7,
  ALEO_BTCX:   8,
  ALEO_ETHX:   9,
  BTCX_ETHX:  10,
} as const;

// ─── Token IDs ───────────────────────────────────────────────────────────────
export const TOKEN_IDS = {
  ALEO:  0,
  USDC:  1,
  ETH:   2,
  WBTC:  3,
  USDCX: 4,
  BTCX:  5,
  ETHX:  6,
} as const;

// ─── Pool token type info ────────────────────────────────────────────────────
export type TokenType = "privadex" | "credits" | "usdcx" | "registry";

export const POOL_TOKEN_TYPES: Record<number, { a: TokenType; b: TokenType }> = {
  [POOL_IDS.ALEO_USDC]:  { a: "credits",  b: "privadex" },
  [POOL_IDS.ETH_USDC]:   { a: "privadex", b: "privadex" },
  [POOL_IDS.WBTC_USDC]:  { a: "privadex", b: "privadex" },
  [POOL_IDS.ETH_ALEO]:   { a: "privadex", b: "credits"  },
  [POOL_IDS.ALEO_USDCX]: { a: "credits",  b: "usdcx"    },
  [POOL_IDS.ETH_USDCX]:  { a: "privadex", b: "usdcx"    },
  [POOL_IDS.BTCX_USDCX]: { a: "registry", b: "usdcx"    },
  [POOL_IDS.ETHX_USDCX]: { a: "registry", b: "usdcx"    },
  [POOL_IDS.ALEO_BTCX]:  { a: "credits",  b: "registry"  },
  [POOL_IDS.ALEO_ETHX]:  { a: "credits",  b: "registry"  },
  [POOL_IDS.BTCX_ETHX]:  { a: "registry", b: "registry"  },
};

// ─── Per-pool AMM config ────────────────────────────────────────────────────
// Maps pool ID → which AMM program to call and swap function names per direction.
// tokenA is always the "base" token, tokenB is always "USDCx" (quote).
export interface PoolAmmConfig {
  program: string;               // AMM program ID
  symbolA: string;               // e.g. "ALEO", "BTCx", "ETHx"
  symbolB: string;               // always "USDCx"
  tokenProgram: string;          // program that holds Token A records (or "credits.aleo")
  swapAForB: string;             // function name: swap tokenA → tokenB
  swapBForA: string;             // function name: swap tokenB → tokenA
  addLiquidity: string;
  removeLiquidity: string;
  /** true if token A uses credits.aleo records (ALEO), false if simple Token records */
  tokenAIsCredits: boolean;
}

export const POOL_AMM_CONFIG: Record<number, PoolAmmConfig> = {
  [POOL_IDS.ALEO_USDCX]: {
    program: PROGRAMS.AMM,
    symbolA: "ALEO",
    symbolB: "USDCx",
    tokenProgram: "credits.aleo",
    swapAForB: AMM_FNS.SWAP_ALEO_FOR_USDCX,
    swapBForA: AMM_FNS.SWAP_USDCX_FOR_ALEO,
    addLiquidity: AMM_FNS.ADD_LIQUIDITY,
    removeLiquidity: AMM_FNS.REMOVE_LIQUIDITY,
    tokenAIsCredits: true,
  },
  [POOL_IDS.BTCX_USDCX]: {
    program: PROGRAMS.AMM_BTCX,
    symbolA: "BTCx",
    symbolB: "USDCx",
    tokenProgram: PROGRAMS.TOKEN_REGISTRY,
    swapAForB: AMM_BTCX_FNS.SWAP_BTCX_FOR_USDCX,
    swapBForA: AMM_BTCX_FNS.SWAP_USDCX_FOR_BTCX,
    addLiquidity: AMM_BTCX_FNS.ADD_LIQUIDITY,
    removeLiquidity: AMM_BTCX_FNS.REMOVE_LIQUIDITY,
    tokenAIsCredits: false,
  },
  [POOL_IDS.ETHX_USDCX]: {
    program: PROGRAMS.AMM_ETHX,
    symbolA: "ETHx",
    symbolB: "USDCx",
    tokenProgram: PROGRAMS.TOKEN_REGISTRY,
    swapAForB: AMM_ETHX_FNS.SWAP_ETHX_FOR_USDCX,
    swapBForA: AMM_ETHX_FNS.SWAP_USDCX_FOR_ETHX,
    addLiquidity: AMM_ETHX_FNS.ADD_LIQUIDITY,
    removeLiquidity: AMM_ETHX_FNS.REMOVE_LIQUIDITY,
    tokenAIsCredits: false,
  },
  [POOL_IDS.ALEO_BTCX]: {
    program: PROGRAMS.AMM_NATIVE_BTCX,
    symbolA: "ALEO",
    symbolB: "BTCx",
    tokenProgram: PROGRAMS.TOKEN_REGISTRY,
    swapAForB: AMM_NATIVE_BTCX_FNS.SWAP_NATIVE_FOR_BTCX,
    swapBForA: AMM_NATIVE_BTCX_FNS.SWAP_BTCX_FOR_NATIVE,
    addLiquidity: AMM_NATIVE_BTCX_FNS.ADD_LIQUIDITY,
    removeLiquidity: AMM_NATIVE_BTCX_FNS.REMOVE_LIQUIDITY,
    tokenAIsCredits: true,
  },
  [POOL_IDS.ALEO_ETHX]: {
    program: PROGRAMS.AMM_NATIVE_ETHX,
    symbolA: "ALEO",
    symbolB: "ETHx",
    tokenProgram: PROGRAMS.TOKEN_REGISTRY,
    swapAForB: AMM_NATIVE_ETHX_FNS.SWAP_NATIVE_FOR_ETHX,
    swapBForA: AMM_NATIVE_ETHX_FNS.SWAP_ETHX_FOR_NATIVE,
    addLiquidity: AMM_NATIVE_ETHX_FNS.ADD_LIQUIDITY,
    removeLiquidity: AMM_NATIVE_ETHX_FNS.REMOVE_LIQUIDITY,
    tokenAIsCredits: true,
  },
  [POOL_IDS.BTCX_ETHX]: {
    program: PROGRAMS.AMM_BTCX_ETHX,
    symbolA: "BTCx",
    symbolB: "ETHx",
    tokenProgram: PROGRAMS.TOKEN_REGISTRY,
    swapAForB: AMM_BTCX_ETHX_FNS.SWAP_BTCX_FOR_ETHX,
    swapBForA: AMM_BTCX_ETHX_FNS.SWAP_ETHX_FOR_BTCX,
    addLiquidity: AMM_BTCX_ETHX_FNS.ADD_LIQUIDITY,
    removeLiquidity: AMM_BTCX_ETHX_FNS.REMOVE_LIQUIDITY,
    tokenAIsCredits: false,
  },
};

// ─── MerkleProof placeholder for non-frozen addresses ────────────────────────
// Non-inclusion proof for an empty freeze list (sorted merkle tree).
// With all-zero siblings, depth=1 and max_leaf=1. Using leaf_index=1 triggers
// the "at max leaf" path which asserts owner > siblings[0] (always true for
// non-zero addresses). leaf_index=0 would require owner < siblings[0] which
// fails since siblings[0]=0field.
export const EMPTY_MERKLE_PROOF = `{
  siblings: [0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field, 0field],
  leaf_index: 1u32
}`;

export const EMPTY_MERKLE_PROOFS = `[${EMPTY_MERKLE_PROOF}, ${EMPTY_MERKLE_PROOF}]`;

const PARTIAL_CREDITS_ADD_LIQ_PROGRAMS = new Set([
  "privadex_amm_v10.aleo",
  "privadex_amm_native_btcx_v8.aleo",
  "privadex_amm_native_ethx_v8.aleo",
]);

export function supportsPartialCreditsAddLiquidity(program: string): boolean {
  return PARTIAL_CREDITS_ADD_LIQ_PROGRAMS.has(program);
}

export interface PoolSnapshotInputs {
  reserveA: bigint
  reserveB: bigint
  totalShares: bigint
  feesBps: number
}

function swapSnapshotArgs(snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>): string[] {
  return [
    `${snapshot.reserveA}u128`,
    `${snapshot.reserveB}u128`,
    `${snapshot.feesBps}u64`,
  ]
}

function liquiditySnapshotArgs(snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'totalShares'>): string[] {
  return [
    `${snapshot.reserveA}u128`,
    `${snapshot.reserveB}u128`,
    `${snapshot.totalShares}u128`,
  ]
}

function dualSwapSnapshotArgs(
  first: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  second: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
): string[] {
  return [
    ...swapSnapshotArgs(first),
    ...swapSnapshotArgs(second),
  ]
}

// ═══════════════════════════════════════════════════════════════════════════════
// AMM v7 Input builders — Private USDCx Token records + MerkleProofs
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build inputs for add_liquidity(credits_in, token_in, merkle_proofs, pool_id, amount_a, amount_b, reserve_a_snapshot, reserve_b_snapshot, total_shares_snapshot, min_shares)
 * ALEO: private credits record can be larger; contract spends amount_a and returns credits change
 * USDCx: private Token record → program's public balance (via MerkleProof)
 * recordIndices: [0, 1] — input[0] is credits record, input[1] is Token record
 */
export function buildAddLiquidityInputs(
  creditsRecord: string,
  tokenRecord: string,
  merkleProofs: string,
  poolId: number,
  amountA: bigint,
  amountB: bigint,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'totalShares'>,
  minShares: bigint,
): string[] {
  return [
    creditsRecord,
    tokenRecord,
    merkleProofs,
    `${poolId}u64`,
    `${amountA}u64`,
    `${amountB}u128`,
    ...liquiditySnapshotArgs(snapshot),
    `${minShares}u128`,
  ];
}

/**
 * Build inputs for remove_liquidity(lp_in, reserve_a_snapshot, reserve_b_snapshot, total_shares_snapshot, min_amount_a, min_amount_b)
 * ALEO: returned as private credits record
 * USDCx: returned as private Token record
 * recordIndices: [0] — input[0] is LP record
 */
export function buildRemoveLiquidityInputs(
  lpRecord: string,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'totalShares'>,
  minAmountA: bigint,   // microcredits (u64)
  minAmountB: bigint,   // micro-USDCx (u128)
): string[] {
  return [
    lpRecord,
    ...liquiditySnapshotArgs(snapshot),
    `${minAmountA}u64`,
    `${minAmountB}u128`,
  ];
}

/**
 * Build inputs for swap_aleo_for_usdcx(credits_in, pool_id, amount_in, reserve_a_snapshot, reserve_b_snapshot, fee_bps_snapshot, min_out)
 * ALEO in: private credits record can be larger; contract spends amount_in and returns credits change
 * USDCx out: returned as private Token record
 * recordIndices: [0] — input[0] is credits record
 */
export function buildSwapAleoForUsdcxInputs(
  creditsRecord: string,
  poolId: number,
  amountIn: bigint,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    creditsRecord,
    `${poolId}u64`,
    `${amountIn}u64`,
    ...swapSnapshotArgs(snapshot),
    `${minOut}u128`,
  ];
}

/**
 * Build inputs for swap_usdcx_for_aleo(token_in, merkle_proofs, pool_id, amount_in, reserve_a_snapshot, reserve_b_snapshot, fee_bps_snapshot, min_out)
 * USDCx in: private Token record → program's public balance (via MerkleProof)
 * ALEO out: returned as private credits record
 * recordIndices: [0] — input[0] is Token record
 */
export function buildSwapUsdcxForAleoInputs(
  tokenRecord: string,
  merkleProofs: string,
  poolId: number,
  amountIn: bigint,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    tokenRecord,
    merkleProofs,
    `${poolId}u64`,
    `${amountIn}u128`,
    ...swapSnapshotArgs(snapshot),
    `${minOut}u64`,
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Token-pair AMM Input builders (BTCx/USDCx, ETHx/USDCx)
// Token A: simple Token record (no MerkleProof)
// Token B: USDCx Token record (with MerkleProof)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build inputs for swap_<tokenA>_for_usdcx(token_in, pool_id, amount_in, reserve_a_snapshot, reserve_b_snapshot, fee_bps_snapshot, min_out)
 * Token A in: private Token record → program's public balance (simple)
 * USDCx out: program's public → user's private Token
 * recordIndices: [0]
 */
export function buildSwapTokenForUsdcxInputs(
  tokenRecord: string,
  poolId: number,
  amountIn: bigint,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    tokenRecord,
    `${poolId}u64`,
    `${amountIn}u128`,
    ...swapSnapshotArgs(snapshot),
    `${minOut}u128`,
  ];
}

/**
 * Build inputs for swap_usdcx_for_<tokenA>(usdcx_token, merkle_proofs, pool_id, amount_in, reserve_a_snapshot, reserve_b_snapshot, fee_bps_snapshot, min_out)
 * USDCx in: private Token record → program's public balance (via MerkleProof)
 * Token A out: program's public → user's private Token
 * recordIndices: [0]
 */
export function buildSwapUsdcxForTokenInputs(
  tokenRecord: string,
  merkleProofs: string,
  poolId: number,
  amountIn: bigint,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    tokenRecord,
    merkleProofs,
    `${poolId}u64`,
    `${amountIn}u128`,
    ...swapSnapshotArgs(snapshot),
    `${minOut}u128`,
  ];
}

/**
 * Build inputs for add_liquidity on token-pair AMM
 * add_liquidity(token_a_in, usdcx_in, merkle_proofs, pool_id, amount_a, amount_b, reserve_a_snapshot, reserve_b_snapshot, total_shares_snapshot, min_shares)
 * recordIndices: [0, 1]
 */
export function buildTokenPairAddLiquidityInputs(
  tokenARecord: string,
  usdcxRecord: string,
  merkleProofs: string,
  poolId: number,
  amountA: bigint,
  amountB: bigint,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'totalShares'>,
  minShares: bigint,
): string[] {
  return [
    tokenARecord,
    usdcxRecord,
    merkleProofs,
    `${poolId}u64`,
    `${amountA}u128`,
    `${amountB}u128`,
    ...liquiditySnapshotArgs(snapshot),
    `${minShares}u128`,
  ];
}

/**
 * Build inputs for remove_liquidity on token-pair AMM
 * remove_liquidity(lp_in, reserve_a_snapshot, reserve_b_snapshot, total_shares_snapshot, min_amount_a, min_amount_b)
 * Both amounts are u128 (unlike ALEO AMM where amount_a is u64)
 * recordIndices: [0]
 */
export function buildTokenPairRemoveLiquidityInputs(
  lpRecord: string,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'totalShares'>,
  minAmountA: bigint,
  minAmountB: bigint,
): string[] {
  return [
    lpRecord,
    ...liquiditySnapshotArgs(snapshot),
    `${minAmountA}u128`,
    `${minAmountB}u128`,
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Credits+Token AMM Input builders (ALEO/BTCx, ALEO/ETHx)
// Token A: ALEO credits record, Token B: simple Token record (no MerkleProof)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build inputs for add_liquidity(credits_in, token_in, pool_id, amount_a, amount_b, reserve_a_snapshot, reserve_b_snapshot, total_shares_snapshot, min_shares)
 * ALEO: private credits record can be larger; contract spends amount_a and returns change
 * Token B: private Token → program's public balance (simple, no MerkleProof)
 * recordIndices: [0, 1]
 */
export function buildCreditsTokenAddLiqInputs(
  creditsRecord: string,
  tokenRecord: string,
  poolId: number,
  amountA: bigint,
  amountB: bigint,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'totalShares'>,
  minShares: bigint,
): string[] {
  return [
    creditsRecord,
    tokenRecord,
    `${poolId}u64`,
    `${amountA}u64`,
    `${amountB}u128`,
    ...liquiditySnapshotArgs(snapshot),
    `${minShares}u128`,
  ];
}

/**
 * Build inputs for add_liquidity(credits_in, token_in, pool_id, amount_a, amount_b, expected_shares)
 * Used by native AMM versions that accept partial ALEO spend and return credits change.
 * recordIndices: [0, 1]
 */
export function buildCreditsTokenAddLiqInputsV4(
  creditsRecord: string,
  tokenRecord: string,
  poolId: number,
  amountA: bigint,
  amountB: bigint,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'totalShares'>,
  minShares: bigint,
): string[] {
  return buildCreditsTokenAddLiqInputs(
    creditsRecord,
    tokenRecord,
    poolId,
    amountA,
    amountB,
    snapshot,
    minShares,
  );
}

/**
 * Build inputs for swap_native_for_X(credits_in, pool_id, amount_in, reserve_a_snapshot, reserve_b_snapshot, fee_bps_snapshot, min_out)
 * ALEO in → Token out. recordIndices: [0]
 */
export function buildSwapNativeForTokenInputs(
  creditsRecord: string,
  poolId: number,
  amountIn: bigint,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    creditsRecord,
    `${poolId}u64`,
    `${amountIn}u64`,
    ...swapSnapshotArgs(snapshot),
    `${minOut}u128`,
  ];
}

/**
 * Build inputs for swap_X_for_native(token_in, pool_id, amount_in, reserve_a_snapshot, reserve_b_snapshot, fee_bps_snapshot, min_out_u64)
 * Token in → ALEO out. recordIndices: [0]
 */
export function buildSwapTokenForNativeInputs(
  tokenRecord: string,
  poolId: number,
  amountIn: bigint,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    tokenRecord,
    `${poolId}u64`,
    `${amountIn}u128`,
    ...swapSnapshotArgs(snapshot),
    `${minOut}u64`,
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Pure Token-pair AMM Input builders (BTCx/ETHx)
// Both sides: simple Token records (no MerkleProof, no credits)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build inputs for add_liquidity(token_a, token_b, pool_id, amount_a, amount_b, reserve_a_snapshot, reserve_b_snapshot, total_shares_snapshot, min_shares)
 * Both tokens: private → program's public (simple). recordIndices: [0, 1]
 */
export function buildPureTokenPairAddLiqInputs(
  tokenARecord: string,
  tokenBRecord: string,
  poolId: number,
  amountA: bigint,
  amountB: bigint,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'totalShares'>,
  minShares: bigint,
): string[] {
  return [
    tokenARecord,
    tokenBRecord,
    `${poolId}u64`,
    `${amountA}u128`,
    `${amountB}u128`,
    ...liquiditySnapshotArgs(snapshot),
    `${minShares}u128`,
  ];
}

/**
 * Build inputs for swap_X_for_Y(token_in, pool_id, amount_in, reserve_a_snapshot, reserve_b_snapshot, fee_bps_snapshot, min_out)
 * recordIndices: [0]
 */
export function buildPureTokenSwapInputs(
  tokenRecord: string,
  poolId: number,
  amountIn: bigint,
  snapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    tokenRecord,
    `${poolId}u64`,
    `${amountIn}u128`,
    ...swapSnapshotArgs(snapshot),
    `${minOut}u128`,
  ];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dark Pool v3 Input builders — Private USDCx Token records
// ═══════════════════════════════════════════════════════════════════════════════

/** Build inputs for submit_sell_aleo(credits_in, pool_id, min_out, nonce, epoch_id) — unchanged */
export function buildDarkSellAleoInputs(
  creditsRecord: string,
  poolId: number,
  minOut: bigint,
  nonce: bigint,
  epochId: number,
): string[] {
  return [
    creditsRecord,
    `${poolId}u64`,
    `${minOut}u128`,
    `${nonce}field`,
    `${epochId}u64`,
  ];
}

/**
 * Build inputs for submit_buy_aleo(token_in, merkle_proofs, pool_id, amount_in, min_out, nonce, epoch_id)
 * USDCx: private Token record → program's public balance (via MerkleProof)
 * recordIndices: [0] — input[0] is Token record
 */
export function buildDarkBuyAleoInputs(
  tokenRecord: string,
  merkleProofs: string,
  poolId: number,
  amountIn: bigint,
  minOut: bigint,
  nonce: bigint,
  epochId: number,
): string[] {
  return [
    tokenRecord,
    merkleProofs,
    `${poolId}u64`,
    `${amountIn}u128`,
    `${minOut}u128`,
    `${nonce}field`,
    `${epochId}u64`,
  ];
}

/** Build inputs for settle_epoch(pool_id, epoch_id, epoch_buy_volume_snapshot, epoch_sell_volume_snapshot, fee_bps_snapshot, res_a, res_b) */
export function buildDarkSettleInputs(
  poolId: number,
  epochId: number,
  buyVolume: bigint,
  sellVolume: bigint,
  feeBps: number,
  reserveA: bigint,
  reserveB: bigint,
): string[] {
  return [
    `${poolId}u64`,
    `${epochId}u64`,
    `${buyVolume}u128`,
    `${sellVolume}u128`,
    `${feeBps}u64`,
    `${reserveA}u128`,
    `${reserveB}u128`,
  ]
}

/** Build inputs for claim_sell_fill(intent, total_sell, matched_sell, matched_buy, mid_price, epoch_fee_bps) */
export function buildDarkSellClaimInputs(
  intentRecord: string,
  totalSell: bigint,
  matchedSell: bigint,
  matchedBuy: bigint,
  midPrice: bigint,
  feeBps: number,
): string[] {
  return [
    intentRecord,
    `${totalSell}u128`,
    `${matchedSell}u128`,
    `${matchedBuy}u128`,
    `${midPrice}u128`,
    `${feeBps}u64`,
  ]
}

/** Build inputs for claim_buy_fill(intent, total_buy, matched_sell, matched_buy, mid_price, epoch_fee_bps) */
export function buildDarkBuyClaimInputs(
  intentRecord: string,
  totalBuy: bigint,
  matchedSell: bigint,
  matchedBuy: bigint,
  midPrice: bigint,
  feeBps: number,
): string[] {
  return [
    intentRecord,
    `${totalBuy}u128`,
    `${matchedSell}u128`,
    `${matchedBuy}u128`,
    `${midPrice}u128`,
    `${feeBps}u64`,
  ]
}

// ═══════════════════════════════════════════════════════════════════════════════
// Order Book v3 Input builders — Private USDCx Token records
// ═══════════════════════════════════════════════════════════════════════════════

/** Build inputs for place_sell_limit(credits_in, pool_id, limit_price, expiry, nonce) — unchanged */
export function buildSellLimitInputs(
  creditsRecord: string,
  poolId: number,
  limitPrice: bigint,
  expiry: number,
  nonce: bigint,
): string[] {
  return [
    creditsRecord,
    `${poolId}u64`,
    `${limitPrice}u128`,
    `${expiry}u32`,
    `${nonce}field`,
  ];
}

/**
 * Build inputs for place_buy_limit(token_in, merkle_proofs, pool_id, amount_in, limit_price, expiry, nonce)
 * USDCx: private Token record → program's public balance (via MerkleProof)
 * recordIndices: [0] — input[0] is Token record
 */
export function buildBuyLimitInputs(
  tokenRecord: string,
  merkleProofs: string,
  poolId: number,
  amountIn: bigint,
  limitPrice: bigint,
  expiry: number,
  nonce: bigint,
): string[] {
  return [
    tokenRecord,
    merkleProofs,
    `${poolId}u64`,
    `${amountIn}u128`,
    `${limitPrice}u128`,
    `${expiry}u32`,
    `${nonce}field`,
  ];
}

/** Build inputs for fill_sell_order(order, fill_amount, execution_price, fee_bps_snapshot) */
export function buildFillSellOrderInputs(
  orderRecord: string,
  fillAmount: bigint,
  executionPrice: bigint,
  feeBps: number,
): string[] {
  return [
    orderRecord,
    `${fillAmount}u128`,
    `${executionPrice}u128`,
    `${feeBps}u64`,
  ]
}

/** Build inputs for fill_buy_order(order, fill_amount, execution_price, fee_bps_snapshot) */
export function buildFillBuyOrderInputs(
  orderRecord: string,
  fillAmount: bigint,
  executionPrice: bigint,
  feeBps: number,
): string[] {
  return [
    orderRecord,
    `${fillAmount}u128`,
    `${executionPrice}u128`,
    `${feeBps}u64`,
  ]
}

// ═══════════════════════════════════════════════════════════════════════════════
// Router atomic route builders
// ═══════════════════════════════════════════════════════════════════════════════

export function buildRouterBtcxForEthxViaAleoInputs(
  tokenRecord: string,
  amountIn: bigint,
  aleoBtcxSnapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  aleoEthxSnapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    tokenRecord,
    `${amountIn}u128`,
    ...dualSwapSnapshotArgs(aleoBtcxSnapshot, aleoEthxSnapshot),
    `${minOut}u128`,
  ]
}

export function buildRouterEthxForBtcxViaAleoInputs(
  tokenRecord: string,
  amountIn: bigint,
  aleoEthxSnapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  aleoBtcxSnapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    tokenRecord,
    `${amountIn}u128`,
    ...dualSwapSnapshotArgs(aleoEthxSnapshot, aleoBtcxSnapshot),
    `${minOut}u128`,
  ]
}

export function buildRouterAleoForBtcxViaEthxInputs(
  creditsRecord: string,
  amountIn: bigint,
  aleoEthxSnapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  btcxEthxSnapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    creditsRecord,
    `${amountIn}u64`,
    ...dualSwapSnapshotArgs(aleoEthxSnapshot, btcxEthxSnapshot),
    `${minOut}u128`,
  ]
}

export function buildRouterBtcxForAleoViaEthxInputs(
  tokenRecord: string,
  amountIn: bigint,
  btcxEthxSnapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  aleoEthxSnapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    tokenRecord,
    `${amountIn}u128`,
    ...dualSwapSnapshotArgs(btcxEthxSnapshot, aleoEthxSnapshot),
    `${minOut}u64`,
  ]
}

export function buildRouterAleoForEthxViaBtcxInputs(
  creditsRecord: string,
  amountIn: bigint,
  aleoBtcxSnapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  btcxEthxSnapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    creditsRecord,
    `${amountIn}u64`,
    ...dualSwapSnapshotArgs(aleoBtcxSnapshot, btcxEthxSnapshot),
    `${minOut}u128`,
  ]
}

export function buildRouterEthxForAleoViaBtcxInputs(
  tokenRecord: string,
  amountIn: bigint,
  btcxEthxSnapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  aleoBtcxSnapshot: Pick<PoolSnapshotInputs, 'reserveA' | 'reserveB' | 'feesBps'>,
  minOut: bigint,
): string[] {
  return [
    tokenRecord,
    `${amountIn}u128`,
    ...dualSwapSnapshotArgs(btcxEthxSnapshot, aleoBtcxSnapshot),
    `${minOut}u64`,
  ]
}

/** Resolve token ID from symbol */
export function tokenIdFromSymbol(symbol: string): number {
  return TOKEN_IDS[symbol as keyof typeof TOKEN_IDS] ?? 0;
}

/** Generate a random nonce as a field element string */
export function randomNonce(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let val = 0n;
  for (const b of bytes) val = (val << 8n) | BigInt(b);
  // Field modulus for BLS12-377 is ~2^251; mask to safe range
  return val & ((1n << 248n) - 1n);
}

/** Compute current epoch ID from block height (120 blocks per epoch) */
export function currentEpochId(blockHeight: number, epochDuration = 120): number {
  return Math.floor(blockHeight / epochDuration);
}

/** Compute expiry block height N epochs from now */
export function expiryInEpochs(blockHeight: number, epochs: number, epochDuration = 120): number {
  return blockHeight + epochs * epochDuration;
}

/** Scale a decimal price to 1e9 fixed-point bigint */
export function priceToFixed(price: number): bigint {
  return BigInt(Math.round(price * 1e9));
}

/** Unscale a 1e9 fixed-point bigint back to a number */
export function fixedToPrice(fixed: bigint): number {
  return Number(fixed) / 1e9;
}
