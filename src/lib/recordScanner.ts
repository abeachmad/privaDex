/**
 * Record Scanner integration — reliable record discovery via Provable's
 * Record Scanning Service (RSS).
 *
 * Shield Wallet's requestRecords() can fail silently or return stale data.
 * The Record Scanner provides a more reliable alternative by scanning the
 * chain with the user's ViewKey inside a TEE (Trusted Execution Environment).
 *
 * Flow:
 *  1. Get ephemeral X25519 pubkey from scanner
 *  2. Encrypt ViewKey with it and register → get UUID
 *  3. Query owned records by UUID, filter by program/record type
 *
 * The scanner is lazily initialized and caches the UUID for the session.
 * Records are stored in the shared recordCache for use by other modules.
 */

import { setCachedRecords } from "./recordCache";

// ─── Config ──────────────────────────────────────────────────────────────────
const SCANNER_BASE = import.meta.env.VITE_SCANNER_URL || "https://api.provable.com/scanner";
const SCANNER_API_KEY = import.meta.env.VITE_SCANNER_API_KEY || "";
const SCANNER_CONSUMER_ID = import.meta.env.VITE_SCANNER_CONSUMER_ID || "";
const NETWORK = import.meta.env.VITE_NETWORK || "testnet";
const SCANNER_URL = `${SCANNER_BASE}/${NETWORK}`;

// ─── State ───────────────────────────────────────────────────────────────────
let scannerUUID: string | null = null;
let registeredViewKey: string | null = null;
let sdkModule: any = null;

async function getSDK() {
  if (!sdkModule) {
    sdkModule = await import("@provablehq/sdk");
  }
  return sdkModule;
}

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (SCANNER_API_KEY) h["X-Provable-API-Key"] = SCANNER_API_KEY;
  return h;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Check if the scanner is configured (has API key) */
export function isScannerConfigured(): boolean {
  return !!SCANNER_API_KEY;
}

/** Check if the scanner is ready (registered with a view key) */
export function isScannerReady(): boolean {
  return !!scannerUUID;
}

/**
 * Register a ViewKey with the Record Scanner (encrypted flow).
 * Call once per session after wallet connection.
 *
 * @param viewKey - The user's ViewKey string (e.g. "AViewKey1...")
 * @param startBlock - Block height to start scanning from (0 = genesis)
 */
export async function registerViewKey(viewKey: string, startBlock = 0): Promise<boolean> {
  if (!SCANNER_API_KEY) {
    console.warn("[RecordScanner] No API key configured. Set VITE_SCANNER_API_KEY in .env");
    return false;
  }

  // Skip if already registered with the same key
  if (scannerUUID && registeredViewKey === viewKey) {
    console.log("[RecordScanner] Already registered");
    return true;
  }

  try {
    const sdk = await getSDK();

    // 1. Get ephemeral public key
    const pubkeyRes = await fetch(`${SCANNER_URL}/pubkey`, {
      method: "GET",
      headers: getHeaders(),
      signal: AbortSignal.timeout(10_000),
    });
    if (!pubkeyRes.ok) {
      throw new Error(`Pubkey fetch failed: ${pubkeyRes.status}`);
    }
    const { key_id, public_key } = await pubkeyRes.json();

    // 2. Encrypt view key
    const viewKeyObj = sdk.ViewKey.from_string(viewKey);
    const ciphertext = sdk.encryptRegistrationRequest(public_key, viewKeyObj, startBlock);

    // 3. Register
    const registerRes = await fetch(`${SCANNER_URL}/register/encrypted`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ key_id, ciphertext }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!registerRes.ok) {
      throw new Error(`Registration failed: ${registerRes.status} ${await registerRes.text()}`);
    }
    const result = await registerRes.json();
    scannerUUID = result.uuid || result.data?.uuid;
    registeredViewKey = viewKey;

    console.log(`[RecordScanner] Registered successfully. UUID: ${scannerUUID?.substring(0, 8)}...`);
    return true;
  } catch (e: any) {
    console.error("[RecordScanner] Registration failed:", e?.message);
    return false;
  }
}

/**
 * Register using a private key (derives ViewKey automatically).
 * Convenience for testnet where private keys are available.
 */
export async function registerWithPrivateKey(privateKey: string, startBlock = 0): Promise<boolean> {
  try {
    const sdk = await getSDK();
    const account = new sdk.Account({ privateKey });
    const viewKey = account.viewKey().to_string();
    return await registerViewKey(viewKey, startBlock);
  } catch (e: any) {
    console.error("[RecordScanner] registerWithPrivateKey failed:", e?.message);
    return false;
  }
}

/**
 * Fetch records from the Record Scanner.
 * Returns records in the same format as Shield Wallet for compatibility.
 *
 * @param program - Program name (e.g. "credits.aleo")
 * @param recordName - Record type name (e.g. "credits", "Token")
 * @param unspent - Only return unspent records (default: true)
 */
export async function fetchRecordsFromScanner(
  program: string,
  recordName?: string,
  unspent = true,
): Promise<any[]> {
  if (!scannerUUID) {
    console.warn("[RecordScanner] Not registered. Call registerViewKey() first.");
    return [];
  }

  try {
    const body: any = {
      uuid: scannerUUID,
      unspent,
    };
    if (program || recordName) {
      body.filter = {};
      if (program) body.filter.program = program;
      if (recordName) body.filter.record = recordName;
    }

    const res = await fetch(`${SCANNER_URL}/records/owned`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });

    // 422 = UUID expired, need to re-register
    if (res.status === 422) {
      console.warn("[RecordScanner] UUID expired. Re-register needed.");
      scannerUUID = null;
      if (registeredViewKey) {
        const ok = await registerViewKey(registeredViewKey);
        if (ok) return fetchRecordsFromScanner(program, recordName, unspent);
      }
      return [];
    }

    if (!res.ok) {
      console.error("[RecordScanner] Query failed:", res.status);
      return [];
    }

    const result = await res.json();
    const records: any[] = Array.isArray(result) ? result
      : result.data ? result.data
      : result.ok && Array.isArray(result.data) ? result.data
      : [];

    // Normalize records to match Shield Wallet format for compatibility
    const normalized = records.map(normalizeRecord);

    if (normalized.length > 0) {
      console.log(`[RecordScanner] Found ${normalized.length} records for ${program}${recordName ? `/${recordName}` : ""}`);
      // Store in shared cache for other modules
      setCachedRecords(program, normalized);
    }

    return normalized;
  } catch (e: any) {
    console.error("[RecordScanner] fetchRecords failed:", e?.message);
    return [];
  }
}

/**
 * Normalize a Record Scanner OwnedRecord to Shield Wallet format.
 * Shield Wallet returns { recordPlaintext, spent, recordName, ... }
 * Record Scanner returns { record_plaintext, spent, record_name, program_name, ... }
 */
function normalizeRecord(rec: any): any {
  return {
    // Shield Wallet fields (used by existing code)
    recordPlaintext: rec.record_plaintext || rec.recordPlaintext || "",
    plaintext: rec.record_plaintext || rec.plaintext || "",
    spent: rec.spent ?? false,
    recordName: rec.record_name || rec.recordName || "",
    type: rec.record_name || rec.type || "",
    program: rec.program_name || rec.program || "",
    // Preserve original fields
    ...rec,
  };
}

/** Clear scanner state (call on wallet disconnect) */
export function resetScanner(): void {
  scannerUUID = null;
  registeredViewKey = null;
  console.log("[RecordScanner] Reset");
}
