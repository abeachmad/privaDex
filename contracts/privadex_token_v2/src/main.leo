// PrivaDEX Private Token Program
//
// Hardening goals:
//   - ALEO wrapping is now explicitly backed by credits escrowed in this program.
//   - Bridged assets can only be minted by authorized minters.
//   - Supply, backing, and cumulative activity metrics are tracked on-chain.
//   - Private record helpers enforce owner checks instead of relying on caller discipline.

import credits.aleo;

program privadex_token_v2.aleo {

    @noupgrade
    async constructor() {}

    record PrivateToken {
        owner:    address,
        token_id: u64,
        amount:   u128,
    }

    mapping initialized:         bool => bool;
    mapping admin_role:          address => bool;
    mapping minter_role:         address => bool;
    mapping supported_tokens:    u64 => bool;
    mapping total_supply:        u64 => u128;
    mapping backed_reserve:      u64 => u128;
    mapping cumulative_wrapped:  u64 => u128;
    mapping cumulative_unwrapped:u64 => u128;
    mapping cumulative_minted:   u64 => u128;
    mapping cumulative_burned:   u64 => u128;
    mapping last_activity_block: u64 => u32;

    const TOKEN_ALEO: u64 = 0u64;
    const TOKEN_USDC: u64 = 1u64;
    const TOKEN_ETH:  u64 = 2u64;
    const TOKEN_WBTC: u64 = 3u64;

    // INITIALIZATION AND ROLE MANAGEMENT
    async transition initialize(
        admin:  address,
        minter: address,
    ) -> Future {
        let f: Future = finalize_initialize(admin, minter, self.caller);
        return f;
    }

    async function finalize_initialize(
        admin: address,
        minter: address,
        caller: address,
    ) {
        let already_initialized: bool = Mapping::get_or_use(initialized, true, false);
        assert(!already_initialized);
        assert(caller == admin);

        Mapping::set(initialized, true, true);
        Mapping::set(admin_role, admin, true);
        Mapping::set(minter_role, minter, true);

        Mapping::set(supported_tokens, TOKEN_ALEO, true);
        Mapping::set(supported_tokens, TOKEN_USDC, true);
        Mapping::set(supported_tokens, TOKEN_ETH, true);
        Mapping::set(supported_tokens, TOKEN_WBTC, true);
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
        caller: address,
    ) {
        let is_admin: bool = Mapping::get_or_use(admin_role, caller, false);
        assert(is_admin);
        Mapping::set(admin_role, account, enabled);
    }

    async transition set_minter(
        account: address,
        enabled: bool,
    ) -> Future {
        let f: Future = finalize_set_minter(account, enabled, self.caller);
        return f;
    }

    async function finalize_set_minter(
        account: address,
        enabled: bool,
        caller: address,
    ) {
        let is_admin: bool = Mapping::get_or_use(admin_role, caller, false);
        assert(is_admin);
        Mapping::set(minter_role, account, enabled);
    }

    async transition set_supported_token(
        token_id: u64,
        enabled:  bool,
    ) -> Future {
        let f: Future = finalize_set_supported_token(token_id, enabled, self.caller);
        return f;
    }

    async function finalize_set_supported_token(
        token_id: u64,
        enabled:  bool,
        caller:   address,
    ) {
        let is_admin: bool = Mapping::get_or_use(admin_role, caller, false);
        assert(is_admin);
        Mapping::set(supported_tokens, token_id, enabled);
    }

    // WRAP BACKED ALEO
    async transition wrap(
        credits_in: credits.aleo/credits,
        amount:     u64,
    ) -> (PrivateToken, credits.aleo/credits, Future) {
        assert(amount > 0u64);
        assert(credits_in.microcredits >= amount);

        let token: PrivateToken = PrivateToken {
            owner:    self.signer,
            token_id: TOKEN_ALEO,
            amount:   amount as u128,
        };

        let (change, f_lock): (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(
                credits_in, self.address, amount
            );

        let f: Future = finalize_wrap(amount as u128, f_lock);
        return (token, change, f);
    }

    async function finalize_wrap(
        amount: u128,
        f_lock: Future,
    ) {
        f_lock.await();

        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        let aleo_supported: bool = Mapping::get_or_use(supported_tokens, TOKEN_ALEO, false);
        assert(is_initialized);
        assert(aleo_supported);

        let reserve: u128 = Mapping::get_or_use(backed_reserve, TOKEN_ALEO, 0u128);
        let supply: u128 = Mapping::get_or_use(total_supply, TOKEN_ALEO, 0u128);
        let wrapped: u128 = Mapping::get_or_use(cumulative_wrapped, TOKEN_ALEO, 0u128);

        Mapping::set(backed_reserve, TOKEN_ALEO, reserve + amount);
        Mapping::set(total_supply, TOKEN_ALEO, supply + amount);
        Mapping::set(cumulative_wrapped, TOKEN_ALEO, wrapped + amount);
        Mapping::set(last_activity_block, TOKEN_ALEO, block.height);
    }

    // AUTHORIZED BRIDGE MINTING FOR NON-ALEO TOKENS
    async transition mint(
        recipient: address,
        token_id:  u64,
        amount:    u128,
    ) -> (PrivateToken, Future) {
        assert(amount > 0u128);
        assert(token_id != TOKEN_ALEO);

        let token: PrivateToken = PrivateToken {
            owner:    recipient,
            token_id: token_id,
            amount:   amount,
        };

        let f: Future = finalize_mint(recipient, token_id, amount, self.caller);
        return (token, f);
    }

    async function finalize_mint(
        recipient: address,
        token_id:  u64,
        amount:    u128,
        caller:    address,
    ) {
        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        let is_minter: bool = Mapping::get_or_use(minter_role, caller, false);
        let is_supported: bool = Mapping::get_or_use(supported_tokens, token_id, false);
        assert(is_initialized);
        assert(is_minter);
        assert(is_supported);
        assert(recipient != self.address);

        let supply: u128 = Mapping::get_or_use(total_supply, token_id, 0u128);
        let minted: u128 = Mapping::get_or_use(cumulative_minted, token_id, 0u128);

        Mapping::set(total_supply, token_id, supply + amount);
        Mapping::set(cumulative_minted, token_id, minted + amount);
        Mapping::set(last_activity_block, token_id, block.height);
    }

    // BURN NON-ALEO TOKENS FOR BRIDGE REDEMPTION
    async transition burn(
        input: PrivateToken,
    ) -> Future {
        assert(input.owner == self.signer);
        assert(input.amount > 0u128);
        assert(input.token_id != TOKEN_ALEO);

        let f: Future = finalize_burn(input.token_id, input.amount);
        return f;
    }

    async function finalize_burn(
        token_id: u64,
        amount:   u128,
    ) {
        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        let supply: u128 = Mapping::get_or_use(total_supply, token_id, 0u128);
        let burned: u128 = Mapping::get_or_use(cumulative_burned, token_id, 0u128);
        assert(is_initialized);
        assert(supply >= amount);

        Mapping::set(total_supply, token_id, supply - amount);
        Mapping::set(cumulative_burned, token_id, burned + amount);
        Mapping::set(last_activity_block, token_id, block.height);
    }

    // UNWRAP BACKED ALEO
    async transition unwrap(
        input: PrivateToken,
    ) -> (credits.aleo/credits, Future) {
        assert(input.owner == self.signer);
        assert(input.token_id == TOKEN_ALEO);
        assert(input.amount > 0u128);

        let amount_u64: u64 = input.amount as u64;
        let (credits_out, f_release): (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(
                self.signer, amount_u64
            );

        let f: Future = finalize_unwrap(input.amount, f_release);
        return (credits_out, f);
    }

    async function finalize_unwrap(
        amount:    u128,
        f_release: Future,
    ) {
        f_release.await();

        let is_initialized: bool = Mapping::get_or_use(initialized, true, false);
        let reserve: u128 = Mapping::get_or_use(backed_reserve, TOKEN_ALEO, 0u128);
        let supply: u128 = Mapping::get_or_use(total_supply, TOKEN_ALEO, 0u128);
        let unwrapped: u128 = Mapping::get_or_use(cumulative_unwrapped, TOKEN_ALEO, 0u128);
        assert(is_initialized);
        assert(reserve >= amount);
        assert(supply >= amount);

        Mapping::set(backed_reserve, TOKEN_ALEO, reserve - amount);
        Mapping::set(total_supply, TOKEN_ALEO, supply - amount);
        Mapping::set(cumulative_unwrapped, TOKEN_ALEO, unwrapped + amount);
        Mapping::set(last_activity_block, TOKEN_ALEO, block.height);
    }

    // PRIVATE RECORD HELPERS
    transition transfer_private(
        input:     PrivateToken,
        recipient: address,
        amount:    u128,
    ) -> (PrivateToken, PrivateToken) {
        assert(input.owner == self.signer);
        assert(amount > 0u128);
        assert(amount < input.amount);

        let out: PrivateToken = PrivateToken {
            owner:    recipient,
            token_id: input.token_id,
            amount:   amount,
        };

        let change: PrivateToken = PrivateToken {
            owner:    self.signer,
            token_id: input.token_id,
            amount:   input.amount - amount,
        };

        return (out, change);
    }

    transition transfer_private_all(
        input:     PrivateToken,
        recipient: address,
    ) -> PrivateToken {
        assert(input.owner == self.signer);
        assert(input.amount > 0u128);

        return PrivateToken {
            owner:    recipient,
            token_id: input.token_id,
            amount:   input.amount,
        };
    }

    transition split(
        input:  PrivateToken,
        amount: u128,
    ) -> (PrivateToken, PrivateToken) {
        assert(input.owner == self.signer);
        assert(amount > 0u128);
        assert(amount < input.amount);

        let exact: PrivateToken = PrivateToken {
            owner:    self.signer,
            token_id: input.token_id,
            amount:   amount,
        };

        let remainder: PrivateToken = PrivateToken {
            owner:    self.signer,
            token_id: input.token_id,
            amount:   input.amount - amount,
        };

        return (exact, remainder);
    }

    transition join(
        a: PrivateToken,
        b: PrivateToken,
    ) -> PrivateToken {
        assert(a.owner == self.signer);
        assert(b.owner == self.signer);
        assert(a.token_id == b.token_id);

        return PrivateToken {
            owner:    self.signer,
            token_id: a.token_id,
            amount:   a.amount + b.amount,
        };
    }
}
