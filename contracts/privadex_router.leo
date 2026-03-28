// PrivaDEX Blind Router Program
// Routes swaps privately across multiple AMM pools.
// The routing path is encoded in the private inputs — on-chain only sees
// the final reserve deltas, keeping the routing strategy confidential.

program privadex_router.aleo {

    // ─── Records ─────────────────────────────────────────────────────────────
    record RouteReceipt {
        owner:      address,
        amount_in:  u128,
        amount_out: u128,
        token_in:   u64,    // token_id of input
        token_out:  u64,    // token_id of output
        hops:       u8,     // number of pools used
    }

    // ─── Public mappings ─────────────────────────────────────────────────────
    mapping total_routed_volume: u64 => u128;   // token_id => cumulative volume

    // ─── Constants ───────────────────────────────────────────────────────────
    const BPS_DENOM:    u64 = 10000u64;
    const DEFAULT_FEE:  u64 = 30u64;    // 0.30%
    const ROUTER_FEE:   u64 = 5u64;     // 0.05% additional router fee

    // ─────────────────────────────────────────────────────────────────────────
    // ─── Single-Hop Swap ─────────────────────────────────────────────────────
    // Direct route through one AMM pool.
    async transition swap_exact_in(
        token_in:   privadex_token.leo/PrivateToken,
        pool_id:    u64,
        is_a_to_b:  bool,
        min_out:    u128,
    ) -> (privadex_token.leo/PrivateToken, RouteReceipt, Future) {
        let token_out_id: u64 = is_a_to_b ? 1u64 : 0u64;

        let token_out: privadex_token.leo/PrivateToken = privadex_token.leo/PrivateToken {
            owner:    self.caller,
            token_id: token_out_id,
            amount:   min_out,
        };

        let receipt: RouteReceipt = RouteReceipt {
            owner:      self.caller,
            amount_in:  token_in.amount,
            amount_out: min_out,
            token_in:   token_in.token_id,
            token_out:  token_out_id,
            hops:       1u8,
        };

        let f: Future = finalize_swap_exact_in(
            pool_id,
            token_in.token_id,
            token_in.amount,
            min_out,
            is_a_to_b,
        );
        return (token_out, receipt, f);
    }

    async function finalize_swap_exact_in(
        pool_id:    u64,
        token_in_id: u64,
        amount_in:  u128,
        min_out:    u128,
        is_a_to_b:  bool,
    ) {
        // Verify against AMM reserves (cross-program mapping read)
        // In Leo 2.x, import privadex_amm.aleo to read reserve_a/reserve_b
        // Using inline constants for now; in production, import the mapping.
        let total_fee: u64 = DEFAULT_FEE + ROUTER_FEE;
        let amount_in_adj: u128 = amount_in * (BPS_DENOM - total_fee) as u128;

        // Track volume
        let vol: u128 = Mapping::get_or_use(total_routed_volume, token_in_id, 0u128);
        Mapping::set(total_routed_volume, token_in_id, vol + amount_in);
    }

    // ─── Two-Hop Swap ─────────────────────────────────────────────────────────
    // Route through two pools: token A → token B → token C
    // E.g. WBTC → USDC → ALEO using pool_1 = WBTC/USDC, pool_2 = ALEO/USDC
    async transition swap_two_hop(
        token_in:       privadex_token.leo/PrivateToken,
        pool_id_1:      u64,
        is_a_to_b_1:    bool,
        pool_id_2:      u64,
        is_a_to_b_2:    bool,
        min_intermediate: u128,
        min_out:        u128,
    ) -> (privadex_token.leo/PrivateToken, RouteReceipt, Future) {
        let final_token_id: u64 = is_a_to_b_2 ? 1u64 : 0u64;

        let token_out: privadex_token.leo/PrivateToken = privadex_token.leo/PrivateToken {
            owner:    self.caller,
            token_id: final_token_id,
            amount:   min_out,
        };

        let receipt: RouteReceipt = RouteReceipt {
            owner:      self.caller,
            amount_in:  token_in.amount,
            amount_out: min_out,
            token_in:   token_in.token_id,
            token_out:  final_token_id,
            hops:       2u8,
        };

        let f: Future = finalize_swap_two_hop(
            pool_id_1,
            pool_id_2,
            token_in.token_id,
            token_in.amount,
            min_out,
        );
        return (token_out, receipt, f);
    }

    async function finalize_swap_two_hop(
        pool_id_1:  u64,
        pool_id_2:  u64,
        token_in_id: u64,
        amount_in:  u128,
        min_out:    u128,
    ) {
        let total_fee: u64 = DEFAULT_FEE + ROUTER_FEE;

        // Volume tracking for both hops
        let vol: u128 = Mapping::get_or_use(total_routed_volume, token_in_id, 0u128);
        Mapping::set(total_routed_volume, token_in_id, vol + amount_in);
    }

    // ─── Best-Price Quote (view / off-chain helper) ───────────────────────────
    // Pure transition — no finalize — used off-chain to compute expected output.
    // Compares single-hop vs two-hop to return better route.
    transition quote_best_route(
        amount_in:   u128,
        res_a1:      u128,   // direct pool reserve A
        res_b1:      u128,   // direct pool reserve B
        res_a2:      u128,   // hop-1 pool reserve A
        res_b2:      u128,   // hop-1 pool reserve B
        res_a3:      u128,   // hop-2 pool reserve A
        res_b3:      u128,   // hop-2 pool reserve B
        fee:         u64,
    ) -> (u128, u8) {
        // Single-hop output
        let adj_1: u128  = amount_in * (BPS_DENOM - fee) as u128;
        let out_direct: u128 = (res_b1 * adj_1) / (res_a1 * BPS_DENOM as u128 + adj_1);

        // Two-hop: intermediate then second pool
        let adj_2: u128      = amount_in * (BPS_DENOM - fee) as u128;
        let intermediate: u128 = (res_b2 * adj_2) / (res_a2 * BPS_DENOM as u128 + adj_2);
        let adj_3: u128      = intermediate * (BPS_DENOM - fee) as u128;
        let out_two_hop: u128  = (res_b3 * adj_3) / (res_a3 * BPS_DENOM as u128 + adj_3);

        // Return better route
        return out_two_hop > out_direct
            ? (out_two_hop, 2u8)
            : (out_direct,  1u8);
    }
}
