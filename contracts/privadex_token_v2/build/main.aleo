import credits.aleo;
program privadex_token_v2.aleo;

record PrivateToken:
    owner as address.private;
    token_id as u64.private;
    amount as u128.private;

mapping initialized:
    key as boolean.public;
    value as boolean.public;

mapping admin_role:
    key as address.public;
    value as boolean.public;

mapping minter_role:
    key as address.public;
    value as boolean.public;

mapping supported_tokens:
    key as u64.public;
    value as boolean.public;

mapping total_supply:
    key as u64.public;
    value as u128.public;

mapping backed_reserve:
    key as u64.public;
    value as u128.public;

mapping cumulative_wrapped:
    key as u64.public;
    value as u128.public;

mapping cumulative_unwrapped:
    key as u64.public;
    value as u128.public;

mapping cumulative_minted:
    key as u64.public;
    value as u128.public;

mapping cumulative_burned:
    key as u64.public;
    value as u128.public;

mapping last_activity_block:
    key as u64.public;
    value as u32.public;

function initialize:
    input r0 as address.private;
    input r1 as address.private;
    async initialize r0 r1 self.caller into r2;
    output r2 as privadex_token_v2.aleo/initialize.future;

finalize initialize:
    input r0 as address.public;
    input r1 as address.public;
    input r2 as address.public;
    get.or_use initialized[true] false into r3;
    not r3 into r4;
    assert.eq r4 true;
    is.eq r2 r0 into r5;
    assert.eq r5 true;
    set true into initialized[true];
    set true into admin_role[r0];
    set true into minter_role[r1];
    set true into supported_tokens[0u64];
    set true into supported_tokens[1u64];
    set true into supported_tokens[2u64];
    set true into supported_tokens[3u64];

function set_admin:
    input r0 as address.private;
    input r1 as boolean.private;
    async set_admin r0 r1 self.caller into r2;
    output r2 as privadex_token_v2.aleo/set_admin.future;

finalize set_admin:
    input r0 as address.public;
    input r1 as boolean.public;
    input r2 as address.public;
    get.or_use admin_role[r2] false into r3;
    assert.eq r3 true;
    set r1 into admin_role[r0];

function set_minter:
    input r0 as address.private;
    input r1 as boolean.private;
    async set_minter r0 r1 self.caller into r2;
    output r2 as privadex_token_v2.aleo/set_minter.future;

finalize set_minter:
    input r0 as address.public;
    input r1 as boolean.public;
    input r2 as address.public;
    get.or_use admin_role[r2] false into r3;
    assert.eq r3 true;
    set r1 into minter_role[r0];

function set_supported_token:
    input r0 as u64.private;
    input r1 as boolean.private;
    async set_supported_token r0 r1 self.caller into r2;
    output r2 as privadex_token_v2.aleo/set_supported_token.future;

finalize set_supported_token:
    input r0 as u64.public;
    input r1 as boolean.public;
    input r2 as address.public;
    get.or_use admin_role[r2] false into r3;
    assert.eq r3 true;
    set r1 into supported_tokens[r0];

function wrap:
    input r0 as credits.aleo/credits.record;
    input r1 as u64.private;
    gt r1 0u64 into r2;
    assert.eq r2 true;
    gte r0.microcredits r1 into r3;
    assert.eq r3 true;
    cast r1 into r4 as u128;
    cast self.signer 0u64 r4 into r5 as PrivateToken.record;
    call credits.aleo/transfer_private_to_public r0 privadex_token_v2.aleo r1 into r6 r7;
    cast r1 into r8 as u128;
    async wrap r8 r7 into r9;
    output r5 as PrivateToken.record;
    output r6 as credits.aleo/credits.record;
    output r9 as privadex_token_v2.aleo/wrap.future;

finalize wrap:
    input r0 as u128.public;
    input r1 as credits.aleo/transfer_private_to_public.future;
    await r1;
    get.or_use initialized[true] false into r2;
    get.or_use supported_tokens[0u64] false into r3;
    assert.eq r2 true;
    assert.eq r3 true;
    get.or_use backed_reserve[0u64] 0u128 into r4;
    get.or_use total_supply[0u64] 0u128 into r5;
    get.or_use cumulative_wrapped[0u64] 0u128 into r6;
    add r4 r0 into r7;
    set r7 into backed_reserve[0u64];
    add r5 r0 into r8;
    set r8 into total_supply[0u64];
    add r6 r0 into r9;
    set r9 into cumulative_wrapped[0u64];
    set block.height into last_activity_block[0u64];

function mint:
    input r0 as address.private;
    input r1 as u64.private;
    input r2 as u128.private;
    gt r2 0u128 into r3;
    assert.eq r3 true;
    is.neq r1 0u64 into r4;
    assert.eq r4 true;
    cast r0 r1 r2 into r5 as PrivateToken.record;
    async mint r0 r1 r2 self.caller into r6;
    output r5 as PrivateToken.record;
    output r6 as privadex_token_v2.aleo/mint.future;

