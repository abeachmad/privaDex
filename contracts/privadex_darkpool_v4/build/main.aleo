import credits.aleo;
import merkle_tree.aleo;
import test_usdcx_multisig_core.aleo;
import test_usdcx_freezelist.aleo;
import test_usdcx_stablecoin.aleo;
import privadex_amm_v8.aleo;
program privadex_darkpool_v4.aleo;

record DarkIntent:
    owner as address.private;
    epoch_id as u64.private;
    pool_id as u64.private;
    is_buy as boolean.private;
    amount as u128.private;
    min_out as u128.private;
    nonce as field.private;

record DarkReceipt:
    owner as address.private;
    epoch_id as u64.private;
    pool_id as u64.private;
    is_buy as boolean.private;
    matched_input as u128.private;
    refund_input as u128.private;
    amount_out as u128.private;
    fee_paid as u128.private;
    mid_price as u128.private;

mapping initialized:
    key as boolean.public;
    value as boolean.public;

mapping admin_role:
    key as address.public;
    value as boolean.public;

mapping fee_bps:
    key as u64.public;
    value as u64.public;

mapping epoch_buy_volume:
    key as u128.public;
    value as u128.public;

mapping epoch_sell_volume:
    key as u128.public;
    value as u128.public;

mapping epoch_closed:
    key as u128.public;
    value as boolean.public;

mapping epoch_mid_price:
    key as u128.public;
    value as u128.public;

mapping epoch_fee_bps:
    key as u128.public;
    value as u64.public;

mapping epoch_matched_buy_volume:
    key as u128.public;
    value as u128.public;

mapping epoch_matched_sell_volume:
    key as u128.public;
    value as u128.public;

mapping intent_count:
    key as u128.public;
    value as u64.public;

mapping pool_open_interest_buy:
    key as u64.public;
    value as u128.public;

mapping pool_open_interest_sell:
    key as u64.public;
    value as u128.public;

mapping cumulative_submitted_buy:
    key as u64.public;
    value as u128.public;

mapping cumulative_submitted_sell:
    key as u64.public;
    value as u128.public;

mapping cumulative_settled_buy:
    key as u64.public;
    value as u128.public;

mapping cumulative_settled_sell:
    key as u64.public;
    value as u128.public;

mapping cumulative_fee_base:
    key as u64.public;
    value as u128.public;

mapping cumulative_fee_quote:
    key as u64.public;
    value as u128.public;

mapping last_settlement_block:
    key as u64.public;
    value as u32.public;

function initialize:
    input r0 as address.private;
    async initialize r0 self.caller into r1;
    output r1 as privadex_darkpool_v4.aleo/initialize.future;

finalize initialize:
    input r0 as address.public;
    input r1 as address.public;
    get.or_use initialized[true] false into r2;
    not r2 into r3;
    assert.eq r3 true;
    is.eq r1 r0 into r4;
    assert.eq r4 true;
    set true into initialized[true];
    set true into admin_role[r0];

function set_admin:
    input r0 as address.private;
    input r1 as boolean.private;
    async set_admin r0 r1 self.caller into r2;
    output r2 as privadex_darkpool_v4.aleo/set_admin.future;

finalize set_admin:
    input r0 as address.public;
    input r1 as boolean.public;
    input r2 as address.public;
    get.or_use admin_role[r2] false into r3;
    assert.eq r3 true;
    set r1 into admin_role[r0];

function set_fee_bps:
    input r0 as u64.private;
    input r1 as u64.private;
    async set_fee_bps r0 r1 self.caller into r2;
    output r2 as privadex_darkpool_v4.aleo/set_fee_bps.future;

finalize set_fee_bps:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as address.public;
    get.or_use admin_role[r2] false into r3;
    assert.eq r3 true;
    lte r1 1000u64 into r4;
    assert.eq r4 true;
    set r1 into fee_bps[r0];

function submit_sell_aleo:
    input r0 as credits.aleo/credits.record;
    input r1 as u64.private;
    input r2 as u128.private;
    input r3 as field.private;
    input r4 as u64.private;
    cast r0.microcredits into r5 as u128;
    gt r5 0u128 into r6;
    assert.eq r6 true;
    call credits.aleo/transfer_private_to_public r0 privadex_darkpool_v4.aleo r0.microcredits into r7 r8;
    cast self.signer r4 r1 false r5 r2 r3 into r9 as DarkIntent.record;
    async submit_sell_aleo r1 r4 false r5 r8 into r10;
    output r9 as DarkIntent.record;
    output r10 as privadex_darkpool_v4.aleo/submit_sell_aleo.future;

