import credits.aleo;
import token_registry.aleo;
import privadex_amm_native_btcx_v7.aleo;
import privadex_amm_native_ethx_v7.aleo;
import privadex_amm_btcx_ethx_v6.aleo;
program privadex_router_v2.aleo;

record RouteIntent:
    owner as address.private;
    route_id as field.private;
    token_in as u64.private;
    token_out as u64.private;
    amount_in as u128.private;
    min_out as u128.private;
    max_hops as u8.private;
    expiry as u32.private;
    nonce as field.private;

record RouteReceipt:
    owner as address.private;
    route_id as field.private;
    token_in as u64.private;
    token_out as u64.private;
    amount_in as u128.private;
    amount_out as u128.private;
    hops as u8.private;
    venue_mask as u8.private;
    execution_tx as field.private;
    success as boolean.private;

mapping initialized:
    key as boolean.public;
    value as boolean.public;

mapping admin_role:
    key as address.public;
    value as boolean.public;

mapping executor_role:
    key as address.public;
    value as boolean.public;

mapping route_seen:
    key as field.public;
    value as boolean.public;

mapping route_open:
    key as field.public;
    value as boolean.public;

mapping route_cancelled:
    key as field.public;
    value as boolean.public;

mapping total_routed_volume:
    key as u64.public;
    value as u128.public;

mapping total_output_volume:
    key as u64.public;
    value as u128.public;

mapping total_routes:
    key as u64.public;
    value as u64.public;

mapping last_route_block:
    key as u64.public;
    value as u32.public;

function initialize:
    input r0 as address.private;
    input r1 as address.private;
    async initialize r0 r1 self.caller into r2;
    output r2 as privadex_router_v2.aleo/initialize.future;

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
    set true into executor_role[r1];

function set_admin:
    input r0 as address.private;
    input r1 as boolean.private;
    async set_admin r0 r1 self.caller into r2;
    output r2 as privadex_router_v2.aleo/set_admin.future;

finalize set_admin:
    input r0 as address.public;
    input r1 as boolean.public;
    input r2 as address.public;
    get.or_use admin_role[r2] false into r3;
    assert.eq r3 true;
    set r1 into admin_role[r0];

function set_executor:
    input r0 as address.private;
    input r1 as boolean.private;
    async set_executor r0 r1 self.caller into r2;
    output r2 as privadex_router_v2.aleo/set_executor.future;

finalize set_executor:
    input r0 as address.public;
    input r1 as boolean.public;
    input r2 as address.public;
    get.or_use admin_role[r2] false into r3;
    assert.eq r3 true;
    set r1 into executor_role[r0];

function swap_btcx_for_ethx_via_aleo:
    input r0 as token_registry.aleo/Token.record;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u64.private;
    input r5 as u128.private;
    input r6 as u128.private;
    input r7 as u64.private;
    input r8 as u128.private;
    gt r1 0u128 into r9;
    assert.eq r9 true;
    is.eq r0.token_id 201field into r10;
    assert.eq r10 true;
    is.eq r4 0u64 into r11;
    ternary r11 30u64 r4 into r12;
    sub 10000u64 r12 into r13;
    cast r13 into r14 as u128;
    mul r1 r14 into r15;
    mul r2 r15 into r16;
    mul r3 10000u128 into r17;
    add r17 r15 into r18;
    div r16 r18 into r19;
    gt r19 0u128 into r20;
    assert.eq r20 true;
    lte r19 18446744073709551615u128 into r21;
    assert.eq r21 true;
    cast r19 into r22 as u64;
    call privadex_amm_native_btcx_v7.aleo/swap_btcx_for_native r0 8u64 r1 r2 r3 r4 r22 into r23 r24 r25;
    call privadex_amm_native_ethx_v7.aleo/swap_native_for_ethx r24 9u64 r24.microcredits r5 r6 r7 r8 into r26 r27 r28;
    call token_registry.aleo/transfer_private self.signer r27.amount r27 into r29 r30 r31;
    async swap_btcx_for_ethx_via_aleo 5u64 6u64 r1 r30.amount r25 r28 r31 into r32;
    output r23 as token_registry.aleo/Token.record;
    output r30 as token_registry.aleo/Token.record;
    output r32 as privadex_router_v2.aleo/swap_btcx_for_ethx_via_aleo.future;

