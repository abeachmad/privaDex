// PrivaDEX Order Book v3 — Hardened private escrow model
//
// Design notes:
//   - Traders escrow the input asset privately, while a trusted matcher settles fills.
//   - Partial fills are tracked on-chain via order_filled_input.
//   - Output amounts are computed from execution_price on-chain, not supplied by the caller.
//   - Protocol fees are explicit and tracked separately in base / quote units.

import credits.aleo;
import test_usdcx_stablecoin.aleo;

program privadex_orderbook_v4.aleo {

    @noupgrade
    async constructor() {}

    record LimitOrder {
        owner:         address,
        order_id:      field,
        pool_id:       u64,
        is_buy:        bool,
        amount_in:     u128,
        amount_filled: u128,
        limit_price:   u128,
        expiry:        u32,
        nonce:         field,
    }

    record OrderReceipt {
        owner:        address,
        order_id:     field,
        pool_id:      u64,
        filled_input: u128,
        amount_out:   u128,
        fee_paid:     u128,
        fully_filled: bool,
    }

    mapping initialized:              bool => bool;
    mapping admin_role:               address => bool;
    mapping matcher_role:             address => bool;
    mapping fee_bps:                  u64 => u64;
    mapping order_seen:               field => bool;
    mapping order_commitment:         field => bool;
    mapping order_cancelled:          field => bool;
    mapping order_filled_input:       field => u128;
    mapping pool_open_interest_buy:   u64 => u128;
    mapping pool_open_interest_sell:  u64 => u128;
    mapping cumulative_base_volume:   u64 => u128;
    mapping cumulative_quote_volume:  u64 => u128;
    mapping cumulative_base_fees:     u64 => u128;
    mapping cumulative_quote_fees:    u64 => u128;
    mapping total_orders:             u64 => u64;
    mapping last_fill_block:          u64 => u32;

    const PRICE_PRECISION: u128 = 1000000000u128;
    const BPS_DENOM: u64 = 10000u64;
    const DEFAULT_FEE: u64 = 0u64;
    const MAX_U64: u128 = 18446744073709551615u128;

    // INITIALIZATION AND CONFIG
    async transition initialize(
        admin:   address,
        matcher: address,
    ) -> Future {
        let f: Future = finalize_initialize(admin, matcher, self.caller);
        return f;
    }

    async function finalize_initialize(
        admin:   address,
        matcher: address,
        caller:  address,
    ) {
        let already_initialized: bool = Mapping::get_or_use(initialized, true, false);
        assert(!already_initialized);
        assert(caller == admin);

        Mapping::set(initialized, true, true);
        Mapping::set(admin_role, admin, true);
        Mapping::set(matcher_role, matcher, true);
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

    async transition set_matcher(
        account: address,
        enabled: bool,
    ) -> Future {
        let f: Future = finalize_set_matcher(account, enabled, self.caller);
        return f;
    }

    async function finalize_set_matcher(
        account: address,
        enabled: bool,
        caller:  address,
    ) {
        let is_admin: bool = Mapping::get_or_use(admin_role, caller, false);
        assert(is_admin);
        Mapping::set(matcher_role, account, enabled);
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

    // PLACE SELL ALEO LIMIT ORDER
    async transition place_sell_limit(
        credits_in:  credits.aleo/credits,
        pool_id:     u64,
        limit_price: u128,
        expiry:      u32,
        nonce:       field,
    ) -> (LimitOrder, Future) {
        assert(credits_in.microcredits > 0u64);
        assert(limit_price > 0u128);

        let amount_in: u128 = credits_in.microcredits as u128;
        let order_id: field = BHP256::hash_to_field(nonce);

        let (change_credits, f_escrow): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in, self.address, credits_in.microcredits
            );

        let order: LimitOrder = LimitOrder {
            owner:         self.signer,
            order_id:      order_id,
            pool_id:       pool_id,
            is_buy:        false,
            amount_in:     amount_in,
            amount_filled: 0u128,
            limit_price:   limit_price,
            expiry:        expiry,
            nonce:         nonce,
        };

        let f: Future = finalize_place(
            order_id,
            pool_id,
            false,
            amount_in,
            expiry,
            f_escrow,
        );
        return (order, f);
    }

    // PLACE BUY ALEO LIMIT ORDER
    async transition place_buy_limit(
        token_in:      test_usdcx_stablecoin.aleo/Token,
        merkle_proofs: [test_usdcx_stablecoin.aleo/MerkleProof; 2],
        pool_id:       u64,
        amount_in:     u128,
        limit_price:   u128,
        expiry:        u32,
        nonce:         field,
    ) -> (LimitOrder, test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) {
        assert(amount_in > 0u128);
        assert(limit_price > 0u128);

        let order_id: field = BHP256::hash_to_field(nonce);

        let (compliance_rec, change_token, f_escrow): (test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) =
            test_usdcx_stablecoin.aleo/transfer_private_to_public(
                self.address, amount_in, token_in, merkle_proofs
            );

        let order: LimitOrder = LimitOrder {
            owner:         self.signer,
            order_id:      order_id,
            pool_id:       pool_id,
            is_buy:        true,
            amount_in:     amount_in,
            amount_filled: 0u128,
            limit_price:   limit_price,
            expiry:        expiry,
            nonce:         nonce,
        };

        let f: Future = finalize_place(
            order_id,
            pool_id,
            true,
            amount_in,
            expiry,
            f_escrow,
        );
        return (order, compliance_rec, change_token, f);
    }

    async function finalize_place(
        order_id:  field,
        pool_id:   u64,
        is_buy:    bool,
        amount_in: u128,
        expiry:    u32,
        f_escrow:  Future,
    ) {
        f_escrow.await();

        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        let seen: bool = Mapping::get_or_use(order_seen, order_id, false);
        assert(is_initialized);
        assert(!seen);
        assert(block.height <= expiry);

        Mapping::set(order_seen, order_id, true);
        Mapping::set(order_commitment, order_id, true);
        Mapping::set(order_cancelled, order_id, false);
        Mapping::set(order_filled_input, order_id, 0u128);

        if is_buy {
            let open_interest: u128 = Mapping::get_or_use(pool_open_interest_buy, pool_id, 0u128);
            Mapping::set(pool_open_interest_buy, pool_id, open_interest + amount_in);
        } else {
            let open_interest: u128 = Mapping::get_or_use(pool_open_interest_sell, pool_id, 0u128);
            Mapping::set(pool_open_interest_sell, pool_id, open_interest + amount_in);
        }

        let count: u64 = Mapping::get_or_use(total_orders, pool_id, 0u64);
        Mapping::set(total_orders, pool_id, count + 1u64);
    }

    // FILL SELL ORDER (ALEO -> USDCx)
    async transition fill_sell_order(
        order:           LimitOrder,
        fill_amount:     u128,
        execution_price: u128,
        fee_bps_snapshot: u64,
    ) -> (LimitOrder, OrderReceipt, test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) {
        assert(!order.is_buy);
        assert(fill_amount > 0u128);
        assert(execution_price >= order.limit_price);

        let remaining: u128 = order.amount_in - order.amount_filled;
        assert(fill_amount <= remaining);

        let gross_quote_out: u128 = (fill_amount * execution_price) / PRICE_PRECISION;
        let fee_quote: u128 = (gross_quote_out * fee_bps_snapshot as u128) / BPS_DENOM as u128;
        let net_quote_out: u128 = gross_quote_out - fee_quote;
        let next_filled: u128 = order.amount_filled + fill_amount;

        let updated: LimitOrder = LimitOrder {
            owner:         order.owner,
            order_id:      order.order_id,
            pool_id:       order.pool_id,
            is_buy:        false,
            amount_in:     order.amount_in,
            amount_filled: next_filled,
            limit_price:   order.limit_price,
            expiry:        order.expiry,
            nonce:         order.nonce,
        };

        let receipt: OrderReceipt = OrderReceipt {
            owner:        order.owner,
            order_id:     order.order_id,
            pool_id:      order.pool_id,
            filled_input: fill_amount,
            amount_out:   net_quote_out,
            fee_paid:     fee_quote,
            fully_filled: next_filled == order.amount_in,
        };

        let (compliance_rec, token_out, f_send): (test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) =
            test_usdcx_stablecoin.aleo/transfer_public_to_private(
                order.owner, net_quote_out
            );

        let f: Future = finalize_fill_sell(
            order.order_id,
            order.pool_id,
            order.amount_in,
            order.amount_filled,
            fill_amount,
            order.expiry,
            fee_bps_snapshot,
            gross_quote_out,
            fee_quote,
            f_send,
            self.caller,
        );
        return (updated, receipt, compliance_rec, token_out, f);
    }

    async function finalize_fill_sell(
        order_id:         field,
        pool_id:          u64,
        amount_in:        u128,
        previous_filled:  u128,
        fill_amount:      u128,
        expiry:           u32,
        fee_bps_snapshot: u64,
        gross_quote_out:  u128,
        fee_quote:        u128,
        f_send:           Future,
        caller:           address,
    ) {
        f_send.await();

        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        let is_matcher: bool = Mapping::get_or_use(matcher_role, caller, false);
        let committed: bool = Mapping::get_or_use(order_commitment, order_id, false);
        let cancelled: bool = Mapping::get_or_use(order_cancelled, order_id, false);
        let live_filled: u128 = Mapping::get_or_use(order_filled_input, order_id, 0u128);
        let live_fee: u64 = Mapping::get_or_use(fee_bps, pool_id, DEFAULT_FEE);
        assert(is_initialized);
        assert(is_matcher);
        assert(committed);
        assert(!cancelled);
        assert(block.height <= expiry);
        assert(live_filled == previous_filled);
        assert(live_fee == fee_bps_snapshot);

        let next_filled: u128 = previous_filled + fill_amount;
        assert(next_filled <= amount_in);

        Mapping::set(order_filled_input, order_id, next_filled);
        if next_filled == amount_in {
            Mapping::set(order_commitment, order_id, false);
        }

        let open_interest: u128 = Mapping::get_or_use(pool_open_interest_sell, pool_id, 0u128);
        let base_volume: u128 = Mapping::get_or_use(cumulative_base_volume, pool_id, 0u128);
        let quote_volume: u128 = Mapping::get_or_use(cumulative_quote_volume, pool_id, 0u128);
        let quote_fees: u128 = Mapping::get_or_use(cumulative_quote_fees, pool_id, 0u128);

        Mapping::set(pool_open_interest_sell, pool_id, open_interest - fill_amount);
        Mapping::set(cumulative_base_volume, pool_id, base_volume + fill_amount);
        Mapping::set(cumulative_quote_volume, pool_id, quote_volume + gross_quote_out);
        Mapping::set(cumulative_quote_fees, pool_id, quote_fees + fee_quote);
        Mapping::set(last_fill_block, pool_id, block.height);
    }

    // FILL BUY ORDER (USDCx -> ALEO)
    async transition fill_buy_order(
        order:           LimitOrder,
        fill_amount:     u128,
        execution_price: u128,
        fee_bps_snapshot: u64,
    ) -> (LimitOrder, OrderReceipt, credits.aleo/credits, Future) {
        assert(order.is_buy);
        assert(fill_amount > 0u128);
        assert(execution_price > 0u128);
        assert(execution_price <= order.limit_price);

        let remaining: u128 = order.amount_in - order.amount_filled;
        assert(fill_amount <= remaining);

        let gross_base_out: u128 = (fill_amount * PRICE_PRECISION) / execution_price;
        let fee_base: u128 = (gross_base_out * fee_bps_snapshot as u128) / BPS_DENOM as u128;
        let net_base_out: u128 = gross_base_out - fee_base;
        assert(net_base_out <= MAX_U64);

        let next_filled: u128 = order.amount_filled + fill_amount;
        let updated: LimitOrder = LimitOrder {
            owner:         order.owner,
            order_id:      order.order_id,
            pool_id:       order.pool_id,
            is_buy:        true,
            amount_in:     order.amount_in,
            amount_filled: next_filled,
            limit_price:   order.limit_price,
            expiry:        order.expiry,
            nonce:         order.nonce,
        };

        let receipt: OrderReceipt = OrderReceipt {
            owner:        order.owner,
            order_id:     order.order_id,
            pool_id:      order.pool_id,
            filled_input: fill_amount,
            amount_out:   net_base_out,
            fee_paid:     fee_base,
            fully_filled: next_filled == order.amount_in,
        };

        let (credits_out, f_send): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                order.owner, net_base_out as u64
            );

        let f: Future = finalize_fill_buy(
            order.order_id,
            order.pool_id,
            order.amount_in,
            order.amount_filled,
            fill_amount,
            order.expiry,
            fee_bps_snapshot,
            gross_base_out,
            fee_base,
            f_send,
            self.caller,
        );
        return (updated, receipt, credits_out, f);
    }

    async function finalize_fill_buy(
        order_id:        field,
        pool_id:         u64,
        amount_in:       u128,
        previous_filled: u128,
        fill_amount:     u128,
        expiry:          u32,
        fee_bps_snapshot: u64,
        gross_base_out:  u128,
        fee_base:        u128,
        f_send:          Future,
        caller:          address,
    ) {
        f_send.await();

        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        let is_matcher: bool = Mapping::get_or_use(matcher_role, caller, false);
        let committed: bool = Mapping::get_or_use(order_commitment, order_id, false);
        let cancelled: bool = Mapping::get_or_use(order_cancelled, order_id, false);
        let live_filled: u128 = Mapping::get_or_use(order_filled_input, order_id, 0u128);
        let live_fee: u64 = Mapping::get_or_use(fee_bps, pool_id, DEFAULT_FEE);
        assert(is_initialized);
        assert(is_matcher);
        assert(committed);
        assert(!cancelled);
        assert(block.height <= expiry);
        assert(live_filled == previous_filled);
        assert(live_fee == fee_bps_snapshot);

        let next_filled: u128 = previous_filled + fill_amount;
        assert(next_filled <= amount_in);

        Mapping::set(order_filled_input, order_id, next_filled);
        if next_filled == amount_in {
            Mapping::set(order_commitment, order_id, false);
        }

        let open_interest: u128 = Mapping::get_or_use(pool_open_interest_buy, pool_id, 0u128);
        let base_volume: u128 = Mapping::get_or_use(cumulative_base_volume, pool_id, 0u128);
        let quote_volume: u128 = Mapping::get_or_use(cumulative_quote_volume, pool_id, 0u128);
        let base_fees: u128 = Mapping::get_or_use(cumulative_base_fees, pool_id, 0u128);

        Mapping::set(pool_open_interest_buy, pool_id, open_interest - fill_amount);
        Mapping::set(cumulative_quote_volume, pool_id, quote_volume + fill_amount);
        Mapping::set(cumulative_base_volume, pool_id, base_volume + gross_base_out);
        Mapping::set(cumulative_base_fees, pool_id, base_fees + fee_base);
        Mapping::set(last_fill_block, pool_id, block.height);
    }

    // CANCEL SELL ORDER
    async transition cancel_sell_order(
        order: LimitOrder,
    ) -> (OrderReceipt, credits.aleo/credits, Future) {
        assert(!order.is_buy);
        assert(order.owner == self.signer);

        let remaining: u128 = order.amount_in - order.amount_filled;
        assert(remaining > 0u128);
        assert(remaining <= MAX_U64);

        let receipt: OrderReceipt = OrderReceipt {
            owner:        order.owner,
            order_id:     order.order_id,
            pool_id:      order.pool_id,
            filled_input: 0u128,
            amount_out:   remaining,
            fee_paid:     0u128,
            fully_filled: false,
        };

        let (credits_out, f_refund): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                order.owner, remaining as u64
            );

        let f: Future = finalize_cancel(
            order.order_id,
            order.pool_id,
            false,
            order.amount_filled,
            remaining,
            f_refund,
        );
        return (receipt, credits_out, f);
    }

    // CANCEL BUY ORDER
    async transition cancel_buy_order(
        order: LimitOrder,
    ) -> (OrderReceipt, test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) {
        assert(order.is_buy);
        assert(order.owner == self.signer);

        let remaining: u128 = order.amount_in - order.amount_filled;
        assert(remaining > 0u128);

        let receipt: OrderReceipt = OrderReceipt {
            owner:        order.owner,
            order_id:     order.order_id,
            pool_id:      order.pool_id,
            filled_input: 0u128,
            amount_out:   remaining,
            fee_paid:     0u128,
            fully_filled: false,
        };

        let (compliance_rec, token_out, f_refund): (test_usdcx_stablecoin.aleo/ComplianceRecord, test_usdcx_stablecoin.aleo/Token, Future) =
            test_usdcx_stablecoin.aleo/transfer_public_to_private(
                order.owner, remaining
            );

        let f: Future = finalize_cancel(
            order.order_id,
            order.pool_id,
            true,
            order.amount_filled,
            remaining,
            f_refund,
        );
        return (receipt, compliance_rec, token_out, f);
    }

    async function finalize_cancel(
        order_id:        field,
        pool_id:         u64,
        is_buy:          bool,
        previous_filled: u128,
        remaining:       u128,
        f_refund:        Future,
    ) {
        f_refund.await();

        let committed: bool = Mapping::get_or_use(order_commitment, order_id, false);
        let cancelled: bool = Mapping::get_or_use(order_cancelled, order_id, false);
        let live_filled: u128 = Mapping::get_or_use(order_filled_input, order_id, 0u128);
        assert(committed);
        assert(!cancelled);
        assert(live_filled == previous_filled);

        Mapping::set(order_cancelled, order_id, true);
        Mapping::set(order_commitment, order_id, false);

        if is_buy {
            let open_interest: u128 = Mapping::get_or_use(pool_open_interest_buy, pool_id, 0u128);
            Mapping::set(pool_open_interest_buy, pool_id, open_interest - remaining);
        } else {
            let open_interest: u128 = Mapping::get_or_use(pool_open_interest_sell, pool_id, 0u128);
            Mapping::set(pool_open_interest_sell, pool_id, open_interest - remaining);
        }
    }
}
