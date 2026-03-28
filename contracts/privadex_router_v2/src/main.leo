// PrivaDEX Router — Hybrid atomic router + route attestation
//
// Design notes:
//   - Atomic routing is enabled only for routes whose intermediate asset can be
//     re-spent safely inside the same execution (ALEO credits or token_registry tokens).
//   - USDCx-based multi-hop remains intentionally out of scope because the
//     stablecoin spend path requires MerkleProof inputs that fresh outputs do not have.
//   - Legacy route intent / attestation helpers are preserved for async flows.

import credits.aleo;
import token_registry.aleo;
import privadex_amm_native_btcx_v5.aleo;
import privadex_amm_native_ethx_v5.aleo;
import privadex_amm_btcx_ethx_v4.aleo;

program privadex_router_v2.aleo {

    @noupgrade
    async constructor() {}

    record RouteIntent {
        owner:     address,
        route_id:  field,
        token_in:  u64,
        token_out: u64,
        amount_in: u128,
        min_out:   u128,
        max_hops:  u8,
        expiry:    u32,
        nonce:     field,
    }

    record RouteReceipt {
        owner:        address,
        route_id:     field,
        token_in:     u64,
        token_out:    u64,
        amount_in:    u128,
        amount_out:   u128,
        hops:         u8,
        venue_mask:   u8,
        execution_tx: field,
        success:      bool,
    }

    mapping initialized:         bool => bool;
    mapping admin_role:          address => bool;
    mapping executor_role:       address => bool;
    mapping route_seen:          field => bool;
    mapping route_open:          field => bool;
    mapping route_cancelled:     field => bool;
    mapping total_routed_volume: u64 => u128;
    mapping total_output_volume: u64 => u128;
    mapping total_routes:        u64 => u64;
    mapping last_route_block:    u64 => u32;

    const TOKEN_ALEO: u64 = 0u64;
    const TOKEN_BTCX: u64 = 5u64;
    const TOKEN_ETHX: u64 = 6u64;

    const POOL_ALEO_BTCX: u64 = 8u64;
    const POOL_ALEO_ETHX: u64 = 9u64;
    const POOL_BTCX_ETHX: u64 = 10u64;

    const ROUTE_MASK_ATOMIC_AMM: u8 = 1u8;
    const DEFAULT_FEE: u64 = 30u64;
    const BPS_DENOM: u64 = 10000u64;
    const MAX_U64: u128 = 18446744073709551615u128;

    // INITIALIZATION AND CONFIG
    async transition initialize(
        admin:    address,
        executor: address,
    ) -> Future {
        let f: Future = finalize_initialize(admin, executor, self.caller);
        return f;
    }

    async function finalize_initialize(
        admin:    address,
        executor: address,
        caller:   address,
    ) {
        let already_initialized: bool = Mapping::get_or_use(initialized, true, false);
        assert(!already_initialized);
        assert(caller == admin);

        Mapping::set(initialized, true, true);
        Mapping::set(admin_role, admin, true);
        Mapping::set(executor_role, executor, true);
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

    async transition set_executor(
        account: address,
        enabled: bool,
    ) -> Future {
        let f: Future = finalize_set_executor(account, enabled, self.caller);
        return f;
    }

    async function finalize_set_executor(
        account: address,
        enabled: bool,
        caller:  address,
    ) {
        let is_admin: bool = Mapping::get_or_use(admin_role, caller, false);
        assert(is_admin);
        Mapping::set(executor_role, account, enabled);
    }

    // ATOMIC TWO-HOP ROUTES
    // These routes use only ALEO credits and token_registry records as the
    // intermediate asset, which allows the router to keep custody intra-tx and
    // forward the final output safely back to the signer.

    // BTCx -> ETHx via ALEO
    async transition swap_btcx_for_ethx_via_aleo(
        btcx_in:                    token_registry.aleo/Token,
        amount_in:                  u128,
        reserve_aleo_btcx_a:        u128,
        reserve_aleo_btcx_b:        u128,
        fee_aleo_btcx:              u64,
        reserve_aleo_ethx_a:        u128,
        reserve_aleo_ethx_b:        u128,
        fee_aleo_ethx:              u64,
        min_out:                    u128,
    ) -> (token_registry.aleo/Token, token_registry.aleo/Token, Future) {
        assert(amount_in > 0u128);
        assert(btcx_in.token_id == 201field);

        let effective_fee_1: u64 = fee_aleo_btcx == 0u64 ? DEFAULT_FEE : fee_aleo_btcx;
        let adjusted_in_1: u128 = amount_in * (BPS_DENOM - effective_fee_1) as u128;
        let mid_out_aleo: u128 = (reserve_aleo_btcx_a * adjusted_in_1) / (reserve_aleo_btcx_b * BPS_DENOM as u128 + adjusted_in_1);
        assert(mid_out_aleo > 0u128);
        assert(mid_out_aleo <= MAX_U64);

        let (change_btcx, aleo_mid, f_hop_1): (token_registry.aleo/Token, credits.aleo/credits, Future) =
            privadex_amm_native_btcx_v5.aleo/swap_btcx_for_native(
                btcx_in,
                POOL_ALEO_BTCX,
                amount_in,
                reserve_aleo_btcx_a,
                reserve_aleo_btcx_b,
                fee_aleo_btcx,
                mid_out_aleo as u64,
            );

        let mid_amount: u64 = aleo_mid.microcredits;
        let (change_aleo, ethx_router_out, f_hop_2): (credits.aleo/credits, token_registry.aleo/Token, Future) =
            privadex_amm_native_ethx_v5.aleo/swap_native_for_ethx(
                aleo_mid,
                POOL_ALEO_ETHX,
                mid_amount,
                reserve_aleo_ethx_a,
                reserve_aleo_ethx_b,
                fee_aleo_ethx,
                min_out,
            );

        let (router_change, ethx_user_out, f_forward): (token_registry.aleo/Token, token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_private(
                self.signer,
                ethx_router_out.amount,
                ethx_router_out
            );

        let f: Future = fin_atomic_token(
            TOKEN_BTCX,
            TOKEN_ETHX,
            amount_in,
            ethx_user_out.amount,
            f_hop_1,
            f_hop_2,
            f_forward,
        );
        return (change_btcx, ethx_user_out, f);
    }

    // ETHx -> BTCx via ALEO
    async transition swap_ethx_for_btcx_via_aleo(
        ethx_in:                    token_registry.aleo/Token,
        amount_in:                  u128,
        reserve_aleo_ethx_a:        u128,
        reserve_aleo_ethx_b:        u128,
        fee_aleo_ethx:              u64,
        reserve_aleo_btcx_a:        u128,
        reserve_aleo_btcx_b:        u128,
        fee_aleo_btcx:              u64,
        min_out:                    u128,
    ) -> (token_registry.aleo/Token, token_registry.aleo/Token, Future) {
        assert(amount_in > 0u128);
        assert(ethx_in.token_id == 202field);

        let effective_fee_1: u64 = fee_aleo_ethx == 0u64 ? DEFAULT_FEE : fee_aleo_ethx;
        let adjusted_in_1: u128 = amount_in * (BPS_DENOM - effective_fee_1) as u128;
        let mid_out_aleo: u128 = (reserve_aleo_ethx_a * adjusted_in_1) / (reserve_aleo_ethx_b * BPS_DENOM as u128 + adjusted_in_1);
        assert(mid_out_aleo > 0u128);
        assert(mid_out_aleo <= MAX_U64);

        let (change_ethx, aleo_mid, f_hop_1): (token_registry.aleo/Token, credits.aleo/credits, Future) =
            privadex_amm_native_ethx_v5.aleo/swap_ethx_for_native(
                ethx_in,
                POOL_ALEO_ETHX,
                amount_in,
                reserve_aleo_ethx_a,
                reserve_aleo_ethx_b,
                fee_aleo_ethx,
                mid_out_aleo as u64,
            );

        let mid_amount: u64 = aleo_mid.microcredits;
        let (change_aleo, btcx_router_out, f_hop_2): (credits.aleo/credits, token_registry.aleo/Token, Future) =
            privadex_amm_native_btcx_v5.aleo/swap_native_for_btcx(
                aleo_mid,
                POOL_ALEO_BTCX,
                mid_amount,
                reserve_aleo_btcx_a,
                reserve_aleo_btcx_b,
                fee_aleo_btcx,
                min_out,
            );

        let (router_change, btcx_user_out, f_forward): (token_registry.aleo/Token, token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_private(
                self.signer,
                btcx_router_out.amount,
                btcx_router_out
            );

        let f: Future = fin_atomic_token(
            TOKEN_ETHX,
            TOKEN_BTCX,
            amount_in,
            btcx_user_out.amount,
            f_hop_1,
            f_hop_2,
            f_forward,
        );
        return (change_ethx, btcx_user_out, f);
    }

    // ALEO -> BTCx via ETHx
    async transition swap_aleo_for_btcx_via_ethx(
        credits_in:                 credits.aleo/credits,
        amount_in:                  u64,
        reserve_aleo_ethx_a:        u128,
        reserve_aleo_ethx_b:        u128,
        fee_aleo_ethx:              u64,
        reserve_btcx_ethx_a:        u128,
        reserve_btcx_ethx_b:        u128,
        fee_btcx_ethx:              u64,
        min_out:                    u128,
    ) -> (credits.aleo/credits, token_registry.aleo/Token, Future) {
        assert(amount_in > 0u64);
        assert(credits_in.microcredits >= amount_in);

        let amount_in_u128: u128 = amount_in as u128;
        let effective_fee_1: u64 = fee_aleo_ethx == 0u64 ? DEFAULT_FEE : fee_aleo_ethx;
        let adjusted_in_1: u128 = amount_in_u128 * (BPS_DENOM - effective_fee_1) as u128;
        let mid_out_ethx: u128 = (reserve_aleo_ethx_b * adjusted_in_1) / (reserve_aleo_ethx_a * BPS_DENOM as u128 + adjusted_in_1);
        assert(mid_out_ethx > 0u128);

        let (change_aleo, ethx_mid, f_hop_1): (credits.aleo/credits, token_registry.aleo/Token, Future) =
            privadex_amm_native_ethx_v5.aleo/swap_native_for_ethx(
                credits_in,
                POOL_ALEO_ETHX,
                amount_in,
                reserve_aleo_ethx_a,
                reserve_aleo_ethx_b,
                fee_aleo_ethx,
                mid_out_ethx,
            );

        let (change_ethx, btcx_router_out, f_hop_2): (token_registry.aleo/Token, token_registry.aleo/Token, Future) =
            privadex_amm_btcx_ethx_v4.aleo/swap_ethx_for_btcx(
                ethx_mid,
                POOL_BTCX_ETHX,
                mid_out_ethx,
                reserve_btcx_ethx_a,
                reserve_btcx_ethx_b,
                fee_btcx_ethx,
                min_out,
            );

        let (router_change, btcx_user_out, f_forward): (token_registry.aleo/Token, token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_private(
                self.signer,
                btcx_router_out.amount,
                btcx_router_out
            );

        let f: Future = fin_atomic_token(
            TOKEN_ALEO,
            TOKEN_BTCX,
            amount_in_u128,
            btcx_user_out.amount,
            f_hop_1,
            f_hop_2,
            f_forward,
        );
        return (change_aleo, btcx_user_out, f);
    }

    // BTCx -> ALEO via ETHx
    async transition swap_btcx_for_aleo_via_ethx(
        btcx_in:                    token_registry.aleo/Token,
        amount_in:                  u128,
        reserve_btcx_ethx_a:        u128,
        reserve_btcx_ethx_b:        u128,
        fee_btcx_ethx:              u64,
        reserve_aleo_ethx_a:        u128,
        reserve_aleo_ethx_b:        u128,
        fee_aleo_ethx:              u64,
        min_out:                    u64,
    ) -> (token_registry.aleo/Token, credits.aleo/credits, Future) {
        assert(amount_in > 0u128);
        assert(btcx_in.token_id == 201field);

        let effective_fee_1: u64 = fee_btcx_ethx == 0u64 ? DEFAULT_FEE : fee_btcx_ethx;
        let adjusted_in_1: u128 = amount_in * (BPS_DENOM - effective_fee_1) as u128;
        let mid_out_ethx: u128 = (reserve_btcx_ethx_b * adjusted_in_1) / (reserve_btcx_ethx_a * BPS_DENOM as u128 + adjusted_in_1);
        assert(mid_out_ethx > 0u128);

        let (change_btcx, ethx_mid, f_hop_1): (token_registry.aleo/Token, token_registry.aleo/Token, Future) =
            privadex_amm_btcx_ethx_v4.aleo/swap_btcx_for_ethx(
                btcx_in,
                POOL_BTCX_ETHX,
                amount_in,
                reserve_btcx_ethx_a,
                reserve_btcx_ethx_b,
                fee_btcx_ethx,
                mid_out_ethx,
            );

        let effective_fee_2: u64 = fee_aleo_ethx == 0u64 ? DEFAULT_FEE : fee_aleo_ethx;
        let adjusted_in_2: u128 = mid_out_ethx * (BPS_DENOM - effective_fee_2) as u128;
        let final_out_aleo: u128 = (reserve_aleo_ethx_a * adjusted_in_2) / (reserve_aleo_ethx_b * BPS_DENOM as u128 + adjusted_in_2);
        assert(final_out_aleo > 0u128);
        assert(final_out_aleo <= MAX_U64);

        let (change_ethx, aleo_router_out, f_hop_2): (token_registry.aleo/Token, credits.aleo/credits, Future) =
            privadex_amm_native_ethx_v5.aleo/swap_ethx_for_native(
                ethx_mid,
                POOL_ALEO_ETHX,
                mid_out_ethx,
                reserve_aleo_ethx_a,
                reserve_aleo_ethx_b,
                fee_aleo_ethx,
                min_out,
            );

        let final_amount: u128 = aleo_router_out.microcredits as u128;
        let (aleo_user_out, router_change): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(
                aleo_router_out,
                self.signer,
                aleo_router_out.microcredits
            );

        let f: Future = fin_atomic_credit(
            TOKEN_BTCX,
            TOKEN_ALEO,
            amount_in,
            final_amount,
            f_hop_1,
            f_hop_2,
        );
        return (change_btcx, aleo_user_out, f);
    }

    // ALEO -> ETHx via BTCx
    async transition swap_aleo_for_ethx_via_btcx(
        credits_in:                 credits.aleo/credits,
        amount_in:                  u64,
        reserve_aleo_btcx_a:        u128,
        reserve_aleo_btcx_b:        u128,
        fee_aleo_btcx:              u64,
        reserve_btcx_ethx_a:        u128,
        reserve_btcx_ethx_b:        u128,
        fee_btcx_ethx:              u64,
        min_out:                    u128,
    ) -> (credits.aleo/credits, token_registry.aleo/Token, Future) {
        assert(amount_in > 0u64);
        assert(credits_in.microcredits >= amount_in);

        let amount_in_u128: u128 = amount_in as u128;
        let effective_fee_1: u64 = fee_aleo_btcx == 0u64 ? DEFAULT_FEE : fee_aleo_btcx;
        let adjusted_in_1: u128 = amount_in_u128 * (BPS_DENOM - effective_fee_1) as u128;
        let mid_out_btcx: u128 = (reserve_aleo_btcx_b * adjusted_in_1) / (reserve_aleo_btcx_a * BPS_DENOM as u128 + adjusted_in_1);
        assert(mid_out_btcx > 0u128);

        let (change_aleo, btcx_mid, f_hop_1): (credits.aleo/credits, token_registry.aleo/Token, Future) =
            privadex_amm_native_btcx_v5.aleo/swap_native_for_btcx(
                credits_in,
                POOL_ALEO_BTCX,
                amount_in,
                reserve_aleo_btcx_a,
                reserve_aleo_btcx_b,
                fee_aleo_btcx,
                mid_out_btcx,
            );

        let (change_btcx, ethx_router_out, f_hop_2): (token_registry.aleo/Token, token_registry.aleo/Token, Future) =
            privadex_amm_btcx_ethx_v4.aleo/swap_btcx_for_ethx(
                btcx_mid,
                POOL_BTCX_ETHX,
                mid_out_btcx,
                reserve_btcx_ethx_a,
                reserve_btcx_ethx_b,
                fee_btcx_ethx,
                min_out,
            );

        let (router_change, ethx_user_out, f_forward): (token_registry.aleo/Token, token_registry.aleo/Token, Future) =
            token_registry.aleo/transfer_private(
                self.signer,
                ethx_router_out.amount,
                ethx_router_out
            );

        let f: Future = fin_atomic_token(
            TOKEN_ALEO,
            TOKEN_ETHX,
            amount_in_u128,
            ethx_user_out.amount,
            f_hop_1,
            f_hop_2,
            f_forward,
        );
        return (change_aleo, ethx_user_out, f);
    }

    // ETHx -> ALEO via BTCx
    async transition swap_ethx_for_aleo_via_btcx(
        ethx_in:                    token_registry.aleo/Token,
        amount_in:                  u128,
        reserve_btcx_ethx_a:        u128,
        reserve_btcx_ethx_b:        u128,
        fee_btcx_ethx:              u64,
        reserve_aleo_btcx_a:        u128,
        reserve_aleo_btcx_b:        u128,
        fee_aleo_btcx:              u64,
        min_out:                    u64,
    ) -> (token_registry.aleo/Token, credits.aleo/credits, Future) {
        assert(amount_in > 0u128);
        assert(ethx_in.token_id == 202field);

        let effective_fee_1: u64 = fee_btcx_ethx == 0u64 ? DEFAULT_FEE : fee_btcx_ethx;
        let adjusted_in_1: u128 = amount_in * (BPS_DENOM - effective_fee_1) as u128;
        let mid_out_btcx: u128 = (reserve_btcx_ethx_a * adjusted_in_1) / (reserve_btcx_ethx_b * BPS_DENOM as u128 + adjusted_in_1);
        assert(mid_out_btcx > 0u128);

        let (change_ethx, btcx_mid, f_hop_1): (token_registry.aleo/Token, token_registry.aleo/Token, Future) =
            privadex_amm_btcx_ethx_v4.aleo/swap_ethx_for_btcx(
                ethx_in,
                POOL_BTCX_ETHX,
                amount_in,
                reserve_btcx_ethx_a,
                reserve_btcx_ethx_b,
                fee_btcx_ethx,
                mid_out_btcx,
            );

        let effective_fee_2: u64 = fee_aleo_btcx == 0u64 ? DEFAULT_FEE : fee_aleo_btcx;
        let adjusted_in_2: u128 = mid_out_btcx * (BPS_DENOM - effective_fee_2) as u128;
        let final_out_aleo: u128 = (reserve_aleo_btcx_a * adjusted_in_2) / (reserve_aleo_btcx_b * BPS_DENOM as u128 + adjusted_in_2);
        assert(final_out_aleo > 0u128);
        assert(final_out_aleo <= MAX_U64);

        let (change_btcx, aleo_router_out, f_hop_2): (token_registry.aleo/Token, credits.aleo/credits, Future) =
            privadex_amm_native_btcx_v5.aleo/swap_btcx_for_native(
                btcx_mid,
                POOL_ALEO_BTCX,
                mid_out_btcx,
                reserve_aleo_btcx_a,
                reserve_aleo_btcx_b,
                fee_aleo_btcx,
                min_out,
            );

        let final_amount: u128 = aleo_router_out.microcredits as u128;
        let (aleo_user_out, router_change): (credits.aleo/credits, credits.aleo/credits) =
            credits.aleo/transfer_private(
                aleo_router_out,
                self.signer,
                aleo_router_out.microcredits
            );

        let f: Future = fin_atomic_credit(
            TOKEN_ETHX,
            TOKEN_ALEO,
            amount_in,
            final_amount,
            f_hop_1,
            f_hop_2,
        );
        return (change_ethx, aleo_user_out, f);
    }

    async function fin_atomic_token(
        token_in:   u64,
        token_out:  u64,
        amount_in:  u128,
        amount_out: u128,
        f_hop_1:    Future,
        f_hop_2:    Future,
        f_forward:  Future,
    ) {
        f_hop_1.await();
        f_hop_2.await();
        f_forward.await();

        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        assert(is_initialized);

        let input_volume: u128 = Mapping::get_or_use(total_routed_volume, token_in, 0u128);
        let output_volume: u128 = Mapping::get_or_use(total_output_volume, token_out, 0u128);
        let routes: u64 = Mapping::get_or_use(total_routes, token_in, 0u64);

        Mapping::set(total_routed_volume, token_in, input_volume + amount_in);
        Mapping::set(total_output_volume, token_out, output_volume + amount_out);
        Mapping::set(total_routes, token_in, routes + 1u64);
        Mapping::set(last_route_block, token_in, block.height);
    }

    async function fin_atomic_credit(
        token_in:   u64,
        token_out:  u64,
        amount_in:  u128,
        amount_out: u128,
        f_hop_1:    Future,
        f_hop_2:    Future,
    ) {
        f_hop_1.await();
        f_hop_2.await();

        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        assert(is_initialized);

        let input_volume: u128 = Mapping::get_or_use(total_routed_volume, token_in, 0u128);
        let output_volume: u128 = Mapping::get_or_use(total_output_volume, token_out, 0u128);
        let routes: u64 = Mapping::get_or_use(total_routes, token_in, 0u64);

        Mapping::set(total_routed_volume, token_in, input_volume + amount_in);
        Mapping::set(total_output_volume, token_out, output_volume + amount_out);
        Mapping::set(total_routes, token_in, routes + 1u64);
        Mapping::set(last_route_block, token_in, block.height);
    }

    // SUBMIT ROUTE INTENT
    async transition submit_route_intent(
        token_in:  u64,
        token_out: u64,
        amount_in: u128,
        min_out:   u128,
        max_hops:  u8,
        expiry:    u32,
        nonce:     field,
    ) -> (RouteIntent, Future) {
        assert(amount_in > 0u128);
        assert(max_hops > 0u8);

        let route_id: field = BHP256::hash_to_field(nonce);
        let intent: RouteIntent = RouteIntent {
            owner:     self.signer,
            route_id:  route_id,
            token_in:  token_in,
            token_out: token_out,
            amount_in: amount_in,
            min_out:   min_out,
            max_hops:  max_hops,
            expiry:    expiry,
            nonce:     nonce,
        };

        let f: Future = finalize_submit_route_intent(
            route_id,
            token_in,
            expiry,
        );
        return (intent, f);
    }

    async function finalize_submit_route_intent(
        route_id: field,
        token_in: u64,
        expiry:   u32,
    ) {
        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        let seen: bool = Mapping::get_or_use(route_seen, route_id, false);
        assert(is_initialized);
        assert(!seen);
        assert(block.height <= expiry);

        Mapping::set(route_seen, route_id, true);
        Mapping::set(route_open, route_id, true);
        Mapping::set(route_cancelled, route_id, false);

        let routes: u64 = Mapping::get_or_use(total_routes, token_in, 0u64);
        Mapping::set(total_routes, token_in, routes + 1u64);
    }

    // EXECUTION SUCCESS ATTESTATION
    async transition execute_route(
        intent:        RouteIntent,
        amount_out:    u128,
        hops:          u8,
        venue_mask:    u8,
        execution_tx:  field,
    ) -> (RouteReceipt, Future) {
        assert(amount_out >= intent.min_out);
        assert(hops > 0u8);
        assert(hops <= intent.max_hops);

        let receipt: RouteReceipt = RouteReceipt {
            owner:        intent.owner,
            route_id:     intent.route_id,
            token_in:     intent.token_in,
            token_out:    intent.token_out,
            amount_in:    intent.amount_in,
            amount_out:   amount_out,
            hops:         hops,
            venue_mask:   venue_mask,
            execution_tx: execution_tx,
            success:      true,
        };

        let f: Future = finalize_execute_route(
            intent.route_id,
            intent.token_in,
            intent.token_out,
            intent.amount_in,
            amount_out,
            intent.expiry,
            self.caller,
        );
        return (receipt, f);
    }

    async function finalize_execute_route(
        route_id:    field,
        token_in:    u64,
        token_out:   u64,
        amount_in:   u128,
        amount_out:  u128,
        expiry:      u32,
        caller:      address,
    ) {
        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        let is_executor: bool = Mapping::get_or_use(executor_role, caller, false);
        let open: bool = Mapping::get_or_use(route_open, route_id, false);
        let cancelled: bool = Mapping::get_or_use(route_cancelled, route_id, false);
        assert(is_initialized);
        assert(is_executor);
        assert(open);
        assert(!cancelled);
        assert(block.height <= expiry);

        Mapping::set(route_open, route_id, false);

        let input_volume: u128 = Mapping::get_or_use(total_routed_volume, token_in, 0u128);
        let output_volume: u128 = Mapping::get_or_use(total_output_volume, token_out, 0u128);
        Mapping::set(total_routed_volume, token_in, input_volume + amount_in);
        Mapping::set(total_output_volume, token_out, output_volume + amount_out);
        Mapping::set(last_route_block, token_in, block.height);
    }

    // EXECUTION FAILURE ATTESTATION
    async transition fail_route(
        intent:       RouteIntent,
        venue_mask:   u8,
        execution_tx: field,
    ) -> (RouteReceipt, Future) {
        let receipt: RouteReceipt = RouteReceipt {
            owner:        intent.owner,
            route_id:     intent.route_id,
            token_in:     intent.token_in,
            token_out:    intent.token_out,
            amount_in:    intent.amount_in,
            amount_out:   0u128,
            hops:         0u8,
            venue_mask:   venue_mask,
            execution_tx: execution_tx,
            success:      false,
        };

        let f: Future = finalize_fail_route(
            intent.route_id,
            self.caller,
        );
        return (receipt, f);
    }

    async function finalize_fail_route(
        route_id: field,
        caller:   address,
    ) {
        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        let is_executor: bool = Mapping::get_or_use(executor_role, caller, false);
        let open: bool = Mapping::get_or_use(route_open, route_id, false);
        let cancelled: bool = Mapping::get_or_use(route_cancelled, route_id, false);
        assert(is_initialized);
        assert(is_executor);
        assert(open);
        assert(!cancelled);

        Mapping::set(route_open, route_id, false);
    }

    // OWNER CANCELLATION
    async transition cancel_route_intent(
        intent: RouteIntent,
    ) -> Future {
        assert(intent.owner == self.signer);

        let f: Future = finalize_cancel_route_intent(intent.route_id);
        return f;
    }

    async function finalize_cancel_route_intent(
        route_id: field,
    ) {
        let open: bool = Mapping::get_or_use(route_open, route_id, false);
        let cancelled: bool = Mapping::get_or_use(route_cancelled, route_id, false);
        assert(open);
        assert(!cancelled);

        Mapping::set(route_open, route_id, false);
        Mapping::set(route_cancelled, route_id, true);
    }

    // OFF-CHAIN QUOTE HELPER
    transition quote_best_route(
        amount_in: u128,
        res_a1:    u128,
        res_b1:    u128,
        res_a2:    u128,
        res_b2:    u128,
        res_a3:    u128,
        res_b3:    u128,
        fee:       u64,
    ) -> (u128, u8) {
        let adj1: u128 = amount_in * (BPS_DENOM - fee) as u128;
        let out_direct: u128 = (res_b1 * adj1) / (res_a1 * BPS_DENOM as u128 + adj1);
        let adj2: u128 = amount_in * (BPS_DENOM - fee) as u128;
        let mid: u128 = (res_b2 * adj2) / (res_a2 * BPS_DENOM as u128 + adj2);
        let adj3: u128 = mid * (BPS_DENOM - fee) as u128;
        let out_hop: u128 = (res_b3 * adj3) / (res_a3 * BPS_DENOM as u128 + adj3);
        return out_hop > out_direct ? (out_hop, 2u8) : (out_direct, 1u8);
    }
}
