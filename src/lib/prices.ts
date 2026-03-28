

// Fetch live token prices from CoinGecko API with caching

const COINGECKO_IDS: Record<string, string> = {
  ALEO: "aleo",
  ETH:  "ethereum",
  WBTC: "bitcoin",
  BTCx: "bitcoin",
  ETHx: "ethereum",
};

// Symbol aliases: UI symbols → canonical price keys
// Ensures prices["USDCx"], prices["BTCx"], prices["ETHx"] all resolve correctly
const SYMBOL_ALIASES: Record<string, string> = {
  USDCx: "USDC",
  BTCx:  "BTCx",
  ETHx:  "ETHx",
};

// Stablecoins — always $1
const STABLECOIN = new Set(["USDC", "USDT", "USDCx"]);

// Fallback prices if API fails
const FALLBACK: Record<string, number> = {
  ALEO:  0.065,
  ETH:   1980,
  WBTC:  68000,
  BTCx:  68000,
  ETHx:  1980,
  USDC:  1,
  USDT:  1,
  USDCx: 1,
};

let cachedPrices: Record<string, number> | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 60 seconds

export async function fetchTokenPrices(): Promise<Record<string, number>> {
  // Return cache if fresh
  if (cachedPrices && Date.now() - cacheTime < CACHE_TTL) {
    return cachedPrices;
  }

  const ids = [...new Set(Object.values(COINGECKO_IDS))].join(",");
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const prices: Record<string, number> = { USDC: 1, USDT: 1, USDCx: 1 };
    for (const [symbol, cgId] of Object.entries(COINGECKO_IDS)) {
      prices[symbol] = data[cgId]?.usd ?? FALLBACK[symbol] ?? 0;
    }

    cachedPrices = prices;
    cacheTime = Date.now();
    return prices;
  } catch {
    // Return cached or fallback
    return cachedPrices ?? { ...FALLBACK };
  }
}

/** Get price for a single token symbol (sync, from cache) */
export function getCachedPrice(symbol: string): number {
  if (STABLECOIN.has(symbol)) return 1;
  // Resolve alias (e.g. USDCx → USDC)
  const resolved = SYMBOL_ALIASES[symbol] ?? symbol;
  if (STABLECOIN.has(resolved)) return 1;
  return cachedPrices?.[resolved] ?? cachedPrices?.[symbol] ?? FALLBACK[resolved] ?? FALLBACK[symbol] ?? 0;
}
