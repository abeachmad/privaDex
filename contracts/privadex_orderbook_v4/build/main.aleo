import credits.aleo;
import merkle_tree.aleo;
import test_usdcx_multisig_core.aleo;
import test_usdcx_freezelist.aleo;
import test_usdcx_stablecoin.aleo;
program privadex_orderbook_v4.aleo;

record LimitOrder:
    owner as address.private;
    order_id as field.private;
    pool_id as u64.private;
    is_buy as boolean.private;
    amount_in as u128.private;
    amount_filled as u128.private;
    limit_price as u128.private;
    expiry as u32.private;
    nonce as field.private;

record OrderReceipt:
    owner as address.private;
    order_id as field.private;
    pool_id as u64.private;
    filled_input as u128.private;
    amount_out as u128.private;
    fee_paid as u128.private;
    fully_filled as boolean.private;

mapping initialized:
    key as boolean.public;
    value as boolean.public;

mapping admin_role:
    key as address.public;
    value as boolean.public;

mapping matcher_role:
    key as address.public;
    value as boolean.public;

mapping fee_bps:
    key as u64.public;
    value as u64.public;

mapping order_seen:
    key as field.public;
    value as boolean.public;

mapping order_commitment:
    key as field.public;
    value as boolean.public;

mapping order_cancelled:
    key as field.public;
    value as boolean.public;

mapping order_filled_input:
    key as field.public;
    value as u128.public;

mapping pool_open_interest_buy:
    key as u64.public;
    value as u128.public;

mapping pool_open_interest_sell:
    key as u64.public;
    value as u128.public;

mapping cumulative_base_volume:
    key as u64.public;
    value as u128.public;

mapping cumulative_quote_volume:
    key as u64.public;
    value as u128.public;

mapping cumulative_base_fees:
    key as u64.public;
    value as u128.public;

mapping cumulative_quote_fees:
    key as u64.public;
    value as u128.public;

mapping total_orders:
    key as u64.public;
    value as u64.public;

mapping last_fill_block:
    key as u64.public;
    value as u32.public;

function initialize:
    input r0 as address.private;
    input r1 as address.private;
    async initialize r0 r1 self.caller into r2;
    output r2 as privadex_orderbook_v4.aleo/initialize.future;

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
    set true into matcher_role[r1];

function set_admin:
    input r0 as address.private;
    input r1 as boolean.private;
    async set_admin r0 r1 self.caller into r2;
    output r2 as privadex_orderbook_v4.aleo/set_admin.future;

finalize set_admin:
    input r0 as address.public;
    input r1 as boolean.public;
    input r2 as address.public;
    get.or_use admin_role[r2] false into r3;
    assert.eq r3 true;
    set r1 into admin_role[r0];

function set_matcher:
    input r0 as address.private;
    input r1 as boolean.private;
    async set_matcher r0 r1 self.caller into r2;
    output r2 as privadex_orderbook_v4.aleo/set_matcher.future;

finalize set_matcher:
    input r0 as address.public;
    input r1 as boolean.public;
    input r2 as address.public;
    get.or_use admin_role[r2] false into r3;
    assert.eq r3 true;
    set r1 into matcher_role[r0];

function set_fee_bps:
    input r0 as u64.private;
    input r1 as u64.private;
    async set_fee_bps r0 r1 self.caller into r2;
    output r2 as privadex_orderbook_v4.aleo/set_fee_bps.future;

finalize set_fee_bps:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as address.public;
    get.or_use admin_role[r2] false into r3;
    assert.eq r3 true;
    lte r1 1000u64 into r4;
    assert.eq r4 true;
    set r1 into fee_bps[r0];

function place_sell_limit:
    input r0 as credits.aleo/credits.record;
    input r1 as u64.private;
    input r2 as u128.private;
    input r3 as u32.private;
    input r4 as field.private;
    gt r0.microcredits 0u64 into r5;
    assert.eq r5 true;
    gt r2 0u128 into r6;
    assert.eq r6 true;
    cast r0.microcredits into r7 as u128;
    hash.bhp256 r4 into r8 as field;
    call credits.aleo/transfer_private_to_public r0 privadex_orderbook_v4.aleo r0.microcredits into r9 r10;
    cast self.signer r8 r1 false r7 0u128 r2 r3 r4 into r11 as LimitOrder.record;
    async place_sell_limit r8 r1 false r7 r3 r10 into r12;
    output r11 as LimitOrder.record;
    output r12 as privadex_orderbook_v4.aleo/place_sell_limit.future;

