
// PrivaDEX Blind Router — Client-side routing engine
//
// Privately evaluates all trading venues using real on-chain data
// and selects the optimal execution path. The routing decision happens
// entirely in the browser — on-chain observers cannot see which venues
// were evaluated or why a particular route was chosen.
//
// Venues:
//   Shielded AMM — live executable path used by the app today
//   Dark Pool    — visible as an experimental manual intent flow
//   Order Book   — visible as an experimental manual order-intent flow

import {
  fetchPoolReserves,
  fetchEpochState,
  cpmmOutputWithFee,
  priceImpact as calcPriceImpact,
  type PoolReserves,
} from "./aleo";
import { POOL_IDS, POOL_AMM_CONFIG } from "./programs";
import { VENUE_CAPABILITIES, venueCapabilityReason } from "./venueCapabilities";

// ─── Types ──────────────────────────────────────────────────────────────────

export type Venue = "amm" | "darkpool" | "orderbook";

export interface VenueQuote {
  venue:          Venue;
  available:      boolean;     // can execute this route right now
  amountOut:      bigint;      // expected output (micro-units)
  priceImpact:    number;      // percentage (0-100)
  feeBps:         number;      // fee in basis points
  executionType:  "immediate" | "batched" | "conditional";
  settlementTime: string;      // human readable
  reason?:        string;      // why unavailable or extra info
}

