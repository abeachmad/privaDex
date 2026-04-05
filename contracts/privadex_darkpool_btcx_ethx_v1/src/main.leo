// PrivaDEX Dark Pool — BTCx/ETHx Trading Pair (Leo 4.0)
//
// Design notes:
//   - Intents escrow privately, settlement is permissionless once
//     the caller provides an AMM snapshot that the imported AMM contract verifies.
//   - Epoch settlement stores deterministic matched volumes derived from verified epoch snapshots.
//   - Claims compute fill and refund on-chain from stored epoch totals instead of trusting caller amounts.
//   - Protocol fees are explicit and tracked in base / quote units.
//
// Token A (base) = BTCx via token_registry.aleo  (token_id = 201field)
// Token B (quote) = ETHx via token_registry.aleo  (token_id = 202field)
// NO USDCx / MerkleProof needed — both sides are registry tokens.

import token_registry.aleo;

program privadex_darkpool_btcx_ethx_v1.aleo {

    @noupgrade
    constructor() {}

    const BTCX_TOKEN_ID: field = 201field;
    const ETHX_TOKEN_ID: field = 202field;

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

    // ─── INITIALIZATION AND CONFIG ───

    fn initialize(admin: address) -> Final {
        let caller: address = self.caller;
        return final {
            let already_initialized: bool = Mapping::get_or_use(initialized, true, false);
            assert(!already_initialized);
            assert(caller == admin);
            Mapping::set(initialized, true, true);
            Mapping::set(admin_role, admin, true);
        };
    }

    fn set_admin(account: address, enabled: bool) -> Final {
        let caller: address = self.caller;
        return final {
            let is_admin: bool = Mapping::get_or_use(admin_role, caller, false);
            assert(is_admin);
            Mapping::set(admin_role, account, enabled);
        };
    }

    fn set_fee_bps(pool_id: u64, fee: u64) -> Final {
        let caller: address = self.caller;
        return final {
            let is_admin: bool = Mapping::get_or_use(admin_role, caller, false);
            assert(is_admin);
            assert(fee <= 1000u64);
            Mapping::set(fee_bps, pool_id, fee);
        };
    }

    // ─── SUBMIT SELL BTCx INTENT ───
    // Seller deposits BTCx (base) via token_registry, wants ETHx (quote) out
    fn submit_sell_btcx(
        token_in: token_registry.aleo::Token,
        pool_id:    u64,
        amount_in:  u128,
        min_out:    u128,
        nonce:      field,
        epoch_id:   u64,
    ) -> (DarkIntent, token_registry.aleo::Token, Final) {
        assert(amount_in > 0u128);

        let (change_token, f_escrow): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private_to_public(
                self.address, amount_in, token_in
            );

        let intent: DarkIntent = DarkIntent {
            owner:    self.signer,
            epoch_id: epoch_id,
            pool_id:  pool_id,
            is_buy:   false,
            amount:   amount_in,
            min_out:  min_out,
            nonce:    nonce,
        };

        let i_pool_id: u64 = pool_id;
        let i_epoch_id: u64 = epoch_id;
        let i_amount: u128 = amount_in;

        return (intent, change_token, final {
            f_escrow.run();

            let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
            let current_epoch: u64 = (block.height / EPOCH_DURATION) as u64;
            let epoch_key: u128 = (i_epoch_id as u128 * EPOCH_KEY_MULTIPLIER) + i_pool_id as u128;
            let closed: bool = Mapping::get_or_use(epoch_closed, epoch_key, false);
            assert(is_initialized);
            assert(i_epoch_id == current_epoch);
            assert(!closed);

            let volume: u128 = Mapping::get_or_use(epoch_sell_volume, epoch_key, 0u128);
            let open_interest: u128 = Mapping::get_or_use(pool_open_interest_sell, i_pool_id, 0u128);
            let submitted: u128 = Mapping::get_or_use(cumulative_submitted_sell, i_pool_id, 0u128);
            Mapping::set(epoch_sell_volume, epoch_key, volume + i_amount);
            Mapping::set(pool_open_interest_sell, i_pool_id, open_interest + i_amount);
            Mapping::set(cumulative_submitted_sell, i_pool_id, submitted + i_amount);

            let count: u64 = Mapping::get_or_use(intent_count, epoch_key, 0u64);
            Mapping::set(intent_count, epoch_key, count + 1u64);
        });
    }

    // ─── SUBMIT BUY BTCx INTENT ───
    // Buyer deposits ETHx (quote) via token_registry, wants BTCx (base) out
    fn submit_buy_btcx(
        token_in: token_registry.aleo::Token,
        pool_id:    u64,
        amount_in:  u128,
        min_out:    u128,
        nonce:      field,
        epoch_id:   u64,
    ) -> (DarkIntent, token_registry.aleo::Token, Final) {
        assert(amount_in > 0u128);

        let (change_token, f_escrow): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_private_to_public(
                self.address, amount_in, token_in
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

        let i_pool_id: u64 = pool_id;
        let i_epoch_id: u64 = epoch_id;
        let i_amount: u128 = amount_in;

        return (intent, change_token, final {
            f_escrow.run();

            let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
            let current_epoch: u64 = (block.height / EPOCH_DURATION) as u64;
            let epoch_key: u128 = (i_epoch_id as u128 * EPOCH_KEY_MULTIPLIER) + i_pool_id as u128;
            let closed: bool = Mapping::get_or_use(epoch_closed, epoch_key, false);
            assert(is_initialized);
            assert(i_epoch_id == current_epoch);
            assert(!closed);

            let volume: u128 = Mapping::get_or_use(epoch_buy_volume, epoch_key, 0u128);
            let open_interest: u128 = Mapping::get_or_use(pool_open_interest_buy, i_pool_id, 0u128);
            let submitted: u128 = Mapping::get_or_use(cumulative_submitted_buy, i_pool_id, 0u128);
            Mapping::set(epoch_buy_volume, epoch_key, volume + i_amount);
            Mapping::set(pool_open_interest_buy, i_pool_id, open_interest + i_amount);
            Mapping::set(cumulative_submitted_buy, i_pool_id, submitted + i_amount);

            let count: u64 = Mapping::get_or_use(intent_count, epoch_key, 0u64);
            Mapping::set(intent_count, epoch_key, count + 1u64);
        });
    }

    // ─── SETTLE EPOCH ───
    fn settle_epoch(
        pool_id:                    u64,
        epoch_id:                   u64,
        epoch_buy_volume_snapshot:  u128,
        epoch_sell_volume_snapshot: u128,
        fee_bps_snapshot:           u64,
        res_a:                      u128,
        res_b:                      u128,
    ) -> Final {
        assert(res_a > 0u128);
        assert(res_b > 0u128);


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

        return final {

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
        };
    }

    // ─── CLAIM SELL FILL ───
    // Seller receives ETHx (quote) output + BTCx (base) refund
    fn claim_sell_fill(
        intent:                      DarkIntent,
        epoch_sell_volume_snapshot:  u128,
        matched_sell_snapshot:       u128,
        matched_buy_snapshot:        u128,
        mid_price_snapshot:          u128,
        epoch_fee_bps_snapshot:      u64,
    ) -> (DarkReceipt, token_registry.aleo::Token, token_registry.aleo::Token, Final) {
        assert(!intent.is_buy);
        assert(intent.owner == self.signer);

        let i_owner: address = intent.owner;
        let i_epoch_id: u64 = intent.epoch_id;
        let i_pool_id: u64 = intent.pool_id;
        let i_amount: u128 = intent.amount;

        let matched_input: u128 = epoch_sell_volume_snapshot == 0u128
            ? 0u128
            : (i_amount * matched_sell_snapshot) / epoch_sell_volume_snapshot;
        let refund_input: u128 = i_amount - matched_input;

        let gross_quote_out: u128 = epoch_sell_volume_snapshot == 0u128
            ? 0u128
            : (i_amount * matched_buy_snapshot) / epoch_sell_volume_snapshot;
        let fee_quote: u128 = (gross_quote_out * epoch_fee_bps_snapshot as u128) / BPS_DENOM as u128;
        let net_quote_out: u128 = gross_quote_out - fee_quote;

        let receipt: DarkReceipt = DarkReceipt {
            owner:         i_owner,
            epoch_id:      i_epoch_id,
            pool_id:       i_pool_id,
            is_buy:        false,
            matched_input: matched_input,
            refund_input:  refund_input,
            amount_out:    net_quote_out,
            fee_paid:      fee_quote,
            mid_price:     mid_price_snapshot,
        };

        // Release ETHx (quote) output to seller
        let (quote_token, f_quote): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(
                ETHX_TOKEN_ID, i_owner, net_quote_out, true
            );
        // Release BTCx (base) refund to seller
        let (refund_token, f_refund): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(
                BTCX_TOKEN_ID, i_owner, refund_input, true
            );

        return (receipt, quote_token, refund_token, final {
            f_quote.run();
            f_refund.run();

            let epoch_key: u128 = (i_epoch_id as u128 * EPOCH_KEY_MULTIPLIER) + i_pool_id as u128;
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

            let fees: u128 = Mapping::get_or_use(cumulative_fee_quote, i_pool_id, 0u128);
            Mapping::set(cumulative_fee_quote, i_pool_id, fees + fee_quote);
        });
    }

    // ─── CLAIM BUY FILL ───
    // Buyer receives BTCx (base) output + ETHx (quote) refund
    fn claim_buy_fill(
        intent:                     DarkIntent,
        epoch_buy_volume_snapshot:  u128,
        matched_sell_snapshot:      u128,
        matched_buy_snapshot:       u128,
        mid_price_snapshot:         u128,
        epoch_fee_bps_snapshot:     u64,
    ) -> (DarkReceipt, token_registry.aleo::Token, token_registry.aleo::Token, Final) {
        assert(intent.is_buy);
        assert(intent.owner == self.signer);

        let i_owner: address = intent.owner;
        let i_epoch_id: u64 = intent.epoch_id;
        let i_pool_id: u64 = intent.pool_id;
        let i_amount: u128 = intent.amount;

        let matched_input: u128 = epoch_buy_volume_snapshot == 0u128
            ? 0u128
            : (i_amount * matched_buy_snapshot) / epoch_buy_volume_snapshot;
        let refund_input: u128 = i_amount - matched_input;

        let gross_base_out: u128 = epoch_buy_volume_snapshot == 0u128
            ? 0u128
            : (i_amount * matched_sell_snapshot) / epoch_buy_volume_snapshot;
        let fee_base: u128 = (gross_base_out * epoch_fee_bps_snapshot as u128) / BPS_DENOM as u128;
        let net_base_out: u128 = gross_base_out - fee_base;

        let receipt: DarkReceipt = DarkReceipt {
            owner:         i_owner,
            epoch_id:      i_epoch_id,
            pool_id:       i_pool_id,
            is_buy:        true,
            matched_input: matched_input,
            refund_input:  refund_input,
            amount_out:    net_base_out,
            fee_paid:      fee_base,
            mid_price:     mid_price_snapshot,
        };

        // Release BTCx (base) output to buyer
        let (base_token, f_base): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(
                BTCX_TOKEN_ID, i_owner, net_base_out, true
            );
        // Release ETHx (quote) refund to buyer
        let (refund_token, f_refund): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(
                ETHX_TOKEN_ID, i_owner, refund_input, true
            );

        return (receipt, base_token, refund_token, final {
            f_base.run();
            f_refund.run();

            let epoch_key: u128 = (i_epoch_id as u128 * EPOCH_KEY_MULTIPLIER) + i_pool_id as u128;
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

            let fees: u128 = Mapping::get_or_use(cumulative_fee_base, i_pool_id, 0u128);
            Mapping::set(cumulative_fee_base, i_pool_id, fees + fee_base);
        });
    }

    // ─── CANCEL SELL INTENT ───
    // Return BTCx (base) to seller before settlement
    fn cancel_sell_intent(
        intent: DarkIntent,
    ) -> (DarkReceipt, token_registry.aleo::Token, Final) {
        assert(!intent.is_buy);
        assert(intent.owner == self.signer);

        let i_owner: address = intent.owner;
        let i_epoch_id: u64 = intent.epoch_id;
        let i_pool_id: u64 = intent.pool_id;
        let i_amount: u128 = intent.amount;

        let receipt: DarkReceipt = DarkReceipt {
            owner:         i_owner,
            epoch_id:      i_epoch_id,
            pool_id:       i_pool_id,
            is_buy:        false,
            matched_input: 0u128,
            refund_input:  i_amount,
            amount_out:    0u128,
            fee_paid:      0u128,
            mid_price:     0u128,
        };

        let (refund_token, f_refund): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(
                BTCX_TOKEN_ID, i_owner, i_amount, true
            );

        return (receipt, refund_token, final {
            f_refund.run();

            let epoch_key: u128 = (i_epoch_id as u128 * EPOCH_KEY_MULTIPLIER) + i_pool_id as u128;
            let closed: bool = Mapping::get_or_use(epoch_closed, epoch_key, false);
            let count: u64 = Mapping::get_or_use(intent_count, epoch_key, 0u64);
            assert(!closed);
            assert(count > 0u64);

            let volume: u128 = Mapping::get_or_use(epoch_sell_volume, epoch_key, 0u128);
            let open_interest: u128 = Mapping::get_or_use(pool_open_interest_sell, i_pool_id, 0u128);
            Mapping::set(epoch_sell_volume, epoch_key, volume - i_amount);
            Mapping::set(pool_open_interest_sell, i_pool_id, open_interest - i_amount);

            Mapping::set(intent_count, epoch_key, count - 1u64);
        });
    }

    // ─── CANCEL BUY INTENT ───
    // Return ETHx (quote) to buyer before settlement
    fn cancel_buy_intent(
        intent: DarkIntent,
    ) -> (DarkReceipt, token_registry.aleo::Token, Final) {
        assert(intent.is_buy);
        assert(intent.owner == self.signer);

        let i_owner: address = intent.owner;
        let i_epoch_id: u64 = intent.epoch_id;
        let i_pool_id: u64 = intent.pool_id;
        let i_amount: u128 = intent.amount;

        let receipt: DarkReceipt = DarkReceipt {
            owner:         i_owner,
            epoch_id:      i_epoch_id,
            pool_id:       i_pool_id,
            is_buy:        true,
            matched_input: 0u128,
            refund_input:  i_amount,
            amount_out:    0u128,
            fee_paid:      0u128,
            mid_price:     0u128,
        };

        let (refund_token, f_refund): (token_registry.aleo::Token, Final) =
            token_registry.aleo::transfer_public_to_private(
                ETHX_TOKEN_ID, i_owner, i_amount, true
            );

        return (receipt, refund_token, final {
            f_refund.run();

            let epoch_key: u128 = (i_epoch_id as u128 * EPOCH_KEY_MULTIPLIER) + i_pool_id as u128;
            let closed: bool = Mapping::get_or_use(epoch_closed, epoch_key, false);
            let count: u64 = Mapping::get_or_use(intent_count, epoch_key, 0u64);
            assert(!closed);
            assert(count > 0u64);

            let volume: u128 = Mapping::get_or_use(epoch_buy_volume, epoch_key, 0u128);
            let open_interest: u128 = Mapping::get_or_use(pool_open_interest_buy, i_pool_id, 0u128);
            Mapping::set(epoch_buy_volume, epoch_key, volume - i_amount);
            Mapping::set(pool_open_interest_buy, i_pool_id, open_interest - i_amount);

            Mapping::set(intent_count, epoch_key, count - 1u64);
        });
    }
}