finalize submit_sell_aleo:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u128.public;
    input r4 as credits.aleo/transfer_private_to_public.future;
    await r4;
    get.or_use initialized[true] false into r5;
    div block.height 120u32 into r6;
    cast r6 into r7 as u64;
    cast r1 into r8 as u128;
    mul r8 18446744073709551616u128 into r9;
    cast r0 into r10 as u128;
    add r9 r10 into r11;
    get.or_use epoch_closed[r11] false into r12;
    assert.eq r5 true;
    is.eq r1 r7 into r13;
    assert.eq r13 true;
    not r12 into r14;
    assert.eq r14 true;
    branch.eq r2 false to end_then_0_0;
    get.or_use epoch_buy_volume[r11] 0u128 into r15;
    get.or_use pool_open_interest_buy[r0] 0u128 into r16;
    get.or_use cumulative_submitted_buy[r0] 0u128 into r17;
    add r15 r3 into r18;
    set r18 into epoch_buy_volume[r11];
    add r16 r3 into r19;
    set r19 into pool_open_interest_buy[r0];
    add r17 r3 into r20;
    set r20 into cumulative_submitted_buy[r0];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    get.or_use epoch_sell_volume[r11] 0u128 into r21;
    get.or_use pool_open_interest_sell[r0] 0u128 into r22;
    get.or_use cumulative_submitted_sell[r0] 0u128 into r23;
    add r21 r3 into r24;
    set r24 into epoch_sell_volume[r11];
    add r22 r3 into r25;
    set r25 into pool_open_interest_sell[r0];
    add r23 r3 into r26;
    set r26 into cumulative_submitted_sell[r0];
    position end_otherwise_0_1;
    get.or_use intent_count[r11] 0u64 into r27;
    add r27 1u64 into r28;
    set r28 into intent_count[r11];

function submit_buy_aleo:
    input r0 as test_usdcx_stablecoin.aleo/Token.record;
    input r1 as [test_usdcx_stablecoin.aleo/MerkleProof; 2u32].private;
    input r2 as u64.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as field.private;
    input r6 as u64.private;
    gt r3 0u128 into r7;
    assert.eq r7 true;
    call test_usdcx_stablecoin.aleo/transfer_private_to_public privadex_darkpool_v4.aleo r3 r0 r1 into r8 r9 r10;
    cast self.signer r6 r2 true r3 r4 r5 into r11 as DarkIntent.record;
    async submit_buy_aleo r2 r6 true r3 r10 into r12;
    output r11 as DarkIntent.record;
    output r8 as test_usdcx_stablecoin.aleo/ComplianceRecord.record;
    output r9 as test_usdcx_stablecoin.aleo/Token.record;
    output r12 as privadex_darkpool_v4.aleo/submit_buy_aleo.future;

finalize submit_buy_aleo:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u128.public;
    input r4 as test_usdcx_stablecoin.aleo/transfer_private_to_public.future;
    await r4;
    get.or_use initialized[true] false into r5;
    div block.height 120u32 into r6;
    cast r6 into r7 as u64;
    cast r1 into r8 as u128;
    mul r8 18446744073709551616u128 into r9;
    cast r0 into r10 as u128;
    add r9 r10 into r11;
    get.or_use epoch_closed[r11] false into r12;
    assert.eq r5 true;
    is.eq r1 r7 into r13;
    assert.eq r13 true;
    not r12 into r14;
    assert.eq r14 true;
    branch.eq r2 false to end_then_0_2;
    get.or_use epoch_buy_volume[r11] 0u128 into r15;
    get.or_use pool_open_interest_buy[r0] 0u128 into r16;
    get.or_use cumulative_submitted_buy[r0] 0u128 into r17;
    add r15 r3 into r18;
    set r18 into epoch_buy_volume[r11];
    add r16 r3 into r19;
    set r19 into pool_open_interest_buy[r0];
    add r17 r3 into r20;
    set r20 into cumulative_submitted_buy[r0];
    branch.eq true true to end_otherwise_0_3;
    position end_then_0_2;
    get.or_use epoch_sell_volume[r11] 0u128 into r21;
    get.or_use pool_open_interest_sell[r0] 0u128 into r22;
    get.or_use cumulative_submitted_sell[r0] 0u128 into r23;
    add r21 r3 into r24;
    set r24 into epoch_sell_volume[r11];
    add r22 r3 into r25;
    set r25 into pool_open_interest_sell[r0];
    add r23 r3 into r26;
    set r26 into cumulative_submitted_sell[r0];
    position end_otherwise_0_3;
    get.or_use intent_count[r11] 0u64 into r27;
    add r27 1u64 into r28;
    set r28 into intent_count[r11];