finalize place_sell_limit:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u128.public;
    input r4 as u32.public;
    input r5 as credits.aleo/transfer_private_to_public.future;
    await r5;
    get.or_use initialized[true] false into r6;
    get.or_use order_seen[r0] false into r7;
    assert.eq r6 true;
    not r7 into r8;
    assert.eq r8 true;
    lte block.height r4 into r9;
    assert.eq r9 true;
    set true into order_seen[r0];
    set true into order_commitment[r0];
    set false into order_cancelled[r0];
    set 0u128 into order_filled_input[r0];
    branch.eq r2 false to end_then_0_0;
    get.or_use pool_open_interest_buy[r1] 0u128 into r10;
    add r10 r3 into r11;
    set r11 into pool_open_interest_buy[r1];
    branch.eq true true to end_otherwise_0_1;
    position end_then_0_0;
    get.or_use pool_open_interest_sell[r1] 0u128 into r12;
    add r12 r3 into r13;
    set r13 into pool_open_interest_sell[r1];
    position end_otherwise_0_1;
    get.or_use total_orders[r1] 0u64 into r14;
    add r14 1u64 into r15;
    set r15 into total_orders[r1];

function place_buy_limit:
    input r0 as test_usdcx_stablecoin.aleo/Token.record;
    input r1 as [test_usdcx_stablecoin.aleo/MerkleProof; 2u32].private;
    input r2 as u64.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u32.private;
    input r6 as field.private;
    gt r3 0u128 into r7;
    assert.eq r7 true;
    gt r4 0u128 into r8;
    assert.eq r8 true;
    hash.bhp256 r6 into r9 as field;
    call test_usdcx_stablecoin.aleo/transfer_private_to_public privadex_orderbook_v4.aleo r3 r0 r1 into r10 r11 r12;
    cast self.signer r9 r2 true r3 0u128 r4 r5 r6 into r13 as LimitOrder.record;
    async place_buy_limit r9 r2 true r3 r5 r12 into r14;
    output r13 as LimitOrder.record;
    output r10 as test_usdcx_stablecoin.aleo/ComplianceRecord.record;
    output r11 as test_usdcx_stablecoin.aleo/Token.record;
    output r14 as privadex_orderbook_v4.aleo/place_buy_limit.future;

finalize place_buy_limit:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u128.public;
    input r4 as u32.public;
    input r5 as test_usdcx_stablecoin.aleo/transfer_private_to_public.future;
    await r5;
    get.or_use initialized[true] false into r6;
    get.or_use order_seen[r0] false into r7;
    assert.eq r6 true;
    not r7 into r8;
    assert.eq r8 true;
    lte block.height r4 into r9;
    assert.eq r9 true;
    set true into order_seen[r0];
    set true into order_commitment[r0];
    set false into order_cancelled[r0];
    set 0u128 into order_filled_input[r0];
    branch.eq r2 false to end_then_0_2;
    get.or_use pool_open_interest_buy[r1] 0u128 into r10;
    add r10 r3 into r11;
    set r11 into pool_open_interest_buy[r1];
    branch.eq true true to end_otherwise_0_3;
    position end_then_0_2;
    get.or_use pool_open_interest_sell[r1] 0u128 into r12;
    add r12 r3 into r13;
    set r13 into pool_open_interest_sell[r1];
    position end_otherwise_0_3;
    get.or_use total_orders[r1] 0u64 into r14;
    add r14 1u64 into r15;
    set r15 into total_orders[r1];

function fill_sell_order:
    input r0 as LimitOrder.record;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as u64.private;
    not r0.is_buy into r4;
    assert.eq r4 true;
    gt r1 0u128 into r5;
    assert.eq r5 true;
    gte r2 r0.limit_price into r6;
    assert.eq r6 true;
    sub r0.amount_in r0.amount_filled into r7;
    lte r1 r7 into r8;
    assert.eq r8 true;
    mul r1 r2 into r9;
    div r9 1000000000u128 into r10;
    cast r3 into r11 as u128;
    mul r10 r11 into r12;
    div r12 10000u128 into r13;
    sub r10 r13 into r14;
    add r0.amount_filled r1 into r15;
    cast r0.owner r0.order_id r0.pool_id false r0.amount_in r15 r0.limit_price r0.expiry r0.nonce into r16 as LimitOrder.record;
    is.eq r15 r0.amount_in into r17;
    cast r0.owner r0.order_id r0.pool_id r1 r14 r13 r17 into r18 as OrderReceipt.record;
    call test_usdcx_stablecoin.aleo/transfer_public_to_private r0.owner r14 into r19 r20 r21;
    async fill_sell_order r0.order_id r0.pool_id r0.amount_in r0.amount_filled r1 r0.expiry r3 r10 r13 r21 self.caller into r22;
    output r16 as LimitOrder.record;
    output r18 as OrderReceipt.record;
    output r19 as test_usdcx_stablecoin.aleo/ComplianceRecord.record;
    output r20 as test_usdcx_stablecoin.aleo/Token.record;
    output r22 as privadex_orderbook_v4.aleo/fill_sell_order.future;

