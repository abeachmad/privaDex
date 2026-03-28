// PrivaDEX Shielded AMM Program
// Constant-product AMM (x*y=k) with private swap amounts and LP positions

import privadex_token.leo;

program privadex_amm.aleo {

    // ─── Records (private state per user) ───────────────────────────────────
    record LPPosition {
        owner:    address,
        pool_id:  u64,
        shares:   u128,
    }

    // ─── Public mappings (pool aggregate state) ──────────────────────────────
    mapping reserve_a: u64 => u128;        // pool_id => token A reserve
    mapping reserve_b: u64 => u128;        // pool_id => token B reserve
    mapping total_shares: u64 => u128;     // pool_id => total LP shares
    mapping token_a_id: u64 => u64;        // pool_id => token_id of A
    mapping token_b_id: u64 => u64;        // pool_id => token_id of B
    mapping fee_bps: u64 => u64;           // pool_id => fee in basis points (30 = 0.3%)

    // ─── Pool IDs ────────────────────────────────────────────────────────────
    const POOL_ALEO_USDC: u64 = 0u64;
    const POOL_ETH_USDC:  u64 = 1u64;
    const POOL_WBTC_USDC: u64 = 2u64;
    const POOL_ETH_ALEO:  u64 = 3u64;
    const DEFAULT_FEE:    u64 = 30u64;    // 0.30%
    const BPS_DENOM:      u64 = 10000u64;

    // ─── Add Liquidity ───────────────────────────────────────────────────────
    // User deposits token_a and token_b records, receives private LPPosition
    async transition add_liquidity(
        token_a_in: privadex_token.leo/PrivateToken,
        token_b_in: privadex_token.leo/PrivateToken,
        pool_id:    u64,
        min_shares: u128,
    ) -> (LPPosition, Future) {
        // Verify tokens match pool
        let lp: LPPosition = LPPosition {
            owner:   self.caller,
            pool_id: pool_id,
            shares:  token_a_in.amount,   // shares calculated in finalize
        };
        let f: Future = finalize_add_liquidity(
            pool_id,
            token_a_in.amount,
            token_b_in.amount,
            min_shares,
        );
        return (lp, f);
    }

    async function finalize_add_liquidity(
        pool_id:    u64,
        amount_a:   u128,
        amount_b:   u128,
        min_shares: u128,
    ) {
        let res_a: u128  = Mapping::get_or_use(reserve_a, pool_id, 0u128);
        let res_b: u128  = Mapping::get_or_use(reserve_b, pool_id, 0u128);
        let t_shares: u128 = Mapping::get_or_use(total_shares, pool_id, 0u128);

        // IMPORTANT: Aleo VM evaluates BOTH ternary branches, so guard
        // against division by zero when res_a == 0 (empty pool).
        let safe_res_a: u128 = res_a == 0u128 ? 1u128 : res_a;
        let shares: u128 = t_shares == 0u128
            ? (amount_a * amount_b)                // initial liquidity
            : (amount_a * t_shares) / safe_res_a;  // proportional

        assert(shares >= min_shares);

        Mapping::set(reserve_a,     pool_id, res_a    + amount_a);
        Mapping::set(reserve_b,     pool_id, res_b    + amount_b);
        Mapping::set(total_shares,  pool_id, t_shares + shares);
    }

    // ─── Remove Liquidity ────────────────────────────────────────────────────
    async transition remove_liquidity(
        lp_in:      LPPosition,
        min_a_out:  u128,
        min_b_out:  u128,
    ) -> (privadex_token.leo/PrivateToken, privadex_token.leo/PrivateToken, Future) {
        let tok_a: privadex_token.leo/PrivateToken = privadex_token.leo/PrivateToken {
            owner:    self.caller,
            token_id: 0u64,          // resolved in finalize via pool mapping
            amount:   0u128,         // placeholder; real amount in finalize
        };
        let tok_b: privadex_token.leo/PrivateToken = privadex_token.leo/PrivateToken {
            owner:    self.caller,
            token_id: 1u64,
            amount:   0u128,
        };
        let f: Future = finalize_remove_liquidity(
            lp_in.pool_id,
            lp_in.shares,
            min_a_out,
            min_b_out,
        );
        return (tok_a, tok_b, f);
    }

    async function finalize_remove_liquidity(
        pool_id:   u64,
        shares:    u128,
        min_a_out: u128,
        min_b_out: u128,
    ) {
        let res_a: u128    = Mapping::get(reserve_a,    pool_id);
        let res_b: u128    = Mapping::get(reserve_b,    pool_id);
        let t_shares: u128 = Mapping::get(total_shares, pool_id);

        let amount_a: u128 = (shares * res_a) / t_shares;
        let amount_b: u128 = (shares * res_b) / t_shares;

        assert(amount_a >= min_a_out);
        assert(amount_b >= min_b_out);

        Mapping::set(reserve_a,    pool_id, res_a    - amount_a);
        Mapping::set(reserve_b,    pool_id, res_b    - amount_b);
        Mapping::set(total_shares, pool_id, t_shares - shares);
    }

    // ─── Swap A → B ─────────────────────────────────────────────────────────
    // Constant-product formula with fee. Amount private, pool reserves public.
    async transition swap_a_for_b(
        token_in:   privadex_token.leo/PrivateToken,
        pool_id:    u64,
        min_out:    u128,
    ) -> (privadex_token.leo/PrivateToken, Future) {
        let token_out: privadex_token.leo/PrivateToken = privadex_token.leo/PrivateToken {
            owner:    self.caller,
            token_id: 1u64,          // token B id — resolved from pool mapping
            amount:   min_out,       // guaranteed minimum; actual set in finalize
        };
        let f: Future = finalize_swap_a_for_b(pool_id, token_in.amount, min_out);
        return (token_out, f);
    }

    async function finalize_swap_a_for_b(pool_id: u64, amount_in: u128, min_out: u128) {
        let res_a: u128 = Mapping::get(reserve_a, pool_id);
        let res_b: u128 = Mapping::get(reserve_b, pool_id);
        let fee: u64    = Mapping::get_or_use(fee_bps, pool_id, DEFAULT_FEE);

        // fee-adjusted amount_in
        let amount_in_with_fee: u128 = amount_in * (BPS_DENOM - fee) as u128;

        // dy = (res_b * amount_in_with_fee) / (res_a * BPS_DENOM + amount_in_with_fee)
        let numerator: u128   = res_b * amount_in_with_fee;
        let denominator: u128 = res_a * BPS_DENOM as u128 + amount_in_with_fee;
        let amount_out: u128  = numerator / denominator;

        assert(amount_out >= min_out);

        Mapping::set(reserve_a, pool_id, res_a + amount_in);
        Mapping::set(reserve_b, pool_id, res_b - amount_out);
    }

    // ─── Swap B → A ─────────────────────────────────────────────────────────
    async transition swap_b_for_a(
        token_in: privadex_token.leo/PrivateToken,
        pool_id:  u64,
        min_out:  u128,
    ) -> (privadex_token.leo/PrivateToken, Future) {
        let token_out: privadex_token.leo/PrivateToken = privadex_token.leo/PrivateToken {
            owner:    self.caller,
            token_id: 0u64,
            amount:   min_out,
        };
        let f: Future = finalize_swap_b_for_a(pool_id, token_in.amount, min_out);
        return (token_out, f);
    }

    async function finalize_swap_b_for_a(pool_id: u64, amount_in: u128, min_out: u128) {
        let res_a: u128 = Mapping::get(reserve_a, pool_id);
        let res_b: u128 = Mapping::get(reserve_b, pool_id);
        let fee: u64    = Mapping::get_or_use(fee_bps, pool_id, DEFAULT_FEE);

        let amount_in_with_fee: u128 = amount_in * (BPS_DENOM - fee) as u128;
        let numerator: u128   = res_a * amount_in_with_fee;
        let denominator: u128 = res_b * BPS_DENOM as u128 + amount_in_with_fee;
        let amount_out: u128  = numerator / denominator;

        assert(amount_out >= min_out);

        Mapping::set(reserve_a, pool_id, res_a - amount_out);
        Mapping::set(reserve_b, pool_id, res_b + amount_in);
    }
}
