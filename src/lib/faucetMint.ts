/**
 * Faucet mint client — calls the server-side serverless function.
 *
 * The faucet admin private key is stored ONLY on the server (Vercel env).
 * The browser never sees the private key — it just POSTs the mint request
 * and receives a tx ID back.
 */

interface MintResponse {
  txId?: string
  remaining?: number
  error?: string
}

/**
 * Mint tokens via /api/faucet-mint serverless function.
 * The server signs with the admin key and broadcasts the transaction.
 */
export async function faucetMintPublic(
  tokenId: string,
  receiver: string,
  amount: bigint,
  onStatus?: (msg: string) => void,
): Promise<string> {
  onStatus?.('Submitting mint request...')

  let res: Response
  try {
    res = await fetch('/api/faucet-mint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokenId,
        receiver,
        amount: amount.toString(),
      }),
    })
  } catch (err: any) {
    throw new Error(`Network error contacting faucet: ${err?.message || err}`)
  }

  let body: MintResponse
  try {
    body = await res.json()
  } catch {
    throw new Error(`Faucet returned invalid response (status ${res.status})`)
  }

  if (!res.ok || body.error) {
    throw new Error(body.error || `Faucet failed: HTTP ${res.status}`)
  }

  if (!body.txId) {
    throw new Error('Faucet did not return a transaction ID')
  }

  console.log('[FaucetMint] TX submitted via serverless:', body.txId, '(remaining:', body.remaining, ')')
  return body.txId
}
