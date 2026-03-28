import credits.aleo;
import token_registry.aleo;
program privadex_amm_native_btcx_v5.aleo;

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
    input r0 as credits.aleo/credits.record;
    input r1 as token_registry.aleo/Token.record;
    input r2 as u64.private;
    input r3 as u64.private;
    input r4 as u128.private;
    input r5 as u128.private;
    input r6 as u128.private;
    input r7 as u128.private;
    input r8 as u128.private;
    gt r3 0u64 into r9;
    assert.eq r9 true;
    gt r4 0u128 into r10;
    assert.eq r10 true;
    is.eq r1.token_id 201field into r11;
    assert.eq r11 true;
    gte r0.microcredits r3 into r12;
    assert.eq r12 true;
    cast r3 into r13 as u128;
    is.eq r7 0u128 into r14;
    is.eq r5 0u128 into r15;
    not r14 into r16;
    or r15 r16 into r17;
    assert.eq r17 true;
    is.eq r6 0u128 into r18;
    or r18 r16 into r19;
    assert.eq r19 true;
    gt r5 0u128 into r20;
    not r16 into r21;
    or r20 r21 into r22;
    assert.eq r22 true;
    gt r6 0u128 into r23;
    or r23 r21 into r24;
    assert.eq r24 true;
    mul r13 r4 into r25;
    mul r13 r7 into r26;
    div r26 r5 into r27;
    ternary r14 r25 r27 into r28;
    mul r4 r7 into r29;
    div r29 r6 into r30;
    ternary r14 r25 r30 into r31;
    lte r28 r31 into r32;
    ternary r32 r28 r31 into r33;
    gte r28 r31 into r34;
    sub r28 r31 into r35;
    sub r31 r28 into r36;
    ternary r34 r35 r36 into r37;
    gt r33 0u128 into r38;
    assert.eq r38 true;
    lte r37 1u128 into r39;
    assert.eq r39 true;
    gte r33 r8 into r40;
    assert.eq r40 true;
    call credits.aleo/transfer_private_to_public r0 privadex_amm_native_btcx_v5.aleo r3 into r41 r42;
    call token_registry.aleo/transfer_private_to_public privadex_amm_native_btcx_v5.aleo r4 r1 into r43 r44;
    cast self.signer r2 r33 into r45 as LPPosition.record;
    async add_liquidity r2 r13 r4 r5 r6 r7 r33 r42 r44 into r46;
    output r45 as LPPosition.record;
    output r41 as credits.aleo/credits.record;
    output r43 as token_registry.aleo/Token.record;
    output r46 as privadex_amm_native_btcx_v5.aleo/add_liquidity.future;

finalize add_liquidity:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as credits.aleo/transfer_private_to_public.future;
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
    input r4 as u64.private;
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
    cast r4 into r13 as u128;
    gte r10 r13 into r14;
    assert.eq r14 true;
    gte r12 r5 into r15;
    assert.eq r15 true;
    cast r10 into r16 as u64;
    call credits.aleo/transfer_public_to_private self.caller r16 into r17 r18;
    call token_registry.aleo/transfer_public_to_private 201field self.caller r12 false into r19 r20;
    async remove_liquidity r0.pool_id r0.shares r1 r2 r3 r10 r12 r18 r20 into r21;
    output r17 as credits.aleo/credits.record;
    output r19 as token_registry.aleo/Token.record;
    output r21 as privadex_amm_native_btcx_v5.aleo/remove_liquidity.future;

finalize remove_liquidity:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as credits.aleo/transfer_public_to_private.future;
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

function swap_native_for_btcx:
    input r0 as credits.aleo/credits.record;
    input r1 as u64.private;
    input r2 as u64.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u64.private;
    input r6 as u128.private;
    gt r2 0u64 into r7;
    assert.eq r7 true;
    gte r0.microcredits r2 into r8;
    assert.eq r8 true;
    gt r3 0u128 into r9;
    assert.eq r9 true;
    gt r4 0u128 into r10;
    assert.eq r10 true;
    cast r2 into r11 as u128;
    is.eq r5 0u64 into r12;
    ternary r12 30u64 r5 into r13;
    sub 10000u64 r13 into r14;
    cast r14 into r15 as u128;
    mul r11 r15 into r16;
    mul r4 r16 into r17;
    mul r3 10000u128 into r18;
    add r18 r16 into r19;
    div r17 r19 into r20;
    gte r20 r6 into r21;
    assert.eq r21 true;
    call credits.aleo/transfer_private_to_public r0 privadex_amm_native_btcx_v5.aleo r2 into r22 r23;
    call token_registry.aleo/transfer_public_to_private 201field self.caller r20 false into r24 r25;
    cast r13 into r26 as u128;
    mul r11 r26 into r27;
    div r27 10000u128 into r28;
    async swap_native_for_btcx r1 r11 r20 r3 r4 r13 r28 r23 r25 into r29;
    output r22 as credits.aleo/credits.record;
    output r24 as token_registry.aleo/Token.record;
    output r29 as privadex_amm_native_btcx_v5.aleo/swap_native_for_btcx.future;

finalize swap_native_for_btcx:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u64.public;
    input r6 as u128.public;
    input r7 as credits.aleo/transfer_private_to_public.future;
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

function swap_btcx_for_native:
    input r0 as token_registry.aleo/Token.record;
    input r1 as u64.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u64.private;
    input r6 as u64.private;
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
    mul r3 r15 into r16;
    mul r4 10000u128 into r17;
    add r17 r15 into r18;
    div r16 r18 into r19;
    cast r6 into r20 as u128;
    gte r19 r20 into r21;
    assert.eq r21 true;
    call token_registry.aleo/transfer_private_to_public privadex_amm_native_btcx_v5.aleo r2 r0 into r22 r23;
    cast r19 into r24 as u64;
    call credits.aleo/transfer_public_to_private self.caller r24 into r25 r26;
    cast r12 into r27 as u128;
    mul r2 r27 into r28;
    div r28 10000u128 into r29;
    async swap_btcx_for_native r1 r2 r19 r3 r4 r12 r29 r23 r26 into r30;
    output r22 as token_registry.aleo/Token.record;
    output r25 as credits.aleo/credits.record;
    output r30 as privadex_amm_native_btcx_v5.aleo/swap_btcx_for_native.future;

finalize swap_btcx_for_native:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u64.public;
    input r6 as u128.public;
    input r7 as token_registry.aleo/transfer_private_to_public.future;
    input r8 as credits.aleo/transfer_public_to_private.future;
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
