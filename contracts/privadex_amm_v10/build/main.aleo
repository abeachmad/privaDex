import credits.aleo;
import merkle_tree.aleo;
import test_usdcx_multisig_core.aleo;
import test_usdcx_freezelist.aleo;
import test_usdcx_stablecoin.aleo;
program privadex_amm_v10.aleo;

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

function assert_pool_snapshot:
    input r0 as u64.private;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as u64.private;
    async assert_pool_snapshot r0 r1 r2 r3 into r4;
    output r4 as privadex_amm_v10.aleo/assert_pool_snapshot.future;

finalize assert_pool_snapshot:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u64.public;
    get.or_use reserve_a[r0] 0u128 into r4;
    get.or_use reserve_b[r0] 0u128 into r5;
    get.or_use fee_bps[r0] 30u64 into r6;
    is.eq r4 r1 into r7;
    assert.eq r7 true;
    is.eq r5 r2 into r8;
    assert.eq r8 true;
    is.eq r6 r3 into r9;
    assert.eq r9 true;

function add_liquidity:
    input r0 as credits.aleo/credits.record;
    input r1 as test_usdcx_stablecoin.aleo/Token.record;
    input r2 as [test_usdcx_stablecoin.aleo/MerkleProof; 2u32].private;
    input r3 as u64.private;
    input r4 as u64.private;
    input r5 as u128.private;
    input r6 as u128.private;
    input r7 as u128.private;
    input r8 as u128.private;
    input r9 as u128.private;
    gt r4 0u64 into r10;
    assert.eq r10 true;
    gt r5 0u128 into r11;
    assert.eq r11 true;
    gte r0.microcredits r4 into r12;
    assert.eq r12 true;
    cast r4 into r13 as u128;
    is.eq r8 0u128 into r14;
    is.eq r6 0u128 into r15;
    not r14 into r16;
    or r15 r16 into r17;
    assert.eq r17 true;
    is.eq r7 0u128 into r18;
    or r18 r16 into r19;
    assert.eq r19 true;
    gt r6 0u128 into r20;
    not r16 into r21;
    or r20 r21 into r22;
    assert.eq r22 true;
    gt r7 0u128 into r23;
    or r23 r21 into r24;
    assert.eq r24 true;
    mul r13 r5 into r25;
    mul r13 r8 into r26;
    ternary r20 r6 1u128 into r27;
    div r26 r27 into r28;
    ternary r14 r25 r28 into r29;
    mul r5 r8 into r30;
    ternary r23 r7 1u128 into r31;
    div r30 r31 into r32;
    ternary r14 r25 r32 into r33;
    lte r29 r33 into r34;
    ternary r34 r29 r33 into r35;
    gt r35 0u128 into r36;
    assert.eq r36 true;
    gte r35 r9 into r37;
    assert.eq r37 true;
    call credits.aleo/transfer_private_to_public r0 privadex_amm_v10.aleo r4 into r38 r39;
    call test_usdcx_stablecoin.aleo/transfer_private_to_public privadex_amm_v10.aleo r5 r1 r2 into r40 r41 r42;
    cast self.signer r3 r35 into r43 as LPPosition.record;
    async add_liquidity r3 r13 r5 r6 r7 r8 r35 r39 r42 into r44;
    output r43 as LPPosition.record;
    output r38 as credits.aleo/credits.record;
    output r40 as test_usdcx_stablecoin.aleo/ComplianceRecord.record;
    output r41 as test_usdcx_stablecoin.aleo/Token.record;
    output r44 as privadex_amm_v10.aleo/add_liquidity.future;

finalize add_liquidity:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as credits.aleo/transfer_private_to_public.future;
    input r8 as test_usdcx_stablecoin.aleo/transfer_private_to_public.future;
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
    call test_usdcx_stablecoin.aleo/transfer_public_to_private self.caller r12 into r19 r20 r21;
    async remove_liquidity r0.pool_id r0.shares r1 r2 r3 r10 r12 r18 r21 into r22;
    output r17 as credits.aleo/credits.record;
    output r19 as test_usdcx_stablecoin.aleo/ComplianceRecord.record;
    output r20 as test_usdcx_stablecoin.aleo/Token.record;
    output r22 as privadex_amm_v10.aleo/remove_liquidity.future;

finalize remove_liquidity:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as credits.aleo/transfer_public_to_private.future;
    input r8 as test_usdcx_stablecoin.aleo/transfer_public_to_private.future;
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

function swap_aleo_for_usdcx:
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
    call credits.aleo/transfer_private_to_public r0 privadex_amm_v10.aleo r2 into r22 r23;
    call test_usdcx_stablecoin.aleo/transfer_public_to_private self.caller r20 into r24 r25 r26;
    cast r13 into r27 as u128;
    mul r11 r27 into r28;
    div r28 10000u128 into r29;
    async swap_aleo_for_usdcx r1 r11 r20 r3 r4 r13 r29 r23 r26 into r30;
    output r22 as credits.aleo/credits.record;
    output r24 as test_usdcx_stablecoin.aleo/ComplianceRecord.record;
    output r25 as test_usdcx_stablecoin.aleo/Token.record;
    output r30 as privadex_amm_v10.aleo/swap_aleo_for_usdcx.future;

finalize swap_aleo_for_usdcx:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u64.public;
    input r6 as u128.public;
    input r7 as credits.aleo/transfer_private_to_public.future;
    input r8 as test_usdcx_stablecoin.aleo/transfer_public_to_private.future;
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

function swap_usdcx_for_aleo:
    input r0 as test_usdcx_stablecoin.aleo/Token.record;
    input r1 as [test_usdcx_stablecoin.aleo/MerkleProof; 2u32].private;
    input r2 as u64.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u128.private;
    input r6 as u64.private;
    input r7 as u64.private;
    gt r3 0u128 into r8;
    assert.eq r8 true;
    gt r4 0u128 into r9;
    assert.eq r9 true;
    gt r5 0u128 into r10;
    assert.eq r10 true;
    is.eq r6 0u64 into r11;
    ternary r11 30u64 r6 into r12;
    sub 10000u64 r12 into r13;
    cast r13 into r14 as u128;
    mul r3 r14 into r15;
    mul r4 r15 into r16;
    mul r5 10000u128 into r17;
    add r17 r15 into r18;
    div r16 r18 into r19;
    cast r7 into r20 as u128;
    gte r19 r20 into r21;
    assert.eq r21 true;
    call test_usdcx_stablecoin.aleo/transfer_private_to_public privadex_amm_v10.aleo r3 r0 r1 into r22 r23 r24;
    cast r19 into r25 as u64;
    call credits.aleo/transfer_public_to_private self.caller r25 into r26 r27;
    cast r12 into r28 as u128;
    mul r3 r28 into r29;
    div r29 10000u128 into r30;
    async swap_usdcx_for_aleo r2 r3 r19 r4 r5 r12 r30 r24 r27 into r31;
    output r26 as credits.aleo/credits.record;
    output r22 as test_usdcx_stablecoin.aleo/ComplianceRecord.record;
    output r23 as test_usdcx_stablecoin.aleo/Token.record;
    output r31 as privadex_amm_v10.aleo/swap_usdcx_for_aleo.future;

finalize swap_usdcx_for_aleo:
    input r0 as u64.public;
    input r1 as u128.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u64.public;
    input r6 as u128.public;
    input r7 as test_usdcx_stablecoin.aleo/transfer_private_to_public.future;
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