finalize swap_btcx_for_ethx_via_aleo:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as privadex_amm_native_btcx_v7.aleo/swap_btcx_for_native.future;
    input r5 as privadex_amm_native_ethx_v7.aleo/swap_native_for_ethx.future;
    input r6 as token_registry.aleo/transfer_private.future;
    await r4;
    await r5;
    await r6;
    get.or_use initialized[true] false into r7;
    assert.eq r7 true;
    get.or_use total_routed_volume[r0] 0u128 into r8;
    get.or_use total_output_volume[r1] 0u128 into r9;
    get.or_use total_routes[r0] 0u64 into r10;
    add r8 r2 into r11;
    set r11 into total_routed_volume[r0];
    add r9 r3 into r12;
    set r12 into total_output_volume[r1];
    add r10 1u64 into r13;
    set r13 into total_routes[r0];
    set block.height into last_route_block[r0];

function swap_ethx_for_btcx_via_aleo:
    input r0 as token_registry.aleo/Token.record;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u64.private;
    input r5 as u128.private;
    input r6 as u128.private;
    input r7 as u64.private;
    input r8 as u128.private;
    gt r1 0u128 into r9;
    assert.eq r9 true;
    is.eq r0.token_id 202field into r10;
    assert.eq r10 true;
    is.eq r4 0u64 into r11;
    ternary r11 30u64 r4 into r12;
    sub 10000u64 r12 into r13;
    cast r13 into r14 as u128;
    mul r1 r14 into r15;
    mul r2 r15 into r16;
    mul r3 10000u128 into r17;
    add r17 r15 into r18;
    div r16 r18 into r19;
    gt r19 0u128 into r20;
    assert.eq r20 true;
    lte r19 18446744073709551615u128 into r21;
    assert.eq r21 true;
    cast r19 into r22 as u64;
    call privadex_amm_native_ethx_v7.aleo/swap_ethx_for_native r0 9u64 r1 r2 r3 r4 r22 into r23 r24 r25;
    call privadex_amm_native_btcx_v7.aleo/swap_native_for_btcx r24 8u64 r24.microcredits r5 r6 r7 r8 into r26 r27 r28;
    call token_registry.aleo/transfer_private self.signer r27.amount r27 into r29 r30 r31;
    async swap_ethx_for_btcx_via_aleo 6u64 5u64 r1 r30.amount r25 r28 r31 into r32;
    output r23 as token_registry.aleo/Token.record;
    output r30 as token_registry.aleo/Token.record;
    output r32 as privadex_router_v2.aleo/swap_ethx_for_btcx_via_aleo.future;

finalize swap_ethx_for_btcx_via_aleo:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as privadex_amm_native_ethx_v7.aleo/swap_ethx_for_native.future;
    input r5 as privadex_amm_native_btcx_v7.aleo/swap_native_for_btcx.future;
    input r6 as token_registry.aleo/transfer_private.future;
    await r4;
    await r5;
    await r6;
    get.or_use initialized[true] false into r7;
    assert.eq r7 true;
    get.or_use total_routed_volume[r0] 0u128 into r8;
    get.or_use total_output_volume[r1] 0u128 into r9;
    get.or_use total_routes[r0] 0u64 into r10;
    add r8 r2 into r11;
    set r11 into total_routed_volume[r0];
    add r9 r3 into r12;
    set r12 into total_output_volume[r1];
    add r10 1u64 into r13;
    set r13 into total_routes[r0];
    set block.height into last_route_block[r0];

