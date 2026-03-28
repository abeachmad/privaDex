import credits.aleo;
import token_registry.aleo;
program privadex_amm_btcx_ethx_v6.aleo;

record LPPosition:
    owner as address.private;
    pool_id as u64.private;
    shares as u128.private;

mapping reserve_a:
    key as u64.public;
    value as u128.public;

mapping reserve_b:
    key as u64.public;
    value as u128.public;

mapping total_shares:
    key as u64.public;
    value as u128.public;

mapping fee_bps:
    key as u64.public;
    value as u64.public;

mapping cumulative_volume_a:
    key as u64.public;
    value as u128.public;

mapping cumulative_volume_b:
    key as u64.public;
    value as u128.public;

mapping cumulative_fee_a:
    key as u64.public;
    value as u128.public;

mapping cumulative_fee_b:
    key as u64.public;
    value as u128.public;

mapping last_swap_block:
    key as u64.public;
    value as u32.public;

function add_liquidity:
    input r0 as token_registry.aleo/Token.record;
    input r1 as token_registry.aleo/Token.record;
    input r2 as u64.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u128.private;
    input r6 as u128.private;
    input r7 as u128.private;
    input r8 as u128.private;
    gt r3 0u128 into r9;
    assert.eq r9 true;
    gt r4 0u128 into r10;
    assert.eq r10 true;
    is.eq r0.token_id 201field into r11;
    assert.eq r11 true;
    is.eq r1.token_id 202field into r12;
    assert.eq r12 true;
    is.eq r7 0u128 into r13;
    is.eq r5 0u128 into r14;
    not r13 into r15;
    or r14 r15 into r16;
    assert.eq r16 true;
    is.eq r6 0u128 into r17;
    or r17 r15 into r18;
    assert.eq r18 true;
    gt r5 0u128 into r19;
    not r15 into r20;
    or r19 r20 into r21;
    assert.eq r21 true;
    gt r6 0u128 into r22;
    or r22 r20 into r23;
    assert.eq r23 true;
    mul r3 r4 into r24;
    mul r3 r7 into r25;
    ternary r19 r5 1u128 into r26;
    div r25 r26 into r27;
    ternary r13 r24 r27 into r28;
    mul r4 r7 into r29;
    ternary r22 r6 1u128 into r30;
    div r29 r30 into r31;
    ternary r13 r24 r31 into r32;
    lte r28 r32 into r33;
    ternary r33 r28 r32 into r34;
    gt r34 0u128 into r35;
    assert.eq r35 true;
    gte r34 r8 into r36;
    assert.eq r36 true;
    call token_registry.aleo/transfer_private_to_public privadex_amm_btcx_ethx_v6.aleo r3 r0 into r37 r38;
    call token_registry.aleo/transfer_private_to_public privadex_amm_btcx_ethx_v6.aleo r4 r1 into r39 r40;
    cast self.signer r2 r34 into r41 as LPPosition.record;
    async add_liquidity r2 r3 r4 r5 r6 r7 r34 r38 r40 into r42;
    output r41 as LPPosition.record;
    output r37 as token_registry.aleo/Token.record;
    output r39 as token_registry.aleo/Token.record;
    output r42 as privadex_amm_btcx_ethx_v6.aleo/add_liquidity.future;

finalize add_liquidity:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as token_registry.aleo/transfer_private_to_public.future;
    input r8 as token_registry.aleo/transfer_private_to_public.future;
    await r7;
    await r8;
    get.or_use reserve_a[r0] 0u128 into r9;
    get.or_use reserve_b[r0] 0u128 into r10;
    get.or_use total_shares[r0] 0u128 into r11;
    is.eq r9 r3 into r12;
    assert.eq r12 true;
    is.eq r10 r4 into r13;
    assert.eq r13 true;
    is.eq r11 r5 into r14;
    assert.eq r14 true;
    gt r6 0u128 into r15;
    assert.eq r15 true;
    add r3 r1 into r16;
    set r16 into reserve_a[r0];
    add r4 r2 into r17;
    set r17 into reserve_b[r0];
    add r5 r6 into r18;
    set r18 into total_shares[r0];

function remove_liquidity:
    input r0 as LPPosition.record;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u128.private;
    gt r0.shares 0u128 into r6;
    assert.eq r6 true;
    gt r3 0u128 into r7;
    assert.eq r7 true;
    lte r0.shares r3 into r8;
    assert.eq r8 true;
    mul r0.shares r1 into r9;
    div r9 r3 into r10;
    mul r0.shares r2 into r11;
    div r11 r3 into r12;
    gte r10 r4 into r13;
    assert.eq r13 true;
    gte r12 r5 into r14;
    assert.eq r14 true;
    call token_registry.aleo/transfer_public_to_private 201field self.caller r10 false into r15 r16;
    call token_registry.aleo/transfer_public_to_private 202field self.caller r12 false into r17 r18;
    async remove_liquidity r0.pool_id r0.shares r1 r2 r3 r10 r12 r16 r18 into r19;
    output r15 as token_registry.aleo/Token.record;
    output r17 as token_registry.aleo/Token.record;
    output r19 as privadex_amm_btcx_ethx_v6.aleo/remove_liquidity.future;

finalize remove_liquidity:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as token_registry.aleo/transfer_public_to_private.future;
    input r8 as token_registry.aleo/transfer_public_to_private.future;
    await r7;
    await r8;
    get reserve_a[r0] into r9;
    get reserve_b[r0] into r10;
    get total_shares[r0] into r11;
    is.eq r9 r2 into r12;
    assert.eq r12 true;
    is.eq r10 r3 into r13;
    assert.eq r13 true;
    is.eq r11 r4 into r14;
    assert.eq r14 true;
    sub r2 r5 into r15;
    set r15 into reserve_a[r0];
    sub r3 r6 into r16;
    set r16 into reserve_b[r0];
    sub r4 r1 into r17;
    set r17 into total_shares[r0];

