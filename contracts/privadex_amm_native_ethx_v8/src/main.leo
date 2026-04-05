// PrivaDEX AMM — ALEO/ETHx Trading Pair (v3: token_registry)
// Constant-product AMM (x*y=k) with LP positions
//
// Hardening changes:
//   - Credits inputs now spend explicit amounts and return change.
//   - Swaps compute and pay exact output from a verified pool snapshot.
//   - Finalize rejects stale quotes by re-checking reserves and fee on-chain.
//   - LP share minting uses both sides of liquidity.
//   - Pool tracks cumulative swap input volume and accrued fees.

import credits.aleo;
import token_registry.aleo;

program privadex_amm_native_ethx_v8.aleo {

    @noupgrade
    constructor() {}

    const ETHX_TOKEN_ID: field = 202field;

    const DEFAULT_FEE: u64 = 30u64;
    const BPS_DENOM: u64 = 10000u64;

    record LPPosition {
        owner: address,
        pool_id: u64,
        shares: u128,
    }

    mapping reserve_a: u64 => u128;
    mapping reserve_b: u64 => u128;
    mapping total_shares: u64 => u128;
    mapping fee_bps: u64 => u64;
    mapping cumulative_volume_a: u64 => u128;
    mapping cumulative_volume_b: u64 => u128;
    mapping cumulative_fee_a: u64 => u128;
    mapping cumulative_fee_b: u64 => u128;
    mapping last_swap_block: u64 => u32;

    // ASSERT POOL SNAPSHOT (used by dark pool for price verification)
    fn assert_pool_snapshot(
        pool_id: u64,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        fee_bps_snapshot: u64,
    ) -> Final {
        return final {
            let live_reserve_a: u128 = Mapping::get_or_use(reserve_a, pool_id, 0u128);
            let live_reserve_b: u128 = Mapping::get_or_use(reserve_b, pool_id, 0u128);
            let live_fee: u64 = Mapping::get_or_use(fee_bps, pool_id, DEFAULT_FEE);

            assert(live_reserve_a == reserve_a_snapshot);
            assert(live_reserve_b == reserve_b_snapshot);
            assert(live_fee == fee_bps_snapshot);
        };
    }

    // ADD LIQUIDITY
    fn add_liquidity(
        credits_in: credits.aleo::credits,
        ethx_in: token_registry.aleo::Token,
        pool_id: u64,
        amount_a: u64,
        amount_b: u128,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        total_shares_snapshot: u128,
        min_shares: u128,
    ) -> (LPPosition, credits.aleo::credits, token_registry.aleo::Token, Final) {
        assert(amount_a > 0u64);
        assert(amount_b > 0u128);
        assert(ethx_in.token_id == ETHX_TOKEN_ID);
        assert(credits_in.microcredits >= amount_a);

        let deposit_a: u128 = amount_a as u128;
        let is_initial: bool = total_shares_snapshot == 0u128;
        if is_initial {
            assert(reserve_a_snapshot == 0u128);
            assert(reserve_b_snapshot == 0u128);
        } else {
            assert(reserve_a_snapshot > 0u128);
            assert(reserve_b_snapshot > 0u128);
        }

        let shares_from_a: u128 = is_initial
            ? (deposit_a * amount_b)
            : (deposit_a * total_shares_snapshot) / (reserve_a_snapshot > 0u128 ? reserve_a_snapshot : 1u128);
        let shares_from_b: u128 = is_initial
            ? (deposit_a * amount_b)
            : (amount_b * total_shares_snapshot) / (reserve_b_snapshot > 0u128 ? reserve_b_snapshot : 1u128);
        let actual_shares: u128 = shares_from_a <= shares_from_b ? shares_from_a : shares_from_b;
        assert(actual_shares > 0u128);
        assert(actual_shares >= min_shares);

        let (change_a, f_ea): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(
                credits_in, self.address, amount_a
            );
        let (change_b, f_eb): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private_to_public(
                self.address, amount_b, ethx_in
            );

        let lp: LPPosition = LPPosition {
            owner: self.signer,
            pool_id: pool_id,
            shares: actual_shares,
        };

        return (lp, change_a, change_b, final {
            f_ea.run();
            f_eb.run();

            let live_reserve_a: u128 = Mapping::get_or_use(reserve_a, pool_id, 0u128);
            let live_reserve_b: u128 = Mapping::get_or_use(reserve_b, pool_id, 0u128);
            let live_total_shares: u128 = Mapping::get_or_use(total_shares, pool_id, 0u128);

            assert(live_reserve_a == reserve_a_snapshot);
            assert(live_reserve_b == reserve_b_snapshot);
            assert(live_total_shares == total_shares_snapshot);
            assert(actual_shares > 0u128);

            Mapping::set(reserve_a, pool_id, reserve_a_snapshot + deposit_a);
            Mapping::set(reserve_b, pool_id, reserve_b_snapshot + amount_b);
            Mapping::set(total_shares, pool_id, total_shares_snapshot + actual_shares);
        });
    }

    // REMOVE LIQUIDITY
    fn remove_liquidity(
        lp_in: LPPosition,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        total_shares_snapshot: u128,
        min_amount_a: u64,
        min_amount_b: u128,
    ) -> (credits.aleo::credits, token_registry.aleo::Token, Final) {
        assert(lp_in.shares > 0u128);
        assert(total_shares_snapshot > 0u128);
        assert(lp_in.shares <= total_shares_snapshot);

        let amount_a: u128 = (lp_in.shares * reserve_a_snapshot) / total_shares_snapshot;
        let amount_b: u128 = (lp_in.shares * reserve_b_snapshot) / total_shares_snapshot;
        let lp_pool_id: u64 = lp_in.pool_id;
        let lp_shares: u128 = lp_in.shares;

        assert(amount_a >= min_amount_a as u128);
        assert(amount_b >= min_amount_b);

        let (credits_out, f_ta): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(self.caller, amount_a as u64);
        let (ethx_out, f_tb): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(
                ETHX_TOKEN_ID, self.caller, amount_b, false
            );

        return (credits_out, ethx_out, final {
            f_ta.run();
            f_tb.run();

            let live_reserve_a: u128 = Mapping::get(reserve_a, lp_pool_id);
            let live_reserve_b: u128 = Mapping::get(reserve_b, lp_pool_id);
            let live_total_shares: u128 = Mapping::get(total_shares, lp_pool_id);

            assert(live_reserve_a == reserve_a_snapshot);
            assert(live_reserve_b == reserve_b_snapshot);
            assert(live_total_shares == total_shares_snapshot);

            Mapping::set(reserve_a, lp_pool_id, reserve_a_snapshot - amount_a);
            Mapping::set(reserve_b, lp_pool_id, reserve_b_snapshot - amount_b);
            Mapping::set(total_shares, lp_pool_id, total_shares_snapshot - lp_shares);
        });
    }

    // SWAP ALEO -> ETHx
    fn swap_native_for_ethx(
        credits_in: credits.aleo::credits,
        pool_id: u64,
        amount_in: u64,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        fee_bps_snapshot: u64,
        min_out: u128,
    ) -> (credits.aleo::credits, token_registry.aleo::Token, Final) {
        assert(amount_in > 0u64);
        assert(credits_in.microcredits >= amount_in);
        assert(reserve_a_snapshot > 0u128);
        assert(reserve_b_snapshot > 0u128);

        let amount_in_u128: u128 = amount_in as u128;
        let effective_fee: u64 = fee_bps_snapshot == 0u64 ? DEFAULT_FEE : fee_bps_snapshot;
        let adjusted_in: u128 = amount_in_u128 * (BPS_DENOM - effective_fee) as u128;
        let amount_out: u128 = (reserve_b_snapshot * adjusted_in) / (reserve_a_snapshot * BPS_DENOM as u128 + adjusted_in);

        assert(amount_out >= min_out);

        let (change_a, f_escrow): (credits.aleo::credits, Final) =
            credits.aleo::transfer_private_to_public(credits_in, self.address, amount_in);
        let (ethx_out, f_send): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(
                ETHX_TOKEN_ID, self.caller, amount_out, false
            );

        let fee_amount: u128 = (amount_in_u128 * effective_fee as u128) / BPS_DENOM as u128;
        return (change_a, ethx_out, final {
            f_escrow.run();
            f_send.run();

            let live_reserve_a: u128 = Mapping::get(reserve_a, pool_id);
            let live_reserve_b: u128 = Mapping::get(reserve_b, pool_id);
            let live_fee: u64 = Mapping::get_or_use(fee_bps, pool_id, DEFAULT_FEE);

            assert(live_reserve_a == reserve_a_snapshot);
            assert(live_reserve_b == reserve_b_snapshot);
            assert(live_fee == effective_fee);

            Mapping::set(reserve_a, pool_id, reserve_a_snapshot + amount_in_u128);
            Mapping::set(reserve_b, pool_id, reserve_b_snapshot - amount_out);

            let cumulative_a: u128 = Mapping::get_or_use(cumulative_volume_a, pool_id, 0u128);
            let fee_total_a: u128 = Mapping::get_or_use(cumulative_fee_a, pool_id, 0u128);
            Mapping::set(cumulative_volume_a, pool_id, cumulative_a + amount_in_u128);
            Mapping::set(cumulative_fee_a, pool_id, fee_total_a + fee_amount);
            Mapping::set(last_swap_block, pool_id, block.height);
        });
    }

    // SWAP ETHx -> ALEO
    fn swap_ethx_for_native(
        ethx_in: token_registry.aleo::Token,
        pool_id: u64,
        amount_in: u128,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        fee_bps_snapshot: u64,
        min_out: u64,
    ) -> (token_registry.aleo::Token, credits.aleo::credits, Final) {
        assert(amount_in > 0u128);
        assert(ethx_in.token_id == ETHX_TOKEN_ID);
        assert(reserve_a_snapshot > 0u128);
        assert(reserve_b_snapshot > 0u128);

        let effective_fee: u64 = fee_bps_snapshot == 0u64 ? DEFAULT_FEE : fee_bps_snapshot;
        let adjusted_in: u128 = amount_in * (BPS_DENOM - effective_fee) as u128;
        let amount_out: u128 = (reserve_a_snapshot * adjusted_in) / (reserve_b_snapshot * BPS_DENOM as u128 + adjusted_in);

        assert(amount_out >= min_out as u128);

        let (change_ethx, f_escrow): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private_to_public(
                self.address, amount_in, ethx_in
            );
        let (credits_out, f_send): (credits.aleo::credits, Final) =
            credits.aleo::transfer_public_to_private(self.caller, amount_out as u64);

        let fee_amount: u128 = (amount_in * effective_fee as u128) / BPS_DENOM as u128;
        return (change_ethx, credits_out, final {
            f_escrow.run();
            f_send.run();

            let live_reserve_a: u128 = Mapping::get(reserve_a, pool_id);
            let live_reserve_b: u128 = Mapping::get(reserve_b, pool_id);
            let live_fee: u64 = Mapping::get_or_use(fee_bps, pool_id, DEFAULT_FEE);

            assert(live_reserve_a == reserve_a_snapshot);
            assert(live_reserve_b == reserve_b_snapshot);
            assert(live_fee == effective_fee);

            Mapping::set(reserve_a, pool_id, reserve_a_snapshot - amount_out);
            Mapping::set(reserve_b, pool_id, reserve_b_snapshot + amount_in);

            let cumulative_b: u128 = Mapping::get_or_use(cumulative_volume_b, pool_id, 0u128);
            let fee_total_b: u128 = Mapping::get_or_use(cumulative_fee_b, pool_id, 0u128);
            Mapping::set(cumulative_volume_b, pool_id, cumulative_b + amount_in);
            Mapping::set(cumulative_fee_b, pool_id, fee_total_b + fee_amount);
            Mapping::set(last_swap_block, pool_id, block.height);
        });
    }
}