function swap_aleo_for_btcx_via_ethx:
    input r0 as credits.aleo/credits.record;
    input r1 as u64.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u64.private;
    input r5 as u128.private;
    input r6 as u128.private;
    input r7 as u64.private;
    input r8 as u128.private;
    gt r1 0u64 into r9;
    assert.eq r9 true;
    gte r0.microcredits r1 into r10;
    assert.eq r10 true;
    cast r1 into r11 as u128;
    is.eq r4 0u64 into r12;
    ternary r12 30u64 r4 into r13;
    sub 10000u64 r13 into r14;
    cast r14 into r15 as u128;
    mul r11 r15 into r16;
    mul r3 r16 into r17;
    mul r2 10000u128 into r18;
    add r18 r16 into r19;
    div r17 r19 into r20;
    gt r20 0u128 into r21;
    assert.eq r21 true;
    call privadex_amm_native_ethx_v7.aleo/swap_native_for_ethx r0 9u64 r1 r2 r3 r4 r20 into r22 r23 r24;
    call privadex_amm_btcx_ethx_v6.aleo/swap_ethx_for_btcx r23 10u64 r20 r5 r6 r7 r8 into r25 r26 r27;
    call token_registry.aleo/transfer_private self.signer r26.amount r26 into r28 r29 r30;
    async swap_aleo_for_btcx_via_ethx 0u64 5u64 r11 r29.amount r24 r27 r30 into r31;
    output r22 as credits.aleo/credits.record;
    output r29 as token_registry.aleo/Token.record;
    output r31 as privadex_router_v2.aleo/swap_aleo_for_btcx_via_ethx.future;

finalize swap_aleo_for_btcx_via_ethx:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as privadex_amm_native_ethx_v7.aleo/swap_native_for_ethx.future;
    input r5 as privadex_amm_btcx_ethx_v6.aleo/swap_ethx_for_btcx.future;
    input r6 as token_registry.aleo/transfer_private.future;
    await r4;
    await r5;
    await r6;
    get.or_use initialized[true] false into r7;
    assert.eq r7 true;
    get.or_use total_routed_volume[r0] 0u128 into r8;
    get.or_use total_output_volume[r1] 0u128 into r9;
    get.or_use total_routes[r0] 0u64 into r10;
    add r8 r2 into r11;
    set r11 into total_routed_volume[r0];
    add r9 r3 into r12;
    set r12 into total_output_volume[r1];
    add r10 1u64 into r13;
    set r13 into total_routes[r0];
    set block.height into last_route_block[r0];

function swap_btcx_for_aleo_via_ethx:
    input r0 as token_registry.aleo/Token.record;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u64.private;
    input r5 as u128.private;
    input r6 as u128.private;
    input r7 as u64.private;
    input r8 as u64.private;
    gt r1 0u128 into r9;
    assert.eq r9 true;
    is.eq r0.token_id 201field into r10;
    assert.eq r10 true;
    is.eq r4 0u64 into r11;
    ternary r11 30u64 r4 into r12;
    sub 10000u64 r12 into r13;
    cast r13 into r14 as u128;
    mul r1 r14 into r15;
    mul r3 r15 into r16;
    mul r2 10000u128 into r17;
    add r17 r15 into r18;
    div r16 r18 into r19;
    gt r19 0u128 into r20;
    assert.eq r20 true;
    call privadex_amm_btcx_ethx_v6.aleo/swap_btcx_for_ethx r0 10u64 r1 r2 r3 r4 r19 into r21 r22 r23;
    is.eq r7 0u64 into r24;
    ternary r24 30u64 r7 into r25;
    sub 10000u64 r25 into r26;
    cast r26 into r27 as u128;
    mul r19 r27 into r28;
    mul r5 r28 into r29;
    mul r6 10000u128 into r30;
    add r30 r28 into r31;
    div r29 r31 into r32;
    gt r32 0u128 into r33;
    assert.eq r33 true;
    lte r32 18446744073709551615u128 into r34;
    assert.eq r34 true;
    call privadex_amm_native_ethx_v7.aleo/swap_ethx_for_native r22 9u64 r19 r5 r6 r7 r8 into r35 r36 r37;
    cast r36.microcredits into r38 as u128;
    call credits.aleo/transfer_private r36 self.signer r36.microcredits into r39 r40;
    async swap_btcx_for_aleo_via_ethx 5u64 0u64 r1 r38 r23 r37 into r41;
    output r21 as token_registry.aleo/Token.record;
    output r39 as credits.aleo/credits.record;
    output r41 as privadex_router_v2.aleo/swap_btcx_for_aleo_via_ethx.future;

