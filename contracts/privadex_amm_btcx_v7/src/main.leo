// PrivaDEX AMM — BTCx/USDCx Trading Pair (v3: token_registry)
// Constant-product AMM (x*y=k) with LP positions
//
// Hardening changes:
//   - Swaps compute and pay exact output from a verified pool snapshot.
//   - Finalize rejects stale quotes by re-checking reserves and fee on-chain.
//   - LP share minting uses both sides of liquidity.
//   - Pool tracks cumulative swap input volume and accrued fees.

import token_registry.aleo;
import test_usdcx_stablecoin.aleo;

program privadex_amm_btcx_v7.aleo {

    @noupgrade
    constructor() {}

    const BTCX_TOKEN_ID: field = 201field;

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
        btcx_in: token_registry.aleo::Token,
        usdcx_in: test_usdcx_stablecoin.aleo::Token,
        merkle_proofs: [test_usdcx_stablecoin.aleo::MerkleProof; 2],
        pool_id: u64,
        amount_a: u128,
        amount_b: u128,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        total_shares_snapshot: u128,
        min_shares: u128,
    ) -> (LPPosition, token_registry.aleo::Token, test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        assert(amount_a > 0u128);
        assert(amount_b > 0u128);
        assert(btcx_in.token_id == BTCX_TOKEN_ID);

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

        let (change_btcx, f_ea): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private_to_public(
                self.address, amount_a, btcx_in
            );
        let (compliance_rec, change_usdcx, f_eb): (test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) =
            test_usdcx_stablecoin.aleo::transfer_private_to_public(
                self.address, amount_b, usdcx_in, merkle_proofs
            );

        let lp: LPPosition = LPPosition {
            owner: self.signer,
            pool_id: pool_id,
            shares: actual_shares,
        };

        return (lp, change_btcx, compliance_rec, change_usdcx, final {
            f_ea.run();
            f_eb.run();

            let live_reserve_a: u128 = Mapping::get_or_use(reserve_a, pool_id, 0u128);
            let live_reserve_b: u128 = Mapping::get_or_use(reserve_b, pool_id, 0u128);
            let live_total_shares: u128 = Mapping::get_or_use(total_shares, pool_id, 0u128);

            assert(live_reserve_a == reserve_a_snapshot);
            assert(live_reserve_b == reserve_b_snapshot);
            assert(live_total_shares == total_shares_snapshot);
            assert(actual_shares > 0u128);

            Mapping::set(reserve_a, pool_id, reserve_a_snapshot + amount_a);
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
        min_amount_a: u128,
        min_amount_b: u128,
    ) -> (token_registry.aleo::Token, test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        assert(lp_in.shares > 0u128);
        assert(total_shares_snapshot > 0u128);
        assert(lp_in.shares <= total_shares_snapshot);

        let amount_a: u128 = (lp_in.shares * reserve_a_snapshot) / total_shares_snapshot;
        let amount_b: u128 = (lp_in.shares * reserve_b_snapshot) / total_shares_snapshot;
        let lp_pool_id: u64 = lp_in.pool_id;
        let lp_shares: u128 = lp_in.shares;

        assert(amount_a >= min_amount_a);
        assert(amount_b >= min_amount_b);

        let (btcx_out, f_ta): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(
                BTCX_TOKEN_ID, self.caller, amount_a, false
            );
        let (compliance_rec, usdcx_out, f_tb): (test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) =
            test_usdcx_stablecoin.aleo::transfer_public_to_private(self.caller, amount_b);

        return (btcx_out, compliance_rec, usdcx_out, final {
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

    // SWAP BTCx -> USDCx
    fn swap_btcx_for_usdcx(
        btcx_in: token_registry.aleo::Token,
        pool_id: u64,
        amount_in: u128,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        fee_bps_snapshot: u64,
        min_out: u128,
    ) -> (token_registry.aleo::Token, test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        assert(amount_in > 0u128);
        assert(btcx_in.token_id == BTCX_TOKEN_ID);
        assert(reserve_a_snapshot > 0u128);
        assert(reserve_b_snapshot > 0u128);

        let effective_fee: u64 = fee_bps_snapshot == 0u64 ? DEFAULT_FEE : fee_bps_snapshot;
        let adjusted_in: u128 = amount_in * (BPS_DENOM - effective_fee) as u128;
        let amount_out: u128 = (reserve_b_snapshot * adjusted_in) / (reserve_a_snapshot * BPS_DENOM as u128 + adjusted_in);

        assert(amount_out >= min_out);

        let (change_btcx, f_escrow): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private_to_public(
                self.address, amount_in, btcx_in
            );
        let (compliance_rec, usdcx_out, f_send): (test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) =
            test_usdcx_stablecoin.aleo::transfer_public_to_private(self.caller, amount_out);

        let fee_amount: u128 = (amount_in * effective_fee as u128) / BPS_DENOM as u128;
        return (change_btcx, compliance_rec, usdcx_out, final {
            f_escrow.run();
            f_send.run();

            let live_reserve_a: u128 = Mapping::get(reserve_a, pool_id);
            let live_reserve_b: u128 = Mapping::get(reserve_b, pool_id);
            let live_fee: u64 = Mapping::get_or_use(fee_bps, pool_id, DEFAULT_FEE);

            assert(live_reserve_a == reserve_a_snapshot);
            assert(live_reserve_b == reserve_b_snapshot);
            assert(live_fee == effective_fee);

            Mapping::set(reserve_a, pool_id, reserve_a_snapshot + amount_in);
            Mapping::set(reserve_b, pool_id, reserve_b_snapshot - amount_out);

            let cumulative_a: u128 = Mapping::get_or_use(cumulative_volume_a, pool_id, 0u128);
            let fee_total_a: u128 = Mapping::get_or_use(cumulative_fee_a, pool_id, 0u128);
            Mapping::set(cumulative_volume_a, pool_id, cumulative_a + amount_in);
            Mapping::set(cumulative_fee_a, pool_id, fee_total_a + fee_amount);
            Mapping::set(last_swap_block, pool_id, block.height);
        });
    }

    // SWAP USDCx -> BTCx
    fn swap_usdcx_for_btcx(
        usdcx_in: test_usdcx_stablecoin.aleo::Token,
        merkle_proofs: [test_usdcx_stablecoin.aleo::MerkleProof; 2],
        pool_id: u64,
        amount_in: u128,
        reserve_a_snapshot: u128,
        reserve_b_snapshot: u128,
        fee_bps_snapshot: u64,
        min_out: u128,
    ) -> (token_registry.aleo::Token, test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) {
        assert(amount_in > 0u128);
        assert(reserve_a_snapshot > 0u128);
        assert(reserve_b_snapshot > 0u128);

        let effective_fee: u64 = fee_bps_snapshot == 0u64 ? DEFAULT_FEE : fee_bps_snapshot;
        let adjusted_in: u128 = amount_in * (BPS_DENOM - effective_fee) as u128;
        let amount_out: u128 = (reserve_a_snapshot * adjusted_in) / (reserve_b_snapshot * BPS_DENOM as u128 + adjusted_in);

        assert(amount_out >= min_out);

        let (compliance_rec, change_usdcx, f_escrow): (test_usdcx_stablecoin.aleo::ComplianceRecord, test_usdcx_stablecoin.aleo::Token, Final) =
            test_usdcx_stablecoin.aleo::transfer_private_to_public(
                self.address, amount_in, usdcx_in, merkle_proofs
            );
        let (btcx_out, f_send): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(
                BTCX_TOKEN_ID, self.caller, amount_out, false
            );

        let fee_amount: u128 = (amount_in * effective_fee as u128) / BPS_DENOM as u128;
        return (btcx_out, compliance_rec, change_usdcx, final {
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
