// PrivaDEX Private Token Program
// Wraps Aleo credits into private token records for shielded trading

program privadex_token.aleo {

    // ─── Records ───────────────────────────────────────────────────────────
    record PrivateToken {
        owner:    address,
        token_id: u64,   // 0 = ALEO, 1 = USDC, 2 = ETH (wrapped), 3 = WBTC
        amount:   u128,
    }

    // ─── Mappings (public state) ────────────────────────────────────────────
    // Total supply per token
    mapping total_supply: u64 => u128;
    // Supported token ids
    mapping supported_tokens: u64 => bool;

    // ─── Constants ──────────────────────────────────────────────────────────
    const TOKEN_ALEO: u64 = 0u64;
    const TOKEN_USDC: u64 = 1u64;
    const TOKEN_ETH:  u64 = 2u64;
    const TOKEN_WBTC: u64 = 3u64;

    // ─── Wrap: convert public credits to private token record ───────────────
    // Caller pays `amount` credits publicly, receives private PrivateToken record
    async transition wrap(
        public  token_id: u64,
        public  amount:   u128,
    ) -> (PrivateToken, Future) {
        assert(token_id == TOKEN_ALEO);
        let token: PrivateToken = PrivateToken {
            owner:    self.caller,
            token_id: token_id,
            amount:   amount,
        };
        let f: Future = finalize_wrap(token_id, amount);
        return (token, f);
    }

    async function finalize_wrap(token_id: u64, amount: u128) {
        let supply: u128 = Mapping::get_or_use(total_supply, token_id, 0u128);
        Mapping::set(total_supply, token_id, supply + amount);
    }

    // ─── Mint (admin / bridge) ───────────────────────────────────────────────
    // For bridged tokens (USDC, ETH, WBTC) — called by bridge oracle
    async transition mint(
        public  recipient: address,
        public  token_id:  u64,
        public  amount:    u128,
    ) -> (PrivateToken, Future) {
        let token: PrivateToken = PrivateToken {
            owner:    recipient,
            token_id: token_id,
            amount:   amount,
        };
        let f: Future = finalize_mint(token_id, amount);
        return (token, f);
    }

    async function finalize_mint(token_id: u64, amount: u128) {
        let supply: u128 = Mapping::get_or_use(total_supply, token_id, 0u128);
        Mapping::set(total_supply, token_id, supply + amount);
    }

    // ─── Transfer private ────────────────────────────────────────────────────
    // Consume input record, produce two records: one for receiver, change for sender
    transition transfer_private(
        input:      PrivateToken,
        recipient:  address,
        amount:     u128,
    ) -> (PrivateToken, PrivateToken) {
        assert(input.amount >= amount);
        let change: u128 = input.amount - amount;
        let out: PrivateToken = PrivateToken {
            owner:    recipient,
            token_id: input.token_id,
            amount:   amount,
        };
        let back: PrivateToken = PrivateToken {
            owner:    self.caller,
            token_id: input.token_id,
            amount:   change,
        };
        return (out, back);
    }

    // ─── Burn (unwrap) ───────────────────────────────────────────────────────
    async transition unwrap(
        input: PrivateToken,
    ) -> Future {
        assert(input.token_id == TOKEN_ALEO);
        let f: Future = finalize_unwrap(input.token_id, input.amount);
        return f;
    }

    async function finalize_unwrap(token_id: u64, amount: u128) {
        let supply: u128 = Mapping::get_or_use(total_supply, token_id, 0u128);
        assert(supply >= amount);
        Mapping::set(total_supply, token_id, supply - amount);
    }

    // ─── Join two records into one ───────────────────────────────────────────
    transition join(a: PrivateToken, b: PrivateToken) -> PrivateToken {
        assert_eq(a.token_id, b.token_id);
        assert_eq(a.owner, b.owner);
        return PrivateToken {
            owner:    a.owner,
            token_id: a.token_id,
            amount:   a.amount + b.amount,
        };
    }
}