finalize swap_btcx_for_aleo_via_ethx:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as privadex_amm_btcx_ethx_v6.aleo/swap_btcx_for_ethx.future;
    input r5 as privadex_amm_native_ethx_v7.aleo/swap_ethx_for_native.future;
    await r4;
    await r5;
    get.or_use initialized[true] false into r6;
    assert.eq r6 true;
    get.or_use total_routed_volume[r0] 0u128 into r7;
    get.or_use total_output_volume[r1] 0u128 into r8;
    get.or_use total_routes[r0] 0u64 into r9;
    add r7 r2 into r10;
    set r10 into total_routed_volume[r0];
    add r8 r3 into r11;
    set r11 into total_output_volume[r1];
    add r9 1u64 into r12;
    set r12 into total_routes[r0];
    set block.height into last_route_block[r0];

function swap_aleo_for_ethx_via_btcx:
    input r0 as credits.aleo/credits.record;
    input r1 as u64.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u64.private;
    input r5 as u128.private;
    input r6 as u128.private;
    input r7 as u64.private;
    input r8 as u128.private;
    gt r1 0u64 into r9;
    assert.eq r9 true;
    gte r0.microcredits r1 into r10;
    assert.eq r10 true;
    cast r1 into r11 as u128;
    is.eq r4 0u64 into r12;
    ternary r12 30u64 r4 into r13;
    sub 10000u64 r13 into r14;
    cast r14 into r15 as u128;
    mul r11 r15 into r16;
    mul r3 r16 into r17;
    mul r2 10000u128 into r18;
    add r18 r16 into r19;
    div r17 r19 into r20;
    gt r20 0u128 into r21;
    assert.eq r21 true;
    call privadex_amm_native_btcx_v7.aleo/swap_native_for_btcx r0 8u64 r1 r2 r3 r4 r20 into r22 r23 r24;
    call privadex_amm_btcx_ethx_v6.aleo/swap_btcx_for_ethx r23 10u64 r20 r5 r6 r7 r8 into r25 r26 r27;
    call token_registry.aleo/transfer_private self.signer r26.amount r26 into r28 r29 r30;
    async swap_aleo_for_ethx_via_btcx 0u64 6u64 r11 r29.amount r24 r27 r30 into r31;
    output r22 as credits.aleo/credits.record;
    output r29 as token_registry.aleo/Token.record;
    output r31 as privadex_router_v2.aleo/swap_aleo_for_ethx_via_btcx.future;

finalize swap_aleo_for_ethx_via_btcx:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as privadex_amm_native_btcx_v7.aleo/swap_native_for_btcx.future;
    input r5 as privadex_amm_btcx_ethx_v6.aleo/swap_btcx_for_ethx.future;
    input r6 as token_registry.aleo/transfer_private.future;
    await r4;
    await r5;
    await r6;
    get.or_use initialized[true] false into r7;
    assert.eq r7 true;
    get.or_use total_routed_volume[r0] 0u128 into r8;
    get.or_use total_output_volume[r1] 0u128 into r9;
    get.or_use total_routes[r0] 0u64 into r10;
    add r8 r2 into r11;
    set r11 into total_routed_volume[r0];
    add r9 r3 into r12;
    set r12 into total_output_volume[r1];
    add r10 1u64 into r13;
    set r13 into total_routes[r0];
    set block.height into last_route_block[r0];