export interface RoutingResult {
  selectedVenue: Venue;
  quotes:        VenueQuote[];
  breakdown:     Record<Venue, number>;  // percentage allocation
  analysis:      string;                 // human-readable explanation
  evaluated:     boolean;                // true = real data, false = placeholder
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function findBestRoute(
  amountIn: bigint,
  isAtoB:   boolean,
  poolId:   number = POOL_IDS.ALEO_USDCX,
): Promise<RoutingResult> {
  if (amountIn <= 0n) {
    return emptyResult("Enter an amount to see routing analysis.");
  }

  // Fetch AMM reserves first — needed by multiple venue evaluations
  const ammConfig = POOL_AMM_CONFIG[poolId];
  let reserves: PoolReserves;
  try {
    reserves = await fetchPoolReserves(poolId, ammConfig?.program);
  } catch {
    return emptyResult("Cannot fetch pool data. Check your connection.");
  }

  // Dark Pool and Order Book stay visible in the UI, but the blind router only
  // auto-routes into venues that are executable and fully supported end-to-end.
  const supportsDarkPoolAndOB = poolId === POOL_IDS.ALEO_USDCX;

  // Evaluate all venues in parallel
  const [ammQuote, dpQuote, obQuote] = await Promise.all([
    evaluateAmm(amountIn, isAtoB, poolId, reserves),
    supportsDarkPoolAndOB
      ? evaluateDarkPool(amountIn, isAtoB, reserves)
      : Promise.resolve<VenueQuote>({ venue: "darkpool", available: false, amountOut: 0n, priceImpact: 0, feeBps: 0, executionType: "batched", settlementTime: "~2min", reason: "Only available for ALEO/USDCx" }),
    supportsDarkPoolAndOB
      ? evaluateOrderBook(amountIn, isAtoB, reserves)
      : Promise.resolve<VenueQuote>({ venue: "orderbook", available: false, amountOut: 0n, priceImpact: 0, feeBps: 0, executionType: "conditional", settlementTime: "When matched", reason: "Only available for ALEO/USDCx" }),
  ]);

  const quotes = [ammQuote, dpQuote, obQuote];

  // Select best available venue. Only venues explicitly enabled in router can
  // become the recommended route.
  const available = quotes.filter(q => q.available && q.amountOut > 0n);
  let selectedVenue: Venue = "amm";

  const routable = available.filter(q => VENUE_CAPABILITIES[q.venue].enabledInRouter);
  if (routable.length > 0) {
    let bestOut = 0n;
    for (const q of routable) {
      if (q.amountOut > bestOut) {
        bestOut = q.amountOut;
        selectedVenue = q.venue;
      }
    }
  }

  // Compute breakdown
  const breakdown: Record<Venue, number> = { amm: 0, darkpool: 0, orderbook: 0 };
  if (available.length > 0) {
    breakdown[selectedVenue] = 100;
  }

  // Generate analysis
  const analysis = generateAnalysis(ammQuote, dpQuote, obQuote);

  return { selectedVenue, quotes, breakdown, analysis, evaluated: true };
}

// ─── Venue evaluators ────────────────────────────────────────────────────────

async function evaluateAmm(
  amountIn: bigint,
  isAtoB:   boolean,
  poolId:   number,
  reserves: PoolReserves,
): Promise<VenueQuote> {
  if (reserves.reserveA === 0n || reserves.reserveB === 0n) {
    return {
      venue: "amm",
      available: false,
      amountOut: 0n,
      priceImpact: 0,
      feeBps: reserves.feesBps || 30,
      executionType: "immediate",
      settlementTime: "~15s",
      reason: "No liquidity in pool",
    };
  }

  const [resIn, resOut] = isAtoB
    ? [reserves.reserveA, reserves.reserveB]
    : [reserves.reserveB, reserves.reserveA];

  const amountOut = cpmmOutputWithFee(amountIn, resIn, resOut, reserves.feesBps);
  const impact    = calcPriceImpact(amountIn, resIn, resOut, reserves.feesBps);

  let bestAmountOut = amountOut;
  let bestImpact = impact;
  let reason: string | undefined;

  try {
    if (poolId === POOL_IDS.ALEO_BTCX) {
      if (isAtoB) {
        const [aleoEthx, btcxEthx] = await Promise.all([
          fetchPoolReserves(POOL_IDS.ALEO_ETHX, POOL_AMM_CONFIG[POOL_IDS.ALEO_ETHX]?.program),
          fetchPoolReserves(POOL_IDS.BTCX_ETHX, POOL_AMM_CONFIG[POOL_IDS.BTCX_ETHX]?.program),
        ]);
        const midOut = cpmmOutputWithFee(amountIn, aleoEthx.reserveA, aleoEthx.reserveB, aleoEthx.feesBps);
        const altOut = cpmmOutputWithFee(midOut, btcxEthx.reserveB, btcxEthx.reserveA, btcxEthx.feesBps);
        if (altOut > bestAmountOut) {
          bestAmountOut = altOut;
          bestImpact = calcPriceImpact(amountIn, aleoEthx.reserveA, aleoEthx.reserveB, aleoEthx.feesBps)
            + calcPriceImpact(midOut, btcxEthx.reserveB, btcxEthx.reserveA, btcxEthx.feesBps);
          reason = "Atomic route via ETHx";
        }
      } else {
        const [btcxEthx, aleoEthx] = await Promise.all([
          fetchPoolReserves(POOL_IDS.BTCX_ETHX, POOL_AMM_CONFIG[POOL_IDS.BTCX_ETHX]?.program),
          fetchPoolReserves(POOL_IDS.ALEO_ETHX, POOL_AMM_CONFIG[POOL_IDS.ALEO_ETHX]?.program),
        ]);
        const midOut = cpmmOutputWithFee(amountIn, btcxEthx.reserveA, btcxEthx.reserveB, btcxEthx.feesBps);
        const altOut = cpmmOutputWithFee(midOut, aleoEthx.reserveB, aleoEthx.reserveA, aleoEthx.feesBps);
        if (altOut > bestAmountOut) {
          bestAmountOut = altOut;
          bestImpact = calcPriceImpact(amountIn, btcxEthx.reserveA, btcxEthx.reserveB, btcxEthx.feesBps)
            + calcPriceImpact(midOut, aleoEthx.reserveB, aleoEthx.reserveA, aleoEthx.feesBps);
          reason = "Atomic route via ETHx";
        }
      }
    } else if (poolId === POOL_IDS.ALEO_ETHX) {
      if (isAtoB) {
        const [aleoBtcx, btcxEthx] = await Promise.all([
          fetchPoolReserves(POOL_IDS.ALEO_BTCX, POOL_AMM_CONFIG[POOL_IDS.ALEO_BTCX]?.program),
          fetchPoolReserves(POOL_IDS.BTCX_ETHX, POOL_AMM_CONFIG[POOL_IDS.BTCX_ETHX]?.program),
        ]);
        const midOut = cpmmOutputWithFee(amountIn, aleoBtcx.reserveA, aleoBtcx.reserveB, aleoBtcx.feesBps);
        const altOut = cpmmOutputWithFee(midOut, btcxEthx.reserveA, btcxEthx.reserveB, btcxEthx.feesBps);
        if (altOut > bestAmountOut) {
          bestAmountOut = altOut;
          bestImpact = calcPriceImpact(amountIn, aleoBtcx.reserveA, aleoBtcx.reserveB, aleoBtcx.feesBps)
            + calcPriceImpact(midOut, btcxEthx.reserveA, btcxEthx.reserveB, btcxEthx.feesBps);
          reason = "Atomic route via BTCx";
        }
      } else {
        const [btcxEthx, aleoBtcx] = await Promise.all([
          fetchPoolReserves(POOL_IDS.BTCX_ETHX, POOL_AMM_CONFIG[POOL_IDS.BTCX_ETHX]?.program),
          fetchPoolReserves(POOL_IDS.ALEO_BTCX, POOL_AMM_CONFIG[POOL_IDS.ALEO_BTCX]?.program),
        ]);
        const midOut = cpmmOutputWithFee(amountIn, btcxEthx.reserveB, btcxEthx.reserveA, btcxEthx.feesBps);
        const altOut = cpmmOutputWithFee(midOut, aleoBtcx.reserveB, aleoBtcx.reserveA, aleoBtcx.feesBps);
        if (altOut > bestAmountOut) {
          bestAmountOut = altOut;
          bestImpact = calcPriceImpact(amountIn, btcxEthx.reserveB, btcxEthx.reserveA, btcxEthx.feesBps)
            + calcPriceImpact(midOut, aleoBtcx.reserveB, aleoBtcx.reserveA, aleoBtcx.feesBps);
          reason = "Atomic route via BTCx";
        }
      }
    } else if (poolId === POOL_IDS.BTCX_ETHX) {
      if (isAtoB) {
        const [aleoBtcx, aleoEthx] = await Promise.all([
          fetchPoolReserves(POOL_IDS.ALEO_BTCX, POOL_AMM_CONFIG[POOL_IDS.ALEO_BTCX]?.program),
          fetchPoolReserves(POOL_IDS.ALEO_ETHX, POOL_AMM_CONFIG[POOL_IDS.ALEO_ETHX]?.program),
        ]);
        const midOut = cpmmOutputWithFee(amountIn, aleoBtcx.reserveB, aleoBtcx.reserveA, aleoBtcx.feesBps);
        const altOut = cpmmOutputWithFee(midOut, aleoEthx.reserveA, aleoEthx.reserveB, aleoEthx.feesBps);
        if (altOut > bestAmountOut) {
          bestAmountOut = altOut;
          bestImpact = calcPriceImpact(amountIn, aleoBtcx.reserveB, aleoBtcx.reserveA, aleoBtcx.feesBps)
            + calcPriceImpact(midOut, aleoEthx.reserveA, aleoEthx.reserveB, aleoEthx.feesBps);
          reason = "Atomic route via ALEO";
        }
      } else {
        const [aleoEthx, aleoBtcx] = await Promise.all([
          fetchPoolReserves(POOL_IDS.ALEO_ETHX, POOL_AMM_CONFIG[POOL_IDS.ALEO_ETHX]?.program),
          fetchPoolReserves(POOL_IDS.ALEO_BTCX, POOL_AMM_CONFIG[POOL_IDS.ALEO_BTCX]?.program),
        ]);
        const midOut = cpmmOutputWithFee(amountIn, aleoEthx.reserveB, aleoEthx.reserveA, aleoEthx.feesBps);
        const altOut = cpmmOutputWithFee(midOut, aleoBtcx.reserveA, aleoBtcx.reserveB, aleoBtcx.feesBps);
        if (altOut > bestAmountOut) {
          bestAmountOut = altOut;
          bestImpact = calcPriceImpact(amountIn, aleoEthx.reserveB, aleoEthx.reserveA, aleoEthx.feesBps)
            + calcPriceImpact(midOut, aleoBtcx.reserveA, aleoBtcx.reserveB, aleoBtcx.feesBps);
          reason = "Atomic route via ALEO";
        }
      }
    }
  } catch {
    // Keep the direct quote when alternate pool data is unavailable.
  }

  return {
    venue: "amm",
    available: true,
    amountOut: bestAmountOut,
    priceImpact: bestImpact,
    feeBps: reserves.feesBps,
    executionType: "immediate",
    settlementTime: "~15s",
    reason,
  };
}

async function evaluateDarkPool(
  amountIn: bigint,
  isAtoB:   boolean,
  reserves: PoolReserves,
): Promise<VenueQuote> {
  const base: Omit<VenueQuote, "available" | "amountOut" | "reason"> = {
    venue: "darkpool",
    priceImpact: 0,     // dark pool settles at mid-price = zero slippage
    feeBps: 0,          // no explicit fee
    executionType: "batched",
    settlementTime: "~2min",
  };

  if (!VENUE_CAPABILITIES.darkpool.enabledInRouter) {
    return {
      ...base,
      available: false,
      amountOut: 0n,
      reason: venueCapabilityReason("darkpool"),
    };
  }

  try {
    // Get current block height for epoch calculation
    const heightRes = await fetch(
      "https://api.explorer.provable.com/v1/testnet/latest/height",
      { signal: AbortSignal.timeout(5000) },
    );
    if (!heightRes.ok) throw new Error("height fetch failed");
    const height  = parseInt(await heightRes.text());
    const epochId = Math.floor(height / 120);
    const blocksLeft = 120 - (height % 120);
    const secsLeft   = Math.max(1, Math.ceil(blocksLeft * 15 / 60));

    const epoch = await fetchEpochState(epochId);

    // Compute zero-slippage output at spot price (what dark pool would give)
    if (reserves.reserveA > 0n && reserves.reserveB > 0n) {
      let spotOut: bigint;
      if (isAtoB) {
        spotOut = (amountIn * reserves.reserveB) / reserves.reserveA;
      } else {
        spotOut = (amountIn * reserves.reserveA) / reserves.reserveB;
      }

      // Dark pool v2 can accept intents if epoch is open
      if (!epoch.closed) {
        return {
          ...base,
          available: true,
          amountOut: spotOut,
          settlementTime: `~${secsLeft}min`,
          reason: epoch.intentCount > 0
            ? `${epoch.intentCount} intents queued · Zero slippage`
            : "Zero slippage · Batched settlement",
        };
      } else {
        return {
          ...base,
          available: false,
          amountOut: spotOut,
          settlementTime: "Next epoch",
          reason: "Epoch closed · Waiting for next epoch",
        };
      }
    }

    return { ...base, available: false, amountOut: 0n, reason: "No AMM reserves for pricing" };
  } catch {
    return { ...base, available: false, amountOut: 0n, reason: "Dark pool unavailable" };
  }
}

async function evaluateOrderBook(
  amountIn: bigint,
  isAtoB:   boolean,
  reserves: PoolReserves,
): Promise<VenueQuote> {
  const base: Omit<VenueQuote, "available" | "amountOut" | "reason"> = {
    venue: "orderbook",
    priceImpact: 0,     // limit order executes at your price = zero slippage
    feeBps: 0,          // no explicit fee
    executionType: "conditional",
    settlementTime: "When matched",
  };

  if (!VENUE_CAPABILITIES.orderbook.enabledInRouter) {
    return {
      ...base,
      available: false,
      amountOut: 0n,
      reason: venueCapabilityReason("orderbook"),
    };
  }

  // Order book places a limit order at spot price with zero slippage.
  // Output = amountIn * spotPrice (no fee deduction, no price impact).
  // Available when pool has reserves for spot price calculation.
  if (reserves.reserveA > 0n && reserves.reserveB > 0n) {
    const spotOut = isAtoB
      ? (amountIn * reserves.reserveB) / reserves.reserveA
      : (amountIn * reserves.reserveA) / reserves.reserveB;

    return {
      ...base,
      available: true,
      amountOut: spotOut,
      reason: "Limit order at spot price · Conditional execution",
    };
  }

  return { ...base, available: false, amountOut: 0n, reason: "No reserves for pricing" };
}

// ─── Analysis generator ──────────────────────────────────────────────────────

function generateAnalysis(
  amm:  VenueQuote,
  dp:   VenueQuote,
  ob:   VenueQuote,
): string {
  if (!amm.available && !dp.available && !ob.available) {
    return "No venues available. Add liquidity to the pool first.";
  }

  if (!amm.available) {
    return "Shielded AMM has no executable liquidity right now.";
  }

  const parts: string[] = [];

  if (!VENUE_CAPABILITIES.darkpool.enabledInRouter) {
    parts.push("Blind Router currently auto-routes only through Shielded AMM.");
  }

  if (!VENUE_CAPABILITIES.orderbook.enabledInRouter) {
    parts.push("Dark Pool and Order Book stay available as experimental manual flows only.");
  }

  if (amm.reason) {
    parts.push(`${amm.reason}.`);
  }

  // AMM impact warning
  if (amm.priceImpact > 1) {
    parts.push(`Price impact: ${amm.priceImpact.toFixed(2)}%.`);
  }

  if (parts.length === 0) {
    parts.push("AMM selected — best available rate with immediate execution.");
  }

  return parts.join(" ");
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function emptyResult(analysis: string): RoutingResult {
  const empty: VenueQuote = {
    venue: "amm",
    available: false,
    amountOut: 0n,
    priceImpact: 0,
    feeBps: 30,
    executionType: "immediate",
    settlementTime: "~15s",
  };
  return {
    selectedVenue: "amm",
    quotes: [
      { ...empty, venue: "amm" },
      { ...empty, venue: "darkpool", executionType: "batched", settlementTime: "~2min" },
      { ...empty, venue: "orderbook", executionType: "conditional", settlementTime: "When matched" },
    ],
    breakdown: { amm: 0, darkpool: 0, orderbook: 0 },
    analysis,
    evaluated: false,
  };
}

// ─── Display helpers ─────────────────────────────────────────────────────────

export function venueDisplayName(venue: Venue): string {
  switch (venue) {
    case "amm":       return "Shielded AMM";
    case "darkpool":  return "Dark Pool";
    case "orderbook": return "Order Book";
  }
}

export function venueColor(venue: Venue): string {
  switch (venue) {
    case "amm":       return "bg-cyan-DEFAULT";
    case "darkpool":  return "bg-violet-DEFAULT";
    case "orderbook": return "bg-amber-DEFAULT";
  }
}

export function venueAccent(venue: Venue): string {
  switch (venue) {
    case "amm":       return "text-cyan-DEFAULT";
    case "darkpool":  return "text-violet-DEFAULT";
    case "orderbook": return "text-amber-DEFAULT";
  }
}