finalize fill_sell_order:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u32.public;
    input r6 as u64.public;
    input r7 as u128.public;
    input r8 as u128.public;
    input r9 as test_usdcx_stablecoin.aleo/transfer_public_to_private.future;
    input r10 as address.public;
    await r9;
    get.or_use initialized[true] false into r11;
    get.or_use matcher_role[r10] false into r12;
    get.or_use order_commitment[r0] false into r13;
    get.or_use order_cancelled[r0] false into r14;
    get.or_use order_filled_input[r0] 0u128 into r15;
    get.or_use fee_bps[r1] 0u64 into r16;
    assert.eq r11 true;
    assert.eq r12 true;
    assert.eq r13 true;
    not r14 into r17;
    assert.eq r17 true;
    lte block.height r5 into r18;
    assert.eq r18 true;
    is.eq r15 r3 into r19;
    assert.eq r19 true;
    is.eq r16 r6 into r20;
    assert.eq r20 true;
    add r3 r4 into r21;
    lte r21 r2 into r22;
    assert.eq r22 true;
    set r21 into order_filled_input[r0];
    is.eq r21 r2 into r23;
    branch.eq r23 false to end_then_0_4;
    set false into order_commitment[r0];
    branch.eq true true to end_otherwise_0_5;
    position end_then_0_4;
    position end_otherwise_0_5;
    get.or_use pool_open_interest_sell[r1] 0u128 into r24;
    get.or_use cumulative_base_volume[r1] 0u128 into r25;
    get.or_use cumulative_quote_volume[r1] 0u128 into r26;
    get.or_use cumulative_quote_fees[r1] 0u128 into r27;
    sub r24 r4 into r28;
    set r28 into pool_open_interest_sell[r1];
    add r25 r4 into r29;
    set r29 into cumulative_base_volume[r1];
    add r26 r7 into r30;
    set r30 into cumulative_quote_volume[r1];
    add r27 r8 into r31;
    set r31 into cumulative_quote_fees[r1];
    set block.height into last_fill_block[r1];

function fill_buy_order:
    input r0 as LimitOrder.record;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as u64.private;
    assert.eq r0.is_buy true;
    gt r1 0u128 into r4;
    assert.eq r4 true;
    gt r2 0u128 into r5;
    assert.eq r5 true;
    lte r2 r0.limit_price into r6;
    assert.eq r6 true;
    sub r0.amount_in r0.amount_filled into r7;
    lte r1 r7 into r8;
    assert.eq r8 true;
    mul r1 1000000000u128 into r9;
    div r9 r2 into r10;
    cast r3 into r11 as u128;
    mul r10 r11 into r12;
    div r12 10000u128 into r13;
    sub r10 r13 into r14;
    lte r14 18446744073709551615u128 into r15;
    assert.eq r15 true;
    add r0.amount_filled r1 into r16;
    cast r0.owner r0.order_id r0.pool_id true r0.amount_in r16 r0.limit_price r0.expiry r0.nonce into r17 as LimitOrder.record;
    is.eq r16 r0.amount_in into r18;
    cast r0.owner r0.order_id r0.pool_id r1 r14 r13 r18 into r19 as OrderReceipt.record;
    cast r14 into r20 as u64;
    call credits.aleo/transfer_public_to_private r0.owner r20 into r21 r22;
    async fill_buy_order r0.order_id r0.pool_id r0.amount_in r0.amount_filled r1 r0.expiry r3 r10 r13 r22 self.caller into r23;
    output r17 as LimitOrder.record;
    output r19 as OrderReceipt.record;
    output r21 as credits.aleo/credits.record;
    output r23 as privadex_orderbook_v4.aleo/fill_buy_order.future;

finalize fill_buy_order:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u32.public;
    input r6 as u64.public;
    input r7 as u128.public;
    input r8 as u128.public;
    input r9 as credits.aleo/transfer_public_to_private.future;
    input r10 as address.public;
    await r9;
    get.or_use initialized[true] false into r11;
    get.or_use matcher_role[r10] false into r12;
    get.or_use order_commitment[r0] false into r13;
    get.or_use order_cancelled[r0] false into r14;
    get.or_use order_filled_input[r0] 0u128 into r15;
    get.or_use fee_bps[r1] 0u64 into r16;
    assert.eq r11 true;
    assert.eq r12 true;
    assert.eq r13 true;
    not r14 into r17;
    assert.eq r17 true;
    lte block.height r5 into r18;
    assert.eq r18 true;
    is.eq r15 r3 into r19;
    assert.eq r19 true;
    is.eq r16 r6 into r20;
    assert.eq r20 true;
    add r3 r4 into r21;
    lte r21 r2 into r22;
    assert.eq r22 true;
    set r21 into order_filled_input[r0];
    is.eq r21 r2 into r23;
    branch.eq r23 false to end_then_0_6;
    set false into order_commitment[r0];
    branch.eq true true to end_otherwise_0_7;
    position end_then_0_6;
    position end_otherwise_0_7;
    get.or_use pool_open_interest_buy[r1] 0u128 into r24;
    get.or_use cumulative_base_volume[r1] 0u128 into r25;
    get.or_use cumulative_quote_volume[r1] 0u128 into r26;
    get.or_use cumulative_base_fees[r1] 0u128 into r27;
    sub r24 r4 into r28;
    set r28 into pool_open_interest_buy[r1];
    add r26 r4 into r29;
    set r29 into cumulative_quote_volume[r1];
    add r25 r7 into r30;
    set r30 into cumulative_base_volume[r1];
    add r27 r8 into r31;
    set r31 into cumulative_base_fees[r1];
    set block.height into last_fill_block[r1];

