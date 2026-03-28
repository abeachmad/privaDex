/**
 * Client-side tracking of records consumed by cross-program transitions.
 * Shield Wallet doesn't reliably mark records as spent when consumed
 * as external_record inputs by a different program (e.g. privadex_amm_v7
 * consuming privadex_token records). This module stores consumed record
 * plaintexts in localStorage so we can manually exclude them from balance
 * calculations until the wallet eventually syncs.
 */

const STORAGE_KEY = "privadex_spent_records";
const MAX_AGE_MS = 60 * 60 * 1000; // 60 minutes — Shield Wallet cache can be stale for long

interface SpentEntry {
  plaintext: string;
  timestamp: number;
}

function getEntries(): SpentEntry[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function setEntries(entries: SpentEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/** Mark a record plaintext as manually spent (consumed by a cross-program tx) */
export function markRecordSpent(plaintext: string) {
  if (!plaintext) return;
  const entries = getEntries();
  // Avoid duplicates
  if (entries.some(e => e.plaintext === plaintext)) return;
  entries.push({ plaintext, timestamp: Date.now() });
  setEntries(entries);
}

/** Check if a wallet record was manually marked as spent */
export function isRecordManuallySpent(record: any): boolean {
  const pt = record.recordPlaintext || record.plaintext || "";
  if (!pt) return false;
  const now = Date.now();
  const entries = getEntries();
  // Clean up expired entries
  const valid = entries.filter(e => now - e.timestamp < MAX_AGE_MS);
  if (valid.length !== entries.length) setEntries(valid);
  return valid.some(e => e.plaintext === pt);
}