function swap_ethx_for_aleo_via_btcx:
    input r0 as token_registry.aleo/Token.record;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u64.private;
    input r5 as u128.private;
    input r6 as u128.private;
    input r7 as u64.private;
    input r8 as u64.private;
    gt r1 0u128 into r9;
    assert.eq r9 true;
    is.eq r0.token_id 202field into r10;
    assert.eq r10 true;
    is.eq r4 0u64 into r11;
    ternary r11 30u64 r4 into r12;
    sub 10000u64 r12 into r13;
    cast r13 into r14 as u128;
    mul r1 r14 into r15;
    mul r2 r15 into r16;
    mul r3 10000u128 into r17;
    add r17 r15 into r18;
    div r16 r18 into r19;
    gt r19 0u128 into r20;
    assert.eq r20 true;
    call privadex_amm_btcx_ethx_v6.aleo/swap_ethx_for_btcx r0 10u64 r1 r2 r3 r4 r19 into r21 r22 r23;
    is.eq r7 0u64 into r24;
    ternary r24 30u64 r7 into r25;
    sub 10000u64 r25 into r26;
    cast r26 into r27 as u128;
    mul r19 r27 into r28;
    mul r5 r28 into r29;
    mul r6 10000u128 into r30;
    add r30 r28 into r31;
    div r29 r31 into r32;
    gt r32 0u128 into r33;
    assert.eq r33 true;
    lte r32 18446744073709551615u128 into r34;
    assert.eq r34 true;
    call privadex_amm_native_btcx_v7.aleo/swap_btcx_for_native r22 8u64 r19 r5 r6 r7 r8 into r35 r36 r37;
    cast r36.microcredits into r38 as u128;
    call credits.aleo/transfer_private r36 self.signer r36.microcredits into r39 r40;
    async swap_ethx_for_aleo_via_btcx 6u64 0u64 r1 r38 r23 r37 into r41;
    output r21 as token_registry.aleo/Token.record;
    output r39 as credits.aleo/credits.record;
    output r41 as privadex_router_v2.aleo/swap_ethx_for_aleo_via_btcx.future;

finalize swap_ethx_for_aleo_via_btcx:
    input r0 as u64.public;
    input r1 as u64.public;
    input r2 as u128.public;
    input r3 as u128.public;
    input r4 as privadex_amm_btcx_ethx_v6.aleo/swap_ethx_for_btcx.future;
    input r5 as privadex_amm_native_btcx_v7.aleo/swap_btcx_for_native.future;
    await r4;
    await r5;
    get.or_use initialized[true] false into r6;
    assert.eq r6 true;
    get.or_use total_routed_volume[r0] 0u128 into r7;
    get.or_use total_output_volume[r1] 0u128 into r8;
    get.or_use total_routes[r0] 0u64 into r9;
    add r7 r2 into r10;
    set r10 into total_routed_volume[r0];
    add r8 r3 into r11;
    set r11 into total_output_volume[r1];
    add r9 1u64 into r12;
    set r12 into total_routes[r0];
    set block.height into last_route_block[r0];

function submit_route_intent:
    input r0 as u64.private;
    input r1 as u64.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u8.private;
    input r5 as u32.private;
    input r6 as field.private;
    gt r2 0u128 into r7;
    assert.eq r7 true;
    gt r4 0u8 into r8;
    assert.eq r8 true;
    hash.bhp256 r6 into r9 as field;
    cast self.signer r9 r0 r1 r2 r3 r4 r5 r6 into r10 as RouteIntent.record;
    async submit_route_intent r9 r0 r5 into r11;
    output r10 as RouteIntent.record;
    output r11 as privadex_router_v2.aleo/submit_route_intent.future;

finalize submit_route_intent:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as u32.public;
    get.or_use initialized[true] false into r3;
    get.or_use route_seen[r0] false into r4;
    assert.eq r3 true;
    not r4 into r5;
    assert.eq r5 true;
    lte block.height r2 into r6;
    assert.eq r6 true;
    set true into route_seen[r0];
    set true into route_open[r0];
    set false into route_cancelled[r0];
    get.or_use total_routes[r1] 0u64 into r7;
    add r7 1u64 into r8;
    set r8 into total_routes[r1];

