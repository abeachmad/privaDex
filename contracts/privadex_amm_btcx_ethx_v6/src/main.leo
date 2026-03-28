// PrivaDEX AMM — BTCx/ETHx Trading Pair (v3: token_registry)
// Constant-product AMM (x*y=k) with LP positions
//
// Hardening changes:
//   - Swaps compute and pay exact output from a frontend-provided pool snapshot.
//   - Finalize re-checks the live pool state against the snapshot to reject stale quotes.
//   - LP share minting is derived from both sides of liquidity, not only token A.
//   - Pool tracks cumulative swap input volume and accrued fees per side.

import token_registry.aleo;

program privadex_amm_btcx_ethx_v6.aleo {

    @noupgrade
    async constructor() {}

    const BTCX_TOKEN_ID: field = 201field;
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

    // ADD LIQUIDITY
    async transition add_liquidity(
        btcx_in: token_registry.aleo/Token,
        ethx_in: token_registry.aleo/Token,
        pool_id: u64,
        amount_a: u128,
        amount_b: u128,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        total_shares_snapshot: u128,
        min_shares: u128,
    ) -> (LPPosition, token_registry.aleo/Token, token_registry.aleo/Token, Future) {
        assert(amount_a > 0u128);
        assert(amount_b > 0u128);
        assert(btcx_in.token_id == BTCX_TOKEN_ID);
        assert(ethx_in.token_id == ETHX_TOKEN_ID);

        let is_initial: bool = total_shares_snapshot == 0u128;
        if is_initial {
            assert(reserve_a_snapshot == 0u128);
            assert(reserve_b_snapshot == 0u128);
        } else {
            assert(reserve_a_snapshot > 0u128);
            assert(reserve_b_snapshot > 0u128);
        }

        let shares_from_a: u128 = is_initial
            ? (amount_a * amount_b)
            : (amount_a * total_shares_snapshot) / (reserve_a_snapshot > 0u128 ? reserve_a_snapshot : 1u128);
        let shares_from_b: u128 = is_initial
            ? (amount_a * amount_b)
            : (amount_b * total_shares_snapshot) / (reserve_b_snapshot > 0u128 ? reserve_b_snapshot : 1u128);
        let actual_shares: u128 = shares_from_a <= shares_from_b ? shares_from_a : shares_from_b;
        assert(actual_shares > 0u128);
        assert(actual_shares >= min_shares);

        let (change_a, f_ea): (token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_private_to_public(
                self.address, amount_a, btcx_in
            );
        let (change_b, f_eb): (token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_private_to_public(
                self.address, amount_b, ethx_in
            );

        let lp: LPPosition = LPPosition {
            owner: self.signer,
            pool_id: pool_id,
            shares: actual_shares,
        };

        let f: Future = finalize_add_liq(
            pool_id,
            amount_a,
            amount_b,
            reserve_a_snapshot,
            reserve_b_snapshot,
            total_shares_snapshot,
            actual_shares,
            f_ea,
            f_eb,
        );
        return (lp, change_a, change_b, f);
    }

    async function finalize_add_liq(
        pool_id: u64,
        amount_a: u128,
        amount_b: u128,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        total_shares_snapshot: u128,
        minted_shares: u128,
        f_ea: Future,
        f_eb: Future,
    ) {
        f_ea.await();
        f_eb.await();

        let live_reserve_a: u128 = Mapping::get_or_use(reserve_a, pool_id, 0u128);
        let live_reserve_b: u128 = Mapping::get_or_use(reserve_b, pool_id, 0u128);
        let live_total_shares: u128 = Mapping::get_or_use(total_shares, pool_id, 0u128);

        assert(live_reserve_a == reserve_a_snapshot);
        assert(live_reserve_b == reserve_b_snapshot);
        assert(live_total_shares == total_shares_snapshot);
        assert(minted_shares > 0u128);

        Mapping::set(reserve_a, pool_id, reserve_a_snapshot + amount_a);
        Mapping::set(reserve_b, pool_id, reserve_b_snapshot + amount_b);
        Mapping::set(total_shares, pool_id, total_shares_snapshot + minted_shares);
    }

    // REMOVE LIQUIDITY
    async transition remove_liquidity(
        lp_in: LPPosition,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        total_shares_snapshot: u128,
        min_amount_a: u128,
        min_amount_b: u128,
    ) -> (token_registry.aleo/Token, token_registry.aleo/Token, Future) {
        assert(lp_in.shares > 0u128);
        assert(total_shares_snapshot > 0u128);
        assert(lp_in.shares <= total_shares_snapshot);

        let amount_a: u128 = (lp_in.shares * reserve_a_snapshot) / total_shares_snapshot;
        let amount_b: u128 = (lp_in.shares * reserve_b_snapshot) / total_shares_snapshot;

        assert(amount_a >= min_amount_a);
        assert(amount_b >= min_amount_b);

        let (btcx_out, f_ta): (token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_public_to_private(
                BTCX_TOKEN_ID, self.caller, amount_a, false
            );
        let (ethx_out, f_tb): (token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_public_to_private(
                ETHX_TOKEN_ID, self.caller, amount_b, false
            );

        let f: Future = finalize_remove_liq(
            lp_in.pool_id,
            lp_in.shares,
            reserve_a_snapshot,
            reserve_b_snapshot,
            total_shares_snapshot,
            amount_a,
            amount_b,
            f_ta,
            f_tb,
        );
        return (btcx_out, ethx_out, f);
    }

    async function finalize_remove_liq(
        pool_id: u64,
        shares: u128,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        total_shares_snapshot: u128,
        amount_a: u128,
        amount_b: u128,
        f_ta: Future,
        f_tb: Future,
    ) {
        f_ta.await();
        f_tb.await();

        let live_reserve_a: u128 = Mapping::get(reserve_a, pool_id);
        let live_reserve_b: u128 = Mapping::get(reserve_b, pool_id);
        let live_total_shares: u128 = Mapping::get(total_shares, pool_id);

        assert(live_reserve_a == reserve_a_snapshot);
        assert(live_reserve_b == reserve_b_snapshot);
        assert(live_total_shares == total_shares_snapshot);

        Mapping::set(reserve_a, pool_id, reserve_a_snapshot - amount_a);
        Mapping::set(reserve_b, pool_id, reserve_b_snapshot - amount_b);
        Mapping::set(total_shares, pool_id, total_shares_snapshot - shares);
    }

    // SWAP BTCx -> ETHx
    async transition swap_btcx_for_ethx(
        btcx_in: token_registry.aleo/Token,
        pool_id: u64,
        amount_in: u128,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        fee_bps_snapshot: u64,
        min_out: u128,
    ) -> (token_registry.aleo/Token, token_registry.aleo/Token, Future) {
        assert(amount_in > 0u128);
        assert(btcx_in.token_id == BTCX_TOKEN_ID);
        assert(reserve_a_snapshot > 0u128);
        assert(reserve_b_snapshot > 0u128);

        let effective_fee: u64 = fee_bps_snapshot == 0u64 ? DEFAULT_FEE : fee_bps_snapshot;
        let adjusted_in: u128 = amount_in * (BPS_DENOM - effective_fee) as u128;
        let amount_out: u128 = (reserve_b_snapshot * adjusted_in) / (reserve_a_snapshot * BPS_DENOM as u128 + adjusted_in);

        assert(amount_out >= min_out);

        let (change_btcx, f_escrow): (token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_private_to_public(
                self.address, amount_in, btcx_in
            );
        let (ethx_out, f_send): (token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_public_to_private(
                ETHX_TOKEN_ID, self.caller, amount_out, false
            );

        let fee_amount: u128 = (amount_in * effective_fee as u128) / BPS_DENOM as u128;
        let f: Future = finalize_swap_btcx_ethx(
            pool_id,
            amount_in,
            amount_out,
            reserve_a_snapshot,
            reserve_b_snapshot,
            effective_fee,
            fee_amount,
            f_escrow,
            f_send,
        );
        return (change_btcx, ethx_out, f);
    }

    async function finalize_swap_btcx_ethx(
        pool_id: u64,
        amount_in: u128,
        amount_out: u128,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        fee_bps_snapshot: u64,
        fee_amount: u128,
        f_escrow: Future,
        f_send: Future,
    ) {
        f_escrow.await();
        f_send.await();

        let live_reserve_a: u128 = Mapping::get(reserve_a, pool_id);
        let live_reserve_b: u128 = Mapping::get(reserve_b, pool_id);
        let live_fee: u64 = Mapping::get_or_use(fee_bps, pool_id, DEFAULT_FEE);

        assert(live_reserve_a == reserve_a_snapshot);
        assert(live_reserve_b == reserve_b_snapshot);
        assert(live_fee == fee_bps_snapshot);

        Mapping::set(reserve_a, pool_id, reserve_a_snapshot + amount_in);
        Mapping::set(reserve_b, pool_id, reserve_b_snapshot - amount_out);

        let cumulative_a: u128 = Mapping::get_or_use(cumulative_volume_a, pool_id, 0u128);
        let fee_total_a: u128 = Mapping::get_or_use(cumulative_fee_a, pool_id, 0u128);
        Mapping::set(cumulative_volume_a, pool_id, cumulative_a + amount_in);
        Mapping::set(cumulative_fee_a, pool_id, fee_total_a + fee_amount);
        Mapping::set(last_swap_block, pool_id, block.height);
    }

    // SWAP ETHx -> BTCx
    async transition swap_ethx_for_btcx(
        ethx_in: token_registry.aleo/Token,
        pool_id: u64,
        amount_in: u128,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        fee_bps_snapshot: u64,
        min_out: u128,
    ) -> (token_registry.aleo/Token, token_registry.aleo/Token, Future) {
        assert(amount_in > 0u128);
        assert(ethx_in.token_id == ETHX_TOKEN_ID);
        assert(reserve_a_snapshot > 0u128);
        assert(reserve_b_snapshot > 0u128);

        let effective_fee: u64 = fee_bps_snapshot == 0u64 ? DEFAULT_FEE : fee_bps_snapshot;
        let adjusted_in: u128 = amount_in * (BPS_DENOM - effective_fee) as u128;
        let amount_out: u128 = (reserve_a_snapshot * adjusted_in) / (reserve_b_snapshot * BPS_DENOM as u128 + adjusted_in);

        assert(amount_out >= min_out);

        let (change_ethx, f_escrow): (token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_private_to_public(
                self.address, amount_in, ethx_in
            );
        let (btcx_out, f_send): (token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_public_to_private(
                BTCX_TOKEN_ID, self.caller, amount_out, false
            );

        let fee_amount: u128 = (amount_in * effective_fee as u128) / BPS_DENOM as u128;
        let f: Future = finalize_swap_ethx_btcx(
            pool_id,
            amount_in,
            amount_out,
            reserve_a_snapshot,
            reserve_b_snapshot,
            effective_fee,
            fee_amount,
            f_escrow,
            f_send,
        );
        return (change_ethx, btcx_out, f);
    }

    async function finalize_swap_ethx_btcx(
        pool_id: u64,
        amount_in: u128,
        amount_out: u128,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        fee_bps_snapshot: u64,
        fee_amount: u128,
        f_escrow: Future,
        f_send: Future,
    ) {
        f_escrow.await();
        f_send.await();

        let live_reserve_a: u128 = Mapping::get(reserve_a, pool_id);
        let live_reserve_b: u128 = Mapping::get(reserve_b, pool_id);
        let live_fee: u64 = Mapping::get_or_use(fee_bps, pool_id, DEFAULT_FEE);

        assert(live_reserve_a == reserve_a_snapshot);
        assert(live_reserve_b == reserve_b_snapshot);
        assert(live_fee == fee_bps_snapshot);

        Mapping::set(reserve_a, pool_id, reserve_a_snapshot - amount_out);
        Mapping::set(reserve_b, pool_id, reserve_b_snapshot + amount_in);

        let cumulative_b: u128 = Mapping::get_or_use(cumulative_volume_b, pool_id, 0u128);
        let fee_total_b: u128 = Mapping::get_or_use(cumulative_fee_b, pool_id, 0u128);
        Mapping::set(cumulative_volume_b, pool_id, cumulative_b + amount_in);
        Mapping::set(cumulative_fee_b, pool_id, fee_total_b + fee_amount);
        Mapping::set(last_swap_block, pool_id, block.height);
    }
}