function settle_epoch:
    input r0 as u64.private;
    input r1 as u64.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u64.private;
    input r5 as u128.private;
    input r6 as u128.private;
    gt r5 0u128 into r7;
    assert.eq r7 true;
    gt r6 0u128 into r8;
    assert.eq r8 true;
    call privadex_amm_v8.aleo/assert_pool_snapshot r0 r5 r6 r4 into r9;
    mul r6 1000000000u128 into r10;
    div r10 r5 into r11;
    is.eq r2 0u128 into r12;
    mul r2 1000000000u128 into r13;
    div r13 r11 into r14;
    ternary r12 0u128 r14 into r15;
    gte r15 r3 into r16;
    ternary r16 r3 r15 into r17;
    mul r17 r11 into r18;
    div r18 1000000000u128 into r19;
    ternary r16 r19 r2 into r20;
    async settle_epoch r0 r1 r2 r3 r4 r11 r20 r17 r9 into r21;
    output r21 as privadex_darkpool_v4.aleo/settle_epoch.future;

finalize settle_epoch:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u64.public;
    input r5 as u128.public;
    input r6 as u128.public;
    input r7 as u128.public;
    input r8 as privadex_amm_v8.aleo/assert_pool_snapshot.future;
    await r8;
    get.or_use initialized[true] false into r9;
    cast r1 into r10 as u128;
    mul r10 18446744073709551616u128 into r11;
    cast r0 into r12 as u128;
    add r11 r12 into r13;
    get.or_use epoch_closed[r13] false into r14;
    get.or_use epoch_buy_volume[r13] 0u128 into r15;
    get.or_use epoch_sell_volume[r13] 0u128 into r16;
    cast r1 into r17 as u32;
    add r17 1u32 into r18;
    mul r18 120u32 into r19;
    assert.eq r9 true;
    not r14 into r20;
    assert.eq r20 true;
    gte block.height r19 into r21;
    assert.eq r21 true;
    is.eq r15 r2 into r22;
    assert.eq r22 true;
    is.eq r16 r3 into r23;
    assert.eq r23 true;
    lte r6 r15 into r24;
    assert.eq r24 true;
    lte r7 r16 into r25;
    assert.eq r25 true;
    set r5 into epoch_mid_price[r13];
    set r4 into epoch_fee_bps[r13];
    set r6 into epoch_matched_buy_volume[r13];
    set r7 into epoch_matched_sell_volume[r13];
    set true into epoch_closed[r13];
    get.or_use pool_open_interest_buy[r0] 0u128 into r26;
    get.or_use pool_open_interest_sell[r0] 0u128 into r27;
    get.or_use cumulative_settled_buy[r0] 0u128 into r28;
    get.or_use cumulative_settled_sell[r0] 0u128 into r29;
    sub r26 r15 into r30;
    set r30 into pool_open_interest_buy[r0];
    sub r27 r16 into r31;
    set r31 into pool_open_interest_sell[r0];
    add r28 r6 into r32;
    set r32 into cumulative_settled_buy[r0];
    add r29 r7 into r33;
    set r33 into cumulative_settled_sell[r0];
    set block.height into last_settlement_block[r0];

function claim_sell_fill:
    input r0 as DarkIntent.record;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u64.private;
    not r0.is_buy into r6;
    assert.eq r6 true;
    is.eq r0.owner self.signer into r7;
    assert.eq r7 true;
    is.eq r1 0u128 into r8;
    mul r0.amount r2 into r9;
    div r9 r1 into r10;
    ternary r8 0u128 r10 into r11;
    sub r0.amount r11 into r12;
    lte r12 18446744073709551615u128 into r13;
    assert.eq r13 true;
    mul r0.amount r3 into r14;
    div r14 r1 into r15;
    ternary r8 0u128 r15 into r16;
    cast r5 into r17 as u128;
    mul r16 r17 into r18;
    div r18 10000u128 into r19;
    sub r16 r19 into r20;
    cast r0.owner r0.epoch_id r0.pool_id false r11 r12 r20 r19 r4 into r21 as DarkReceipt.record;
    call test_usdcx_stablecoin.aleo/transfer_public_to_private r0.owner r20 into r22 r23 r24;
    cast r12 into r25 as u64;
    call credits.aleo/transfer_public_to_private r0.owner r25 into r26 r27;
    async claim_sell_fill r0.pool_id r0.epoch_id r1 r2 r3 r4 r5 r19 r24 r27 into r28;
    output r21 as DarkReceipt.record;
    output r22 as test_usdcx_stablecoin.aleo/ComplianceRecord.record;
    output r23 as test_usdcx_stablecoin.aleo/Token.record;
    output r26 as credits.aleo/credits.record;
    output r28 as privadex_darkpool_v4.aleo/claim_sell_fill.future;

