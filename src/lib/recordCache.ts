/**
 * Module-level record cache shared across components.
 *
 * Problem: Shield Wallet's requestRecords sometimes returns empty during
 * transaction flows even though other components (BalanceDropdown) can
 * fetch records successfully. This cache stores the last successful fetch
 * so other components can use it as a fallback.
 */

interface CacheEntry {
  records: any[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

/** Store a successful record fetch result */
export function setCachedRecords(program: string, records: any[]): void {
  if (!Array.isArray(records) || records.length === 0) return;
  cache.set(program, { records: [...records], timestamp: Date.now() });
}

/**
 * Retrieve cached records for a program.
 * Returns empty array if no cache or cache is older than maxAgeMs.
 */
export function getCachedRecords(program: string, maxAgeMs = 120_000): any[] {
  const entry = cache.get(program);
  if (!entry) return [];
  if (Date.now() - entry.timestamp > maxAgeMs) return [];
  return entry.records;
}
