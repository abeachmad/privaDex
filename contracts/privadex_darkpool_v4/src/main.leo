// PrivaDEX Dark Pool v3 — Hardened epoch settlement
//
// Design notes:
//   - Intents still escrow privately, but settlement is now permissionless once
//     the caller provides an AMM snapshot that the imported AMM contract verifies.
//   - Epoch settlement stores deterministic matched volumes derived from verified epoch snapshots.
//   - Claims compute fill and refund on-chain from stored epoch totals instead of trusting caller amounts.
//   - Protocol fees are explicit and tracked in base / quote units.

import credits.aleo;
import privadex_amm_v8.aleo;
import test_usdcx_stablecoin.aleo;

program privadex_darkpool_v4.aleo {

    @noupgrade
    async constructor() {}

    record DarkIntent {
        owner:    address,
        epoch_id: u64,
        pool_id:  u64,
        is_buy:   bool,
        amount:   u128,
        min_out:  u128,
        nonce:    field,
    }

    record DarkReceipt {
        owner:         address,
        epoch_id:      u64,
        pool_id:       u64,
        is_buy:        bool,
        matched_input: u128,
        refund_input:  u128,
        amount_out:    u128,
        fee_paid:      u128,
        mid_price:     u128,
    }

    mapping initialized:                 bool => bool;
    mapping admin_role:                  address => bool;
    mapping fee_bps:                     u64 => u64;
    mapping epoch_buy_volume:            u128 => u128;
    mapping epoch_sell_volume:           u128 => u128;
    mapping epoch_closed:                u128 => bool;
    mapping epoch_mid_price:             u128 => u128;
    mapping epoch_fee_bps:               u128 => u64;
    mapping epoch_matched_buy_volume:    u128 => u128;
    mapping epoch_matched_sell_volume:   u128 => u128;
    mapping intent_count:                u128 => u64;
    mapping pool_open_interest_buy:      u64 => u128;
    mapping pool_open_interest_sell:     u64 => u128;
    mapping cumulative_submitted_buy:    u64 => u128;
    mapping cumulative_submitted_sell:   u64 => u128;
    mapping cumulative_settled_buy:      u64 => u128;
    mapping cumulative_settled_sell:     u64 => u128;
    mapping cumulative_fee_base:         u64 => u128;
    mapping cumulative_fee_quote:        u64 => u128;
    mapping last_settlement_block:       u64 => u32;

    const PRICE_PRECISION: u128 = 1000000000u128;
    const BPS_DENOM: u64 = 10000u64;
    const DEFAULT_FEE: u64 = 0u64;
    const EPOCH_DURATION: u32 = 120u32;
    const EPOCH_KEY_MULTIPLIER: u128 = 18446744073709551616u128;
    const MAX_U64: u128 = 18446744073709551615u128;

    // INITIALIZATION AND CONFIG
    async transition initialize(
        admin: address,
    ) -> Future {
        let f: Future = finalize_initialize(admin, self.caller);
        return f;
    }

    async function finalize_initialize(
        admin:  address,
        caller: address,
    ) {
        let already_initialized: bool = Mapping::get_or_use(initialized, true, false);
        assert(!already_initialized);
        assert(caller == admin);

        Mapping::set(initialized, true, true);
        Mapping::set(admin_role, admin, true);
    }

    async transition set_admin(
        account: address,
        enabled: bool,
    ) -> Future {
        let f: Future = finalize_set_admin(account, enabled, self.caller);
        return f;
    }

    async function finalize_set_admin(
        account: address,
        enabled: bool,
        caller:  address,
    ) {
        let is_admin: bool = Mapping::get_or_use(admin_role, caller, false);
        assert(is_admin);
        Mapping::set(admin_role, account, enabled);
    }

    async transition set_fee_bps(
        pool_id: u64,
        fee:     u64,
    ) -> Future {
        let f: Future = finalize_set_fee_bps(pool_id, fee, self.caller);
        return f;
    }

    async function finalize_set_fee_bps(
        pool_id: u64,
        fee:     u64,
        caller:  address,
    ) {
        let is_admin: bool = Mapping::get_or_use(admin_role, caller, false);
        assert(is_admin);
        assert(fee <= 1000u64);
        Mapping::set(fee_bps, pool_id, fee);
    }

    // SUBMIT SELL ALEO INTENT
    async transition submit_sell_aleo(
        credits_in: credits.aleo/credits,
        pool_id:    u64,
        min_out:    u128,
        nonce:      field,
        epoch_id:   u64,
    ) -> (DarkIntent, Future) {
        let amount: u128 = credits_in.microcredits as u128;
        assert(amount > 0u128);

        let (change_credits, f_escrow): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in, self.address, credits_in.microcredits
            );

        let intent: DarkIntent = DarkIntent {
            owner:    self.signer,
            epoch_id: epoch_id,
            pool_id:  pool_id,
            is_buy:   false,
            amount:   amount,
            min_out:  min_out,
            nonce:    nonce,
        };

        let f: Future = finalize_submit(
            pool_id,
            epoch_id,
            false,
            amount,
            f_escrow,
        );
        return (intent, f);
    }

    // SUBMIT BUY ALEO INTENT
    async transition submit_buy_aleo(
        token_in:      test_usdcx_stablecoin.aleo/Token,
        merkle_proofs: [test_usdcx_stablecoin.aleo/MerkleProof; 2],
        pool_id:       u64,
        amount_in:     u128,
        min_out:       u128,
        nonce:         field,
        epoch_id:      u64,
    ) -> (DarkIntent, test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) {
        assert(amount_in > 0u128);

        let (compliance_rec, change_token, f_escrow): (test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) =
            test_usdcx_stablecoin.aleo/transfer_private_to_public(
                self.address, amount_in, token_in, merkle_proofs
            );

        let intent: DarkIntent = DarkIntent {
            owner:    self.signer,
            epoch_id: epoch_id,
            pool_id:  pool_id,
            is_buy:   true,
            amount:   amount_in,
            min_out:  min_out,
            nonce:    nonce,
        };

        let f: Future = finalize_submit(
            pool_id,
            epoch_id,
            true,
            amount_in,
            f_escrow,
        );
        return (intent, compliance_rec, change_token, f);
    }

    async function finalize_submit(
        pool_id:  u64,
        epoch_id: u64,
        is_buy:   bool,
        amount:   u128,
        f_escrow: Future,
    ) {
        f_escrow.await();

        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        let current_epoch: u64 = (block.height / EPOCH_DURATION) as u64;
        let epoch_key: u128 = (epoch_id as u128 * EPOCH_KEY_MULTIPLIER) + pool_id as u128;
        let closed: bool = Mapping::get_or_use(epoch_closed, epoch_key, false);
        assert(is_initialized);
        assert(epoch_id == current_epoch);
        assert(!closed);

        if is_buy {
            let volume: u128 = Mapping::get_or_use(epoch_buy_volume, epoch_key, 0u128);
            let open_interest: u128 = Mapping::get_or_use(pool_open_interest_buy, pool_id, 0u128);
            let submitted: u128 = Mapping::get_or_use(cumulative_submitted_buy, pool_id, 0u128);
            Mapping::set(epoch_buy_volume, epoch_key, volume + amount);
            Mapping::set(pool_open_interest_buy, pool_id, open_interest + amount);
            Mapping::set(cumulative_submitted_buy, pool_id, submitted + amount);
        } else {
            let volume: u128 = Mapping::get_or_use(epoch_sell_volume, epoch_key, 0u128);
            let open_interest: u128 = Mapping::get_or_use(pool_open_interest_sell, pool_id, 0u128);
            let submitted: u128 = Mapping::get_or_use(cumulative_submitted_sell, pool_id, 0u128);
            Mapping::set(epoch_sell_volume, epoch_key, volume + amount);
            Mapping::set(pool_open_interest_sell, pool_id, open_interest + amount);
            Mapping::set(cumulative_submitted_sell, pool_id, submitted + amount);
        }

        let count: u64 = Mapping::get_or_use(intent_count, epoch_key, 0u64);
        Mapping::set(intent_count, epoch_key, count + 1u64);
    }

    // SETTLE EPOCH
    async transition settle_epoch(
        pool_id:                    u64,
        epoch_id:                   u64,
        epoch_buy_volume_snapshot:  u128,
        epoch_sell_volume_snapshot: u128,
        fee_bps_snapshot:           u64,
        res_a:                      u128,
        res_b:                      u128,
    ) -> Future {
        assert(res_a > 0u128);
        assert(res_b > 0u128);

        let f_snapshot: Future = privadex_amm_v8.aleo/assert_pool_snapshot(
            pool_id,
            res_a,
            res_b,
            fee_bps_snapshot,
        );

        let mid_price: u128 = (res_b * PRICE_PRECISION) / res_a;
        let buy_base_equivalent: u128 = epoch_buy_volume_snapshot == 0u128
            ? 0u128
            : (epoch_buy_volume_snapshot * PRICE_PRECISION) / mid_price;

        let matched_sell: u128 = buy_base_equivalent >= epoch_sell_volume_snapshot
            ? epoch_sell_volume_snapshot
            : buy_base_equivalent;
        let matched_buy: u128 = buy_base_equivalent >= epoch_sell_volume_snapshot
            ? (matched_sell * mid_price) / PRICE_PRECISION
            : epoch_buy_volume_snapshot;

        let f: Future = finalize_settle(
            pool_id,
            epoch_id,
            epoch_buy_volume_snapshot,
            epoch_sell_volume_snapshot,
            fee_bps_snapshot,
            mid_price,
            matched_buy,
            matched_sell,
            f_snapshot,
        );
        return f;
    }

    async function finalize_settle(
        pool_id:                    u64,
        epoch_id:                   u64,
        epoch_buy_volume_snapshot:  u128,
        epoch_sell_volume_snapshot: u128,
        fee_bps_snapshot:           u64,
        mid_price:                  u128,
        matched_buy:                u128,
        matched_sell:               u128,
        f_snapshot:                 Future,
    ) {
        f_snapshot.await();

        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        let epoch_key: u128 = (epoch_id as u128 * EPOCH_KEY_MULTIPLIER) + pool_id as u128;
        let closed: bool = Mapping::get_or_use(epoch_closed, epoch_key, false);
        let live_buy: u128 = Mapping::get_or_use(epoch_buy_volume, epoch_key, 0u128);
        let live_sell: u128 = Mapping::get_or_use(epoch_sell_volume, epoch_key, 0u128);
        let epoch_end_height: u32 = (epoch_id as u32 + 1u32) * EPOCH_DURATION;
        assert(is_initialized);
        assert(!closed);
        assert(block.height >= epoch_end_height);
        assert(live_buy == epoch_buy_volume_snapshot);
        assert(live_sell == epoch_sell_volume_snapshot);
        assert(matched_buy <= live_buy);
        assert(matched_sell <= live_sell);

        Mapping::set(epoch_mid_price, epoch_key, mid_price);
        Mapping::set(epoch_fee_bps, epoch_key, fee_bps_snapshot);
        Mapping::set(epoch_matched_buy_volume, epoch_key, matched_buy);
        Mapping::set(epoch_matched_sell_volume, epoch_key, matched_sell);
        Mapping::set(epoch_closed, epoch_key, true);

        let open_buy: u128 = Mapping::get_or_use(pool_open_interest_buy, pool_id, 0u128);
        let open_sell: u128 = Mapping::get_or_use(pool_open_interest_sell, pool_id, 0u128);
        let settled_buy: u128 = Mapping::get_or_use(cumulative_settled_buy, pool_id, 0u128);
        let settled_sell: u128 = Mapping::get_or_use(cumulative_settled_sell, pool_id, 0u128);

        Mapping::set(pool_open_interest_buy, pool_id, open_buy - live_buy);
        Mapping::set(pool_open_interest_sell, pool_id, open_sell - live_sell);
        Mapping::set(cumulative_settled_buy, pool_id, settled_buy + matched_buy);
        Mapping::set(cumulative_settled_sell, pool_id, settled_sell + matched_sell);
        Mapping::set(last_settlement_block, pool_id, block.height);
    }

    // CLAIM SELL SETTLEMENT (receive USDCx output + ALEO refund)
    async transition claim_sell_fill(
        intent:                      DarkIntent,
        epoch_sell_volume_snapshot:  u128,
        matched_sell_snapshot:       u128,
        matched_buy_snapshot:        u128,
        mid_price_snapshot:          u128,
        epoch_fee_bps_snapshot:      u64,
    ) -> (DarkReceipt, test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, credits.aleo/credits, Future) {
        assert(!intent.is_buy);
        assert(intent.owner == self.signer);

        let matched_input: u128 = epoch_sell_volume_snapshot == 0u128
            ? 0u128
            : (intent.amount * matched_sell_snapshot) / epoch_sell_volume_snapshot;
        let refund_input: u128 = intent.amount - matched_input;
        assert(refund_input <= MAX_U64);

        let gross_quote_out: u128 = epoch_sell_volume_snapshot == 0u128
            ? 0u128
            : (intent.amount * matched_buy_snapshot) / epoch_sell_volume_snapshot;
        let fee_quote: u128 = (gross_quote_out * epoch_fee_bps_snapshot as u128) / BPS_DENOM as u128;
        let net_quote_out: u128 = gross_quote_out - fee_quote;

        let receipt: DarkReceipt = DarkReceipt {
            owner:         intent.owner,
            epoch_id:      intent.epoch_id,
            pool_id:       intent.pool_id,
            is_buy:        false,
            matched_input: matched_input,
            refund_input:  refund_input,
            amount_out:    net_quote_out,
            fee_paid:      fee_quote,
            mid_price:     mid_price_snapshot,
        };

        let (compliance_rec, token_out, f_quote): (test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) =
            test_usdcx_stablecoin.aleo/transfer_public_to_private(
                intent.owner, net_quote_out
            );
        let (credits_out, f_refund): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                intent.owner, refund_input as u64
            );

        let f: Future = finalize_claim_sell(
            intent.pool_id,
            intent.epoch_id,
            epoch_sell_volume_snapshot,
            matched_sell_snapshot,
            matched_buy_snapshot,
            mid_price_snapshot,
            epoch_fee_bps_snapshot,
            fee_quote,
            f_quote,
            f_refund,
        );
        return (receipt, compliance_rec, token_out, credits_out, f);
    }

    async function finalize_claim_sell(
        pool_id:                     u64,
        epoch_id:                    u64,
        epoch_sell_volume_snapshot:  u128,
        matched_sell_snapshot:       u128,
        matched_buy_snapshot:        u128,
        mid_price_snapshot:          u128,
        epoch_fee_bps_snapshot:      u64,
        fee_quote:                   u128,
        f_quote:                     Future,
        f_refund:                    Future,
    ) {
        f_quote.await();
        f_refund.await();

        let epoch_key: u128 = (epoch_id as u128 * EPOCH_KEY_MULTIPLIER) + pool_id as u128;
        let closed: bool = Mapping::get_or_use(epoch_closed, epoch_key, false);
        let live_total_sell: u128 = Mapping::get_or_use(epoch_sell_volume, epoch_key, 0u128);
        let live_matched_sell: u128 = Mapping::get_or_use(epoch_matched_sell_volume, epoch_key, 0u128);
        let live_matched_buy: u128 = Mapping::get_or_use(epoch_matched_buy_volume, epoch_key, 0u128);
        let live_mid_price: u128 = Mapping::get_or_use(epoch_mid_price, epoch_key, 0u128);
        let live_fee: u64 = Mapping::get_or_use(epoch_fee_bps, epoch_key, DEFAULT_FEE);
        assert(closed);
        assert(live_total_sell == epoch_sell_volume_snapshot);
        assert(live_matched_sell == matched_sell_snapshot);
        assert(live_matched_buy == matched_buy_snapshot);
        assert(live_mid_price == mid_price_snapshot);
        assert(live_fee == epoch_fee_bps_snapshot);

        let fees: u128 = Mapping::get_or_use(cumulative_fee_quote, pool_id, 0u128);
        Mapping::set(cumulative_fee_quote, pool_id, fees + fee_quote);
    }

    // CLAIM BUY SETTLEMENT (receive ALEO output + USDCx refund)
    async transition claim_buy_fill(
        intent:                     DarkIntent,
        epoch_buy_volume_snapshot:  u128,
        matched_sell_snapshot:      u128,
        matched_buy_snapshot:       u128,
        mid_price_snapshot:         u128,
        epoch_fee_bps_snapshot:     u64,
    ) -> (DarkReceipt, credits.aleo/credits, test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) {
        assert(intent.is_buy);
        assert(intent.owner == self.signer);

        let matched_input: u128 = epoch_buy_volume_snapshot == 0u128
            ? 0u128
            : (intent.amount * matched_buy_snapshot) / epoch_buy_volume_snapshot;
        let refund_input: u128 = intent.amount - matched_input;

        let gross_base_out: u128 = epoch_buy_volume_snapshot == 0u128
            ? 0u128
            : (intent.amount * matched_sell_snapshot) / epoch_buy_volume_snapshot;
        let fee_base: u128 = (gross_base_out * epoch_fee_bps_snapshot as u128) / BPS_DENOM as u128;
        let net_base_out: u128 = gross_base_out - fee_base;
        assert(net_base_out <= MAX_U64);

        let receipt: DarkReceipt = DarkReceipt {
            owner:         intent.owner,
            epoch_id:      intent.epoch_id,
            pool_id:       intent.pool_id,
            is_buy:        true,
            matched_input: matched_input,
            refund_input:  refund_input,
            amount_out:    net_base_out,
            fee_paid:      fee_base,
            mid_price:     mid_price_snapshot,
        };

        let (credits_out, f_base): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                intent.owner, net_base_out as u64
            );
        let (compliance_rec, token_out, f_refund): (test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) =
            test_usdcx_stablecoin.aleo/transfer_public_to_private(
                intent.owner, refund_input
            );

        let f: Future = finalize_claim_buy(
            intent.pool_id,
            intent.epoch_id,
            epoch_buy_volume_snapshot,
            matched_sell_snapshot,
            matched_buy_snapshot,
            mid_price_snapshot,
            epoch_fee_bps_snapshot,
            fee_base,
            f_base,
            f_refund,
        );
        return (receipt, credits_out, compliance_rec, token_out, f);
    }

    async function finalize_claim_buy(
        pool_id:                    u64,
        epoch_id:                   u64,
        epoch_buy_volume_snapshot:  u128,
        matched_sell_snapshot:      u128,
        matched_buy_snapshot:       u128,
        mid_price_snapshot:         u128,
        epoch_fee_bps_snapshot:     u64,
        fee_base:                   u128,
        f_base:                     Future,
        f_refund:                   Future,
    ) {
        f_base.await();
        f_refund.await();

        let epoch_key: u128 = (epoch_id as u128 * EPOCH_KEY_MULTIPLIER) + pool_id as u128;
        let closed: bool = Mapping::get_or_use(epoch_closed, epoch_key, false);
        let live_total_buy: u128 = Mapping::get_or_use(epoch_buy_volume, epoch_key, 0u128);
        let live_matched_sell: u128 = Mapping::get_or_use(epoch_matched_sell_volume, epoch_key, 0u128);
        let live_matched_buy: u128 = Mapping::get_or_use(epoch_matched_buy_volume, epoch_key, 0u128);
        let live_mid_price: u128 = Mapping::get_or_use(epoch_mid_price, epoch_key, 0u128);
        let live_fee: u64 = Mapping::get_or_use(epoch_fee_bps, epoch_key, DEFAULT_FEE);
        assert(closed);
        assert(live_total_buy == epoch_buy_volume_snapshot);
        assert(live_matched_sell == matched_sell_snapshot);
        assert(live_matched_buy == matched_buy_snapshot);
        assert(live_mid_price == mid_price_snapshot);
        assert(live_fee == epoch_fee_bps_snapshot);

        let fees: u128 = Mapping::get_or_use(cumulative_fee_base, pool_id, 0u128);
        Mapping::set(cumulative_fee_base, pool_id, fees + fee_base);
    }

    // CANCEL SELL INTENT BEFORE SETTLEMENT
    async transition cancel_sell_intent(
        intent: DarkIntent,
    ) -> (DarkReceipt, credits.aleo/credits, Future) {
        assert(!intent.is_buy);
        assert(intent.owner == self.signer);
        assert(intent.amount <= MAX_U64);

        let receipt: DarkReceipt = DarkReceipt {
            owner:         intent.owner,
            epoch_id:      intent.epoch_id,
            pool_id:       intent.pool_id,
            is_buy:        false,
            matched_input: 0u128,
            refund_input:  intent.amount,
            amount_out:    0u128,
            fee_paid:      0u128,
            mid_price:     0u128,
        };

        let (credits_out, f_refund): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                intent.owner, intent.amount as u64
            );

        let f: Future = finalize_cancel(
            intent.pool_id,
            intent.epoch_id,
            false,
            intent.amount,
            f_refund,
        );
        return (receipt, credits_out, f);
    }

    // CANCEL BUY INTENT BEFORE SETTLEMENT
    async transition cancel_buy_intent(
        intent: DarkIntent,
    ) -> (DarkReceipt, test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) {
        assert(intent.is_buy);
        assert(intent.owner == self.signer);

        let receipt: DarkReceipt = DarkReceipt {
            owner:         intent.owner,
            epoch_id:      intent.epoch_id,
            pool_id:       intent.pool_id,
            is_buy:        true,
            matched_input: 0u128,
            refund_input:  intent.amount,
            amount_out:    0u128,
            fee_paid:      0u128,
            mid_price:     0u128,
        };

        let (compliance_rec, token_out, f_refund): (test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) =
            test_usdcx_stablecoin.aleo/transfer_public_to_private(
                intent.owner, intent.amount
            );

        let f: Future = finalize_cancel(
            intent.pool_id,
            intent.epoch_id,
            true,
            intent.amount,
            f_refund,
        );
        return (receipt, compliance_rec, token_out, f);
    }

    async function finalize_cancel(
        pool_id:   u64,
        epoch_id:  u64,
        is_buy:    bool,
        amount:    u128,
        f_refund:  Future,
    ) {
        f_refund.await();

        let epoch_key: u128 = (epoch_id as u128 * EPOCH_KEY_MULTIPLIER) + pool_id as u128;
        let closed: bool = Mapping::get_or_use(epoch_closed, epoch_key, false);
        let count: u64 = Mapping::get_or_use(intent_count, epoch_key, 0u64);
        assert(!closed);
        assert(count > 0u64);

        if is_buy {
            let volume: u128 = Mapping::get_or_use(epoch_buy_volume, epoch_key, 0u128);
            let open_interest: u128 = Mapping::get_or_use(pool_open_interest_buy, pool_id, 0u128);
            Mapping::set(epoch_buy_volume, epoch_key, volume - amount);
            Mapping::set(pool_open_interest_buy, pool_id, open_interest - amount);
        } else {
            let volume: u128 = Mapping::get_or_use(epoch_sell_volume, epoch_key, 0u128);
            let open_interest: u128 = Mapping::get_or_use(pool_open_interest_sell, pool_id, 0u128);
            Mapping::set(epoch_sell_volume, epoch_key, volume - amount);
            Mapping::set(pool_open_interest_sell, pool_id, open_interest - amount);
        }

        Mapping::set(intent_count, epoch_key, count - 1u64);
    }
}
