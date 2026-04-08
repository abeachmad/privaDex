/**
 * Vercel serverless function for faucet minting.
 *
 * Faucet admin private key NEVER reaches the browser.
 * Frontend POSTs to /api/faucet-mint, this function signs the tx server-side
 * and returns the tx ID.
 *
 * Server-side env vars (set in Vercel dashboard, NOT prefixed with VITE_):
 *   FAUCET_PRIVATE_KEY  — admin private key with minter role
 *   ALEO_RPC_URL        — defaults to https://api.explorer.provable.com/v1
 */

// Vercel/Next.js style API route
export const config = {
  runtime: 'nodejs',
  maxDuration: 60,
}

interface MintRequest {
  tokenId: string   // e.g. "201field"
  receiver: string  // aleo1...
  amount: string    // bigint as string
}

// Per-IP rate limit (in-memory, resets on cold start)
const rateLimit = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const RATE_LIMIT_MAX = 10 // 10 mints per hour per IP

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const entry = rateLimit.get(ip)

  if (!entry || entry.resetAt < now) {
    rateLimit.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 }
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 }
  }

  entry.count += 1
  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count }
}

// Maximum amounts per mint to prevent abuse
const MAX_AMOUNTS: Record<string, bigint> = {
  '201field': 10_000_000n,    // 10 BTCx max per mint
  '202field': 100_000_000n,   // 100 ETHx max per mint
}

// Allowed token IDs
const ALLOWED_TOKENS = new Set(['201field', '202field'])

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Rate limit by IP
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim()
  const limit = checkRateLimit(ip)
  if (!limit.allowed) {
    return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' })
  }

  try {
    const { tokenId, receiver, amount } = req.body as MintRequest

    // Validate inputs
    if (!tokenId || !receiver || !amount) {
      return res.status(400).json({ error: 'Missing required fields: tokenId, receiver, amount' })
    }

    if (!ALLOWED_TOKENS.has(tokenId)) {
      return res.status(400).json({ error: `Token ${tokenId} not allowed` })
    }

    if (!receiver.startsWith('aleo1') || receiver.length < 60) {
      return res.status(400).json({ error: 'Invalid receiver address' })
    }

    let amountBig: bigint
    try {
      amountBig = BigInt(amount)
    } catch {
      return res.status(400).json({ error: 'Invalid amount' })
    }

    if (amountBig <= 0n) {
      return res.status(400).json({ error: 'Amount must be positive' })
    }

    const maxAmount = MAX_AMOUNTS[tokenId]
    if (maxAmount && amountBig > maxAmount) {
      return res.status(400).json({
        error: `Amount exceeds max ${Number(maxAmount) / 1e6} for token ${tokenId}`,
      })
    }

    // Read server-side env (NOT prefixed with VITE_)
    const FAUCET_PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY
    const RPC_URL = process.env.ALEO_RPC_URL || 'https://api.explorer.provable.com/v1'

    if (!FAUCET_PRIVATE_KEY) {
      console.error('[faucet-mint] FAUCET_PRIVATE_KEY not configured')
      return res.status(500).json({ error: 'Faucet not configured on server' })
    }

    // Lazy-load SDK
    const sdk = await import('@provablehq/sdk')
    await sdk.initializeWasm()

    const account = new sdk.Account({ privateKey: FAUCET_PRIVATE_KEY })
    const sdkEndpoint = RPC_URL.replace('/v1', '/v2').replace(/\/testnet$/, '')
    const pm = new sdk.ProgramManager(sdkEndpoint, undefined, undefined)
    pm.setAccount(account)

    const inputs = [
      tokenId,
      receiver,
      `${amountBig}u128`,
      '0u32',
    ]

    console.log('[faucet-mint] Executing mint:', { tokenId, receiver, amount: amountBig.toString(), ip })

    const txId = await pm.execute({
      programName: 'token_registry.aleo',
      functionName: 'mint_public',
      inputs,
      priorityFee: 1.5,
      privateFee: false,
    } as any)

    const txIdStr = typeof txId === 'string' ? txId : String(txId)
    console.log('[faucet-mint] TX submitted:', txIdStr)

    return res.status(200).json({
      txId: txIdStr,
      remaining: limit.remaining,
    })
  } catch (err: any) {
    console.error('[faucet-mint] Error:', err?.message || err)
    return res.status(500).json({
      error: `Mint failed: ${err?.message || 'Unknown error'}`,
    })
  }
}