function swap_btcx_for_ethx:
    input r0 as token_registry.aleo/Token.record;
    input r1 as u64.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u64.private;
    input r6 as u128.private;
    gt r2 0u128 into r7;
    assert.eq r7 true;
    is.eq r0.token_id 201field into r8;
    assert.eq r8 true;
    gt r3 0u128 into r9;
    assert.eq r9 true;
    gt r4 0u128 into r10;
    assert.eq r10 true;
    is.eq r5 0u64 into r11;
    ternary r11 30u64 r5 into r12;
    sub 10000u64 r12 into r13;
    cast r13 into r14 as u128;
    mul r2 r14 into r15;
    mul r4 r15 into r16;
    mul r3 10000u128 into r17;
    add r17 r15 into r18;
    div r16 r18 into r19;
    gte r19 r6 into r20;
    assert.eq r20 true;
    call token_registry.aleo/transfer_private_to_public privadex_amm_btcx_ethx_v6.aleo r2 r0 into r21 r22;
    call token_registry.aleo/transfer_public_to_private 202field self.caller r19 false into r23 r24;
    cast r12 into r25 as u128;
    mul r2 r25 into r26;
    div r26 10000u128 into r27;
    async swap_btcx_for_ethx r1 r2 r19 r3 r4 r12 r27 r22 r24 into r28;
    output r21 as token_registry.aleo/Token.record;
    output r23 as token_registry.aleo/Token.record;
    output r28 as privadex_amm_btcx_ethx_v6.aleo/swap_btcx_for_ethx.future;

finalize swap_btcx_for_ethx:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u64.public;
    input r6 as u128.public;
    input r7 as token_registry.aleo/transfer_private_to_public.future;
    input r8 as token_registry.aleo/transfer_public_to_private.future;
    await r7;
    await r8;
    get reserve_a[r0] into r9;
    get reserve_b[r0] into r10;
    get.or_use fee_bps[r0] 30u64 into r11;
    is.eq r9 r3 into r12;
    assert.eq r12 true;
    is.eq r10 r4 into r13;
    assert.eq r13 true;
    is.eq r11 r5 into r14;
    assert.eq r14 true;
    add r3 r1 into r15;
    set r15 into reserve_a[r0];
    sub r4 r2 into r16;
    set r16 into reserve_b[r0];
    get.or_use cumulative_volume_a[r0] 0u128 into r17;
    get.or_use cumulative_fee_a[r0] 0u128 into r18;
    add r17 r1 into r19;
    set r19 into cumulative_volume_a[r0];
    add r18 r6 into r20;
    set r20 into cumulative_fee_a[r0];
    set block.height into last_swap_block[r0];

function swap_ethx_for_btcx:
    input r0 as token_registry.aleo/Token.record;
    input r1 as u64.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u64.private;
    input r6 as u128.private;
    gt r2 0u128 into r7;
    assert.eq r7 true;
    is.eq r0.token_id 202field into r8;
    assert.eq r8 true;
    gt r3 0u128 into r9;
    assert.eq r9 true;
    gt r4 0u128 into r10;
    assert.eq r10 true;
    is.eq r5 0u64 into r11;
    ternary r11 30u64 r5 into r12;
    sub 10000u64 r12 into r13;
    cast r13 into r14 as u128;
    mul r2 r14 into r15;
    mul r3 r15 into r16;
    mul r4 10000u128 into r17;
    add r17 r15 into r18;
    div r16 r18 into r19;
    gte r19 r6 into r20;
    assert.eq r20 true;
    call token_registry.aleo/transfer_private_to_public privadex_amm_btcx_ethx_v6.aleo r2 r0 into r21 r22;
    call token_registry.aleo/transfer_public_to_private 201field self.caller r19 false into r23 r24;
    cast r12 into r25 as u128;
    mul r2 r25 into r26;
    div r26 10000u128 into r27;
    async swap_ethx_for_btcx r1 r2 r19 r3 r4 r12 r27 r22 r24 into r28;
    output r21 as token_registry.aleo/Token.record;
    output r23 as token_registry.aleo/Token.record;
    output r28 as privadex_amm_btcx_ethx_v6.aleo/swap_ethx_for_btcx.future;

finalize swap_ethx_for_btcx:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u64.public;
    input r6 as u128.public;
    input r7 as token_registry.aleo/transfer_private_to_public.future;
    input r8 as token_registry.aleo/transfer_public_to_private.future;
    await r7;
    await r8;
    get reserve_a[r0] into r9;
    get reserve_b[r0] into r10;
    get.or_use fee_bps[r0] 30u64 into r11;
    is.eq r9 r3 into r12;
    assert.eq r12 true;
    is.eq r10 r4 into r13;
    assert.eq r13 true;
    is.eq r11 r5 into r14;
    assert.eq r14 true;
    sub r3 r2 into r15;
    set r15 into reserve_a[r0];
    add r4 r1 into r16;
    set r16 into reserve_b[r0];
    get.or_use cumulative_volume_b[r0] 0u128 into r17;
    get.or_use cumulative_fee_b[r0] 0u128 into r18;
    add r17 r1 into r19;
    set r19 into cumulative_volume_b[r0];
    add r18 r6 into r20;
    set r20 into cumulative_fee_b[r0];
    set block.height into last_swap_block[r0];

constructor:
    assert.eq edition 0u16;