finalize mint:
    input r0 as address.public;
    input r1 as u64.public;
    input r2 as u128.public;
    input r3 as address.public;
    get.or_use initialized[true] false into r4;
    get.or_use minter_role[r3] false into r5;
    get.or_use supported_tokens[r1] false into r6;
    assert.eq r4 true;
    assert.eq r5 true;
    assert.eq r6 true;
    is.neq r0 privadex_token_v2.aleo into r7;
    assert.eq r7 true;
    get.or_use total_supply[r1] 0u128 into r8;
    get.or_use cumulative_minted[r1] 0u128 into r9;
    add r8 r2 into r10;
    set r10 into total_supply[r1];
    add r9 r2 into r11;
    set r11 into cumulative_minted[r1];
    set block.height into last_activity_block[r1];

function burn:
    input r0 as PrivateToken.record;
    is.eq r0.owner self.signer into r1;
    assert.eq r1 true;
    gt r0.amount 0u128 into r2;
    assert.eq r2 true;
    is.neq r0.token_id 0u64 into r3;
    assert.eq r3 true;
    async burn r0.token_id r0.amount into r4;
    output r4 as privadex_token_v2.aleo/burn.future;

finalize burn:
    input r0 as u64.public;
    input r1 as u128.public;
    get.or_use initialized[true] false into r2;
    get.or_use total_supply[r0] 0u128 into r3;
    get.or_use cumulative_burned[r0] 0u128 into r4;
    assert.eq r2 true;
    gte r3 r1 into r5;
    assert.eq r5 true;
    sub r3 r1 into r6;
    set r6 into total_supply[r0];
    add r4 r1 into r7;
    set r7 into cumulative_burned[r0];
    set block.height into last_activity_block[r0];

function unwrap:
    input r0 as PrivateToken.record;
    is.eq r0.owner self.signer into r1;
    assert.eq r1 true;
    is.eq r0.token_id 0u64 into r2;
    assert.eq r2 true;
    gt r0.amount 0u128 into r3;
    assert.eq r3 true;
    cast r0.amount into r4 as u64;
    call credits.aleo/transfer_public_to_private self.signer r4 into r5 r6;
    async unwrap r0.amount r6 into r7;
    output r5 as credits.aleo/credits.record;
    output r7 as privadex_token_v2.aleo/unwrap.future;

finalize unwrap:
    input r0 as u128.public;
    input r1 as credits.aleo/transfer_public_to_private.future;
    await r1;
    get.or_use initialized[true] false into r2;
    get.or_use backed_reserve[0u64] 0u128 into r3;
    get.or_use total_supply[0u64] 0u128 into r4;
    get.or_use cumulative_unwrapped[0u64] 0u128 into r5;
    assert.eq r2 true;
    gte r3 r0 into r6;
    assert.eq r6 true;
    gte r4 r0 into r7;
    assert.eq r7 true;
    sub r3 r0 into r8;
    set r8 into backed_reserve[0u64];
    sub r4 r0 into r9;
    set r9 into total_supply[0u64];
    add r5 r0 into r10;
    set r10 into cumulative_unwrapped[0u64];
    set block.height into last_activity_block[0u64];

function transfer_private:
    input r0 as PrivateToken.record;
    input r1 as address.private;
    input r2 as u128.private;
    is.eq r0.owner self.signer into r3;
    assert.eq r3 true;
    gt r2 0u128 into r4;
    assert.eq r4 true;
    lt r2 r0.amount into r5;
    assert.eq r5 true;
    cast r1 r0.token_id r2 into r6 as PrivateToken.record;
    sub r0.amount r2 into r7;
    cast self.signer r0.token_id r7 into r8 as PrivateToken.record;
    output r6 as PrivateToken.record;
    output r8 as PrivateToken.record;

function transfer_private_all:
    input r0 as PrivateToken.record;
    input r1 as address.private;
    is.eq r0.owner self.signer into r2;
    assert.eq r2 true;
    gt r0.amount 0u128 into r3;
    assert.eq r3 true;
    cast r1 r0.token_id r0.amount into r4 as PrivateToken.record;
    output r4 as PrivateToken.record;

function split:
    input r0 as PrivateToken.record;
    input r1 as u128.private;
    is.eq r0.owner self.signer into r2;
    assert.eq r2 true;
    gt r1 0u128 into r3;
    assert.eq r3 true;
    lt r1 r0.amount into r4;
    assert.eq r4 true;
    cast self.signer r0.token_id r1 into r5 as PrivateToken.record;
    sub r0.amount r1 into r6;
    cast self.signer r0.token_id r6 into r7 as PrivateToken.record;
    output r5 as PrivateToken.record;
    output r7 as PrivateToken.record;

function join:
    input r0 as PrivateToken.record;
    input r1 as PrivateToken.record;
    is.eq r0.owner self.signer into r2;
    assert.eq r2 true;
    is.eq r1.owner self.signer into r3;
    assert.eq r3 true;
    is.eq r0.token_id r1.token_id into r4;
    assert.eq r4 true;
    add r0.amount r1.amount into r5;
    cast self.signer r0.token_id r5 into r6 as PrivateToken.record;
    output r6 as PrivateToken.record;

constructor:
    assert.eq edition 0u16;