finalize claim_sell_fill:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u64.public;
    input r7 as u128.public;
    input r8 as test_usdcx_stablecoin.aleo/transfer_public_to_private.future;
    input r9 as credits.aleo/transfer_public_to_private.future;
    await r8;
    await r9;
    cast r1 into r10 as u128;
    mul r10 18446744073709551616u128 into r11;
    cast r0 into r12 as u128;
    add r11 r12 into r13;
    get.or_use epoch_closed[r13] false into r14;
    get.or_use epoch_sell_volume[r13] 0u128 into r15;
    get.or_use epoch_matched_sell_volume[r13] 0u128 into r16;
    get.or_use epoch_matched_buy_volume[r13] 0u128 into r17;
    get.or_use epoch_mid_price[r13] 0u128 into r18;
    get.or_use epoch_fee_bps[r13] 0u64 into r19;
    assert.eq r14 true;
    is.eq r15 r2 into r20;
    assert.eq r20 true;
    is.eq r16 r3 into r21;
    assert.eq r21 true;
    is.eq r17 r4 into r22;
    assert.eq r22 true;
    is.eq r18 r5 into r23;
    assert.eq r23 true;
    is.eq r19 r6 into r24;
    assert.eq r24 true;
    get.or_use cumulative_fee_quote[r0] 0u128 into r25;
    add r25 r7 into r26;
    set r26 into cumulative_fee_quote[r0];

function claim_buy_fill:
    input r0 as DarkIntent.record;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u64.private;
    assert.eq r0.is_buy true;
    is.eq r0.owner self.signer into r6;
    assert.eq r6 true;
    is.eq r1 0u128 into r7;
    mul r0.amount r3 into r8;
    div r8 r1 into r9;
    ternary r7 0u128 r9 into r10;
    sub r0.amount r10 into r11;
    mul r0.amount r2 into r12;
    div r12 r1 into r13;
    ternary r7 0u128 r13 into r14;
    cast r5 into r15 as u128;
    mul r14 r15 into r16;
    div r16 10000u128 into r17;
    sub r14 r17 into r18;
    lte r18 18446744073709551615u128 into r19;
    assert.eq r19 true;
    cast r0.owner r0.epoch_id r0.pool_id true r10 r11 r18 r17 r4 into r20 as DarkReceipt.record;
    cast r18 into r21 as u64;
    call credits.aleo/transfer_public_to_private r0.owner r21 into r22 r23;
    call test_usdcx_stablecoin.aleo/transfer_public_to_private r0.owner r11 into r24 r25 r26;
    async claim_buy_fill r0.pool_id r0.epoch_id r1 r2 r3 r4 r5 r17 r23 r26 into r27;
    output r20 as DarkReceipt.record;
    output r22 as credits.aleo/credits.record;
    output r24 as test_usdcx_stablecoin.aleo/ComplianceRecord.record;
    output r25 as test_usdcx_stablecoin.aleo/Token.record;
    output r27 as privadex_darkpool_v4.aleo/claim_buy_fill.future;

finalize claim_buy_fill:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u128.public;
    input r6 as u64.public;
    input r7 as u128.public;
    input r8 as credits.aleo/transfer_public_to_private.future;
    input r9 as test_usdcx_stablecoin.aleo/transfer_public_to_private.future;
    await r8;
    await r9;
    cast r1 into r10 as u128;
    mul r10 18446744073709551616u128 into r11;
    cast r0 into r12 as u128;
    add r11 r12 into r13;
    get.or_use epoch_closed[r13] false into r14;
    get.or_use epoch_buy_volume[r13] 0u128 into r15;
    get.or_use epoch_matched_sell_volume[r13] 0u128 into r16;
    get.or_use epoch_matched_buy_volume[r13] 0u128 into r17;
    get.or_use epoch_mid_price[r13] 0u128 into r18;
    get.or_use epoch_fee_bps[r13] 0u64 into r19;
    assert.eq r14 true;
    is.eq r15 r2 into r20;
    assert.eq r20 true;
    is.eq r16 r3 into r21;
    assert.eq r21 true;
    is.eq r17 r4 into r22;
    assert.eq r22 true;
    is.eq r18 r5 into r23;
    assert.eq r23 true;
    is.eq r19 r6 into r24;
    assert.eq r24 true;
    get.or_use cumulative_fee_base[r0] 0u128 into r25;
    add r25 r7 into r26;
    set r26 into cumulative_fee_base[r0];