function execute_route:
    input r0 as RouteIntent.record;
    input r1 as u128.private;
    input r2 as u8.private;
    input r3 as u8.private;
    input r4 as field.private;
    gte r1 r0.min_out into r5;
    assert.eq r5 true;
    gt r2 0u8 into r6;
    assert.eq r6 true;
    lte r2 r0.max_hops into r7;
    assert.eq r7 true;
    cast r0.owner r0.route_id r0.token_in r0.token_out r0.amount_in r1 r2 r3 r4 true into r8 as RouteReceipt.record;
    async execute_route r0.route_id r0.token_in r0.token_out r0.amount_in r1 r0.expiry self.caller into r9;
    output r8 as RouteReceipt.record;
    output r9 as privadex_router_v2.aleo/execute_route.future;

finalize execute_route:
    input r0 as field.public;
    input r1 as u64.public;
    input r2 as u64.public;
    input r3 as u128.public;
    input r4 as u128.public;
    input r5 as u32.public;
    input r6 as address.public;
    get.or_use initialized[true] false into r7;
    get.or_use executor_role[r6] false into r8;
    get.or_use route_open[r0] false into r9;
    get.or_use route_cancelled[r0] false into r10;
    assert.eq r7 true;
    assert.eq r8 true;
    assert.eq r9 true;
    not r10 into r11;
    assert.eq r11 true;
    lte block.height r5 into r12;
    assert.eq r12 true;
    set false into route_open[r0];
    get.or_use total_routed_volume[r1] 0u128 into r13;
    get.or_use total_output_volume[r2] 0u128 into r14;
    add r13 r3 into r15;
    set r15 into total_routed_volume[r1];
    add r14 r4 into r16;
    set r16 into total_output_volume[r2];
    set block.height into last_route_block[r1];

function fail_route:
    input r0 as RouteIntent.record;
    input r1 as u8.private;
    input r2 as field.private;
    cast r0.owner r0.route_id r0.token_in r0.token_out r0.amount_in 0u128 0u8 r1 r2 false into r3 as RouteReceipt.record;
    async fail_route r0.route_id self.caller into r4;
    output r3 as RouteReceipt.record;
    output r4 as privadex_router_v2.aleo/fail_route.future;

finalize fail_route:
    input r0 as field.public;
    input r1 as address.public;
    get.or_use initialized[true] false into r2;
    get.or_use executor_role[r1] false into r3;
    get.or_use route_open[r0] false into r4;
    get.or_use route_cancelled[r0] false into r5;
    assert.eq r2 true;
    assert.eq r3 true;
    assert.eq r4 true;
    not r5 into r6;
    assert.eq r6 true;
    set false into route_open[r0];

function cancel_route_intent:
    input r0 as RouteIntent.record;
    is.eq r0.owner self.signer into r1;
    assert.eq r1 true;
    async cancel_route_intent r0.route_id into r2;
    output r2 as privadex_router_v2.aleo/cancel_route_intent.future;

finalize cancel_route_intent:
    input r0 as field.public;
    get.or_use route_open[r0] false into r1;
    get.or_use route_cancelled[r0] false into r2;
    assert.eq r1 true;
    not r2 into r3;
    assert.eq r3 true;
    set false into route_open[r0];
    set true into route_cancelled[r0];

function quote_best_route:
    input r0 as u128.private;
    input r1 as u128.private;
    input r2 as u128.private;
    input r3 as u128.private;
    input r4 as u128.private;
    input r5 as u128.private;
    input r6 as u128.private;
    input r7 as u64.private;
    sub 10000u64 r7 into r8;
    cast r8 into r9 as u128;
    mul r0 r9 into r10;
    mul r2 r10 into r11;
    mul r1 10000u128 into r12;
    add r12 r10 into r13;
    div r11 r13 into r14;
    cast r8 into r15 as u128;
    mul r0 r15 into r16;
    mul r4 r16 into r17;
    mul r3 10000u128 into r18;
    add r18 r16 into r19;
    div r17 r19 into r20;
    cast r8 into r21 as u128;
    mul r20 r21 into r22;
    mul r6 r22 into r23;
    mul r5 10000u128 into r24;
    add r24 r22 into r25;
    div r23 r25 into r26;
    gt r26 r14 into r27;
    ternary r27 r26 r14 into r28;
    ternary r27 2u8 1u8 into r29;
    output r28 as u128.private;
    output r29 as u8.private;

constructor:
    assert.eq edition 0u16;