function cancel_sell_order:
    input r0 as LimitOrder.record;
    not r0.is_buy into r1;
    assert.eq r1 true;
    is.eq r0.owner self.signer into r2;
    assert.eq r2 true;
    sub r0.amount_in r0.amount_filled into r3;
    gt r3 0u128 into r4;
    assert.eq r4 true;
    lte r3 18446744073709551615u128 into r5;
    assert.eq r5 true;
    cast r0.owner r0.order_id r0.pool_id 0u128 r3 0u128 false into r6 as OrderReceipt.record;
    cast r3 into r7 as u64;
    call credits.aleo/transfer_public_to_private r0.owner r7 into r8 r9;
    async cancel_sell_order r0.order_id r0.pool_id false r0.amount_filled r3 r9 into r10;
    output r6 as OrderReceipt.record;
    output r8 as credits.aleo/credits.record;
    output r10 as privadex_orderbook_v4.aleo/cancel_sell_order.future;

finalize cancel_sell_order:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as credits.aleo/transfer_public_to_private.future;
    await r5;
    get.or_use order_commitment[r0] false into r6;
    get.or_use order_cancelled[r0] false into r7;
    get.or_use order_filled_input[r0] 0u128 into r8;
    assert.eq r6 true;
    not r7 into r9;
    assert.eq r9 true;
    is.eq r8 r3 into r10;
    assert.eq r10 true;
    set true into order_cancelled[r0];
    set false into order_commitment[r0];
    branch.eq r2 false to end_then_0_8;
    get.or_use pool_open_interest_buy[r1] 0u128 into r11;
    sub r11 r4 into r12;
    set r12 into pool_open_interest_buy[r1];
    branch.eq true true to end_otherwise_0_9;
    position end_then_0_8;
    get.or_use pool_open_interest_sell[r1] 0u128 into r13;
    sub r13 r4 into r14;
    set r14 into pool_open_interest_sell[r1];
    position end_otherwise_0_9;

function cancel_buy_order:
    input r0 as LimitOrder.record;
    assert.eq r0.is_buy true;
    is.eq r0.owner self.signer into r1;
    assert.eq r1 true;
    sub r0.amount_in r0.amount_filled into r2;
    gt r2 0u128 into r3;
    assert.eq r3 true;
    cast r0.owner r0.order_id r0.pool_id 0u128 r2 0u128 false into r4 as OrderReceipt.record;
    call test_usdcx_stablecoin.aleo/transfer_public_to_private r0.owner r2 into r5 r6 r7;
    async cancel_buy_order r0.order_id r0.pool_id true r0.amount_filled r2 r7 into r8;
    output r4 as OrderReceipt.record;
    output r5 as test_usdcx_stablecoin.aleo/ComplianceRecord.record;
    output r6 as test_usdcx_stablecoin.aleo/Token.record;
    output r8 as privadex_orderbook_v4.aleo/cancel_buy_order.future;

finalize cancel_buy_order:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as boolean.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as test_usdcx_stablecoin.aleo/transfer_public_to_private.future;
    await r5;
    get.or_use order_commitment[r0] false into r6;
    get.or_use order_cancelled[r0] false into r7;
    get.or_use order_filled_input[r0] 0u128 into r8;
    assert.eq r6 true;
    not r7 into r9;
    assert.eq r9 true;
    is.eq r8 r3 into r10;
    assert.eq r10 true;
    set true into order_cancelled[r0];
    set false into order_commitment[r0];
    branch.eq r2 false to end_then_0_10;
    get.or_use pool_open_interest_buy[r1] 0u128 into r11;
    sub r11 r4 into r12;
    set r12 into pool_open_interest_buy[r1];
    branch.eq true true to end_otherwise_0_11;
    position end_then_0_10;
    get.or_use pool_open_interest_sell[r1] 0u128 into r13;
    sub r13 r4 into r14;
    set r14 into pool_open_interest_sell[r1];
    position end_otherwise_0_11;

constructor:
    assert.eq edition 0u16;
