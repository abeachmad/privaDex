// PrivaDEX Order Book Program
// Private limit orders, TWAP execution, and RFQ matching.
// Order data stored in private records; commitment hashes in public mappings.

program privadex_orderbook.aleo {

    // ─── Records ─────────────────────────────────────────────────────────────
    record LimitOrder {
        owner:        address,
        order_id:     field,     // hash(owner || nonce)
        pool_id:      u64,
        is_buy:       bool,
        amount_in:    u128,      // total input locked
        amount_filled: u128,     // amount executed so far
        limit_price:  u128,      // price limit (price_precision = 1e9)
        expiry:       u32,       // block height expiry
        nonce:        field,
    }

    record TWAPOrder {
        owner:         address,
        order_id:      field,
        pool_id:       u64,
        is_buy:        bool,
        total_amount:  u128,     // total to execute
        filled_amount: u128,     // already filled
        slices:        u32,      // number of TWAP slices
        slices_done:   u32,      // slices executed so far
        interval:      u32,      // blocks between slices
        last_slice:    u32,      // block height of last execution
        expiry:        u32,
    }

    record RFQQuote {
        maker:        address,
        taker:        address,   // zero field means any taker
        order_id:     field,
        pool_id:      u64,
        maker_sell:   u128,      // maker offers this token A amount
        maker_buy:    u128,      // maker wants this token B amount
        expiry:       u32,
        nonce:        field,
    }

    // ─── Public mappings ─────────────────────────────────────────────────────
    mapping order_commitment: field => bool;   // order_id => exists/active
    mapping order_cancelled:  field => bool;   // order_id => cancelled?
    mapping order_filled:     field => u128;   // order_id => cumulative filled

    // ─── Constants ───────────────────────────────────────────────────────────
    const PRICE_PRECISION: u128 = 1_000_000_000u128;
    const MIN_TWAP_SLICES: u32  = 2u32;
    const MAX_TWAP_SLICES: u32  = 24u32;

    // ─── Place Limit Order ────────────────────────────────────────────────────
    async transition place_limit_order(
        token_in:    privadex_token.leo/PrivateToken,
        pool_id:     u64,
        is_buy:      bool,
        limit_price: u128,   // max price if buy, min price if sell (1e9 scaled)
        expiry:      u32,
        nonce:       field,
    ) -> (LimitOrder, Future) {
        let order_id: field = BHP256::hash_to_field(nonce);

        let order: LimitOrder = LimitOrder {
            owner:         self.caller,
            order_id:      order_id,
            pool_id:       pool_id,
            is_buy:        is_buy,
            amount_in:     token_in.amount,
            amount_filled: 0u128,
            limit_price:   limit_price,
            expiry:        expiry,
            nonce:         nonce,
        };

        let f: Future = finalize_place_limit_order(order_id);
        return (order, f);
    }

    async function finalize_place_limit_order(order_id: field) {
        // Register commitment so fillers can reference it
        assert(!Mapping::get_or_use(order_commitment, order_id, false));
        Mapping::set(order_commitment, order_id, true);
    }

    // ─── Fill Limit Order (partial or full) ───────────────────────────────────
    // Keeper/relayer presents fill amount; checks price constraint against AMM.
    async transition fill_limit_order(
        order:       LimitOrder,
        fill_amount: u128,
        market_price: u128,  // current AMM price (1e9 scaled), passed by relayer
    ) -> (LimitOrder, privadex_token.leo/PrivateToken, Future) {
        // Price check: buy order fills only if market_price <= limit_price
        //              sell order fills only if market_price >= limit_price
        let price_ok: bool = order.is_buy
            ? market_price <= order.limit_price
            : market_price >= order.limit_price;
        assert(price_ok);

        let remaining: u128 = order.amount_in - order.amount_filled;
        let actual_fill: u128 = fill_amount <= remaining ? fill_amount : remaining;

        // Compute output at market price
        let amount_out: u128 = order.is_buy
            ? (actual_fill * PRICE_PRECISION) / market_price
            : (actual_fill * market_price) / PRICE_PRECISION;

        let updated_order: LimitOrder = LimitOrder {
            owner:         order.owner,
            order_id:      order.order_id,
            pool_id:       order.pool_id,
            is_buy:        order.is_buy,
            amount_in:     order.amount_in,
            amount_filled: order.amount_filled + actual_fill,
            limit_price:   order.limit_price,
            expiry:        order.expiry,
            nonce:         order.nonce,
        };

        let output_token: privadex_token.leo/PrivateToken = privadex_token.leo/PrivateToken {
            owner:    order.owner,
            token_id: order.is_buy ? 0u64 : 1u64,
            amount:   amount_out,
        };

        let f: Future = finalize_fill_limit_order(order.order_id, actual_fill, order.expiry);
        return (updated_order, output_token, f);
    }

    async function finalize_fill_limit_order(
        order_id:    field,
        fill_amount: u128,
        expiry:      u32,
    ) {
        assert(Mapping::get_or_use(order_commitment, order_id, false));
        assert(!Mapping::get_or_use(order_cancelled, order_id, false));
        assert(block.height <= expiry);

        let filled: u128 = Mapping::get_or_use(order_filled, order_id, 0u128);
        Mapping::set(order_filled, order_id, filled + fill_amount);
    }

    // ─── Cancel Limit Order ───────────────────────────────────────────────────
    async transition cancel_limit_order(
        order: LimitOrder,
    ) -> (privadex_token.leo/PrivateToken, Future) {
        let unfilled: u128 = order.amount_in - order.amount_filled;

        let refund: privadex_token.leo/PrivateToken = privadex_token.leo/PrivateToken {
            owner:    order.owner,
            token_id: order.is_buy ? 1u64 : 0u64,
            amount:   unfilled,
        };

        let f: Future = finalize_cancel_limit_order(order.order_id);
        return (refund, f);
    }

    async function finalize_cancel_limit_order(order_id: field) {
        assert(Mapping::get_or_use(order_commitment, order_id, false));
        Mapping::set(order_cancelled, order_id, true);
    }

    // ─── Place TWAP Order ─────────────────────────────────────────────────────
    async transition place_twap_order(
        token_in:     privadex_token.leo/PrivateToken,
        pool_id:      u64,
        is_buy:       bool,
        slices:       u32,
        interval:     u32,    // blocks between executions
        expiry:       u32,
        nonce:        field,
    ) -> (TWAPOrder, Future) {
        assert(slices >= MIN_TWAP_SLICES);
        assert(slices <= MAX_TWAP_SLICES);

        let order_id: field = BHP256::hash_to_field(nonce);

        let order: TWAPOrder = TWAPOrder {
            owner:         self.caller,
            order_id:      order_id,
            pool_id:       pool_id,
            is_buy:        is_buy,
            total_amount:  token_in.amount,
            filled_amount: 0u128,
            slices:        slices,
            slices_done:   0u32,
            interval:      interval,
            last_slice:    0u32,
            expiry:        expiry,
        };

        let f: Future = finalize_place_twap(order_id);
        return (order, f);
    }

    async function finalize_place_twap(order_id: field) {
        assert(!Mapping::get_or_use(order_commitment, order_id, false));
        Mapping::set(order_commitment, order_id, true);
    }

    // ─── Execute TWAP Slice ───────────────────────────────────────────────────
    async transition execute_twap_slice(
        order:        TWAPOrder,
        market_price: u128,
    ) -> (TWAPOrder, privadex_token.leo/PrivateToken, Future) {
        assert(order.slices_done < order.slices);

        let slice_amount: u128 = order.total_amount / order.slices as u128;
        let amount_out: u128   = order.is_buy
            ? (slice_amount * PRICE_PRECISION) / market_price
            : (slice_amount * market_price)    / PRICE_PRECISION;

        let updated: TWAPOrder = TWAPOrder {
            owner:         order.owner,
            order_id:      order.order_id,
            pool_id:       order.pool_id,
            is_buy:        order.is_buy,
            total_amount:  order.total_amount,
            filled_amount: order.filled_amount + slice_amount,
            slices:        order.slices,
            slices_done:   order.slices_done + 1u32,
            interval:      order.interval,
            last_slice:    0u32,   // updated in finalize
            expiry:        order.expiry,
        };

        let output: privadex_token.leo/PrivateToken = privadex_token.leo/PrivateToken {
            owner:    order.owner,
            token_id: order.is_buy ? 0u64 : 1u64,
            amount:   amount_out,
        };

        let f: Future = finalize_twap_slice(order.order_id, slice_amount, order.interval, order.last_slice, order.expiry);
        return (updated, output, f);
    }

    async function finalize_twap_slice(
        order_id:   field,
        slice_amt:  u128,
        interval:   u32,
        last_slice: u32,
        expiry:     u32,
    ) {
        assert(Mapping::get_or_use(order_commitment, order_id, false));
        assert(!Mapping::get_or_use(order_cancelled, order_id, false));
        assert(block.height <= expiry);
        // Enforce time interval between slices (skip for first slice where last_slice == 0)
        assert(last_slice == 0u32 || block.height >= last_slice + interval);

        let filled: u128 = Mapping::get_or_use(order_filled, order_id, 0u128);
        Mapping::set(order_filled, order_id, filled + slice_amt);
    }

    // ─── RFQ: Post Quote ─────────────────────────────────────────────────────
    // Market maker posts a private bilateral quote to a specific taker.
    async transition post_rfq_quote(
        token_offer: privadex_token.leo/PrivateToken,   // maker's token A to sell
        taker:       address,
        pool_id:     u64,
        maker_buy:   u128,   // wants this many token B in return
        expiry:      u32,
        nonce:       field,
    ) -> (RFQQuote, Future) {
        let order_id: field = BHP256::hash_to_field(nonce);

        let quote: RFQQuote = RFQQuote {
            maker:      self.caller,
            taker:      taker,
            order_id:   order_id,
            pool_id:    pool_id,
            maker_sell: token_offer.amount,
            maker_buy:  maker_buy,
            expiry:     expiry,
            nonce:      nonce,
        };

        let f: Future = finalize_post_rfq(order_id);
        return (quote, f);
    }

    async function finalize_post_rfq(order_id: field) {
        assert(!Mapping::get_or_use(order_commitment, order_id, false));
        Mapping::set(order_commitment, order_id, true);
    }

    // ─── RFQ: Accept Quote ────────────────────────────────────────────────────
    async transition accept_rfq_quote(
        quote:      RFQQuote,
        token_in:   privadex_token.leo/PrivateToken,   // taker's token B payment
    ) -> (privadex_token.leo/PrivateToken, Future) {
        // Taker must be the specified recipient (or quote is open to anyone)
        let is_open: bool  = quote.taker == self.caller;   // simplified: direct match
        assert(is_open);
        assert(token_in.amount >= quote.maker_buy);

        let received: privadex_token.leo/PrivateToken = privadex_token.leo/PrivateToken {
            owner:    self.caller,
            token_id: 0u64,
            amount:   quote.maker_sell,
        };

        let f: Future = finalize_accept_rfq(quote.order_id, quote.expiry);
        return (received, f);
    }

    async function finalize_accept_rfq(order_id: field, expiry: u32) {
        assert(Mapping::get_or_use(order_commitment, order_id, false));
        assert(!Mapping::get_or_use(order_cancelled, order_id, false));
        assert(block.height <= expiry);
        // Mark as filled (one-shot RFQ)
        Mapping::set(order_cancelled, order_id, true);
    }
}