function cancel_sell_intent:
    input r0 as DarkIntent.record;
    not r0.is_buy into r1;
    assert.eq r1 true;
    is.eq r0.owner self.signer into r2;
    assert.eq r2 true;
    lte r0.amount 18446744073709551615u128 into r3;
    assert.eq r3 true;
    cast r0.owner r0.epoch_id r0.pool_id false 0u128 r0.amount 0u128 0u128 0u128 into r4 as DarkReceipt.record;
    cast r0.amount into r5 as u64;
    call credits.aleo/transfer_public_to_private r0.owner r5 into r6 r7;
    async cancel_sell_intent r0.pool_id r0.epoch_id false r0.amount r7 into r8;
    output r4 as DarkReceipt.record;
    output r6 as credits.aleo/credits.record;
    output r8 as privadex_darkpool_v4.aleo/cancel_sell_intent.future;

finalize cancel_sell_intent:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u128.public;
    input r4 as credits.aleo/transfer_public_to_private.future;
    await r4;
    cast r1 into r5 as u128;
    mul r5 18446744073709551616u128 into r6;
    cast r0 into r7 as u128;
    add r6 r7 into r8;
    get.or_use epoch_closed[r8] false into r9;
    get.or_use intent_count[r8] 0u64 into r10;
    not r9 into r11;
    assert.eq r11 true;
    gt r10 0u64 into r12;
    assert.eq r12 true;
    branch.eq r2 false to end_then_0_4;
    get.or_use epoch_buy_volume[r8] 0u128 into r13;
    get.or_use pool_open_interest_buy[r0] 0u128 into r14;
    sub r13 r3 into r15;
    set r15 into epoch_buy_volume[r8];
    sub r14 r3 into r16;
    set r16 into pool_open_interest_buy[r0];
    branch.eq true true to end_otherwise_0_5;
    position end_then_0_4;
    get.or_use epoch_sell_volume[r8] 0u128 into r17;
    get.or_use pool_open_interest_sell[r0] 0u128 into r18;
    sub r17 r3 into r19;
    set r19 into epoch_sell_volume[r8];
    sub r18 r3 into r20;
    set r20 into pool_open_interest_sell[r0];
    position end_otherwise_0_5;
    sub r10 1u64 into r21;
    set r21 into intent_count[r8];

function cancel_buy_intent:
    input r0 as DarkIntent.record;
    assert.eq r0.is_buy true;
    is.eq r0.owner self.signer into r1;
    assert.eq r1 true;
    cast r0.owner r0.epoch_id r0.pool_id true 0u128 r0.amount 0u128 0u128 0u128 into r2 as DarkReceipt.record;
    call test_usdcx_stablecoin.aleo/transfer_public_to_private r0.owner r0.amount into r3 r4 r5;
    async cancel_buy_intent r0.pool_id r0.epoch_id true r0.amount r5 into r6;
    output r2 as DarkReceipt.record;
    output r3 as test_usdcx_stablecoin.aleo/ComplianceRecord.record;
    output r4 as test_usdcx_stablecoin.aleo/Token.record;
    output r6 as privadex_darkpool_v4.aleo/cancel_buy_intent.future;

finalize cancel_buy_intent:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u128.public;
    input r4 as test_usdcx_stablecoin.aleo/transfer_public_to_private.future;
    await r4;
    cast r1 into r5 as u128;
    mul r5 18446744073709551616u128 into r6;
    cast r0 into r7 as u128;
    add r6 r7 into r8;
    get.or_use epoch_closed[r8] false into r9;
    get.or_use intent_count[r8] 0u64 into r10;
    not r9 into r11;
    assert.eq r11 true;
    gt r10 0u64 into r12;
    assert.eq r12 true;
    branch.eq r2 false to end_then_0_6;
    get.or_use epoch_buy_volume[r8] 0u128 into r13;
    get.or_use pool_open_interest_buy[r0] 0u128 into r14;
    sub r13 r3 into r15;
    set r15 into epoch_buy_volume[r8];
    sub r14 r3 into r16;
    set r16 into pool_open_interest_buy[r0];
    branch.eq true true to end_otherwise_0_7;
    position end_then_0_6;
    get.or_use epoch_sell_volume[r8] 0u128 into r17;
    get.or_use pool_open_interest_sell[r0] 0u128 into r18;
    sub r17 r3 into r19;
    set r19 into epoch_sell_volume[r8];
    sub r18 r3 into r20;
    set r20 into pool_open_interest_sell[r0];
    position end_otherwise_0_7;
    sub r10 1u64 into r21;
    set r21 into intent_count[r8];

constructor:
    assert.eq edition 0u16;
