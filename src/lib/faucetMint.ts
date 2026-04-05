/**
 * Faucet mint for BTCx/ETHx using the admin key via @provablehq/sdk.
 * 
 * On token_registry.aleo, mint_public requires admin or minter role.
 * The faucet signs these transactions with the admin key so any user can receive tokens.
 * Tokens are minted to the user's PUBLIC balance — they can convert to private later.
 */

const RPC_URL = import.meta.env.VITE_RPC_URL || 'https://api.explorer.provable.com/v1'
const FAUCET_PRIVATE_KEY = import.meta.env.VITE_FAUCET_PRIVATE_KEY
// ProgramManager priority fees are specified in ALEO credits, not microcredits.
const FAUCET_PRIORITY_FEE_CREDITS = 1.5

// Lazy-load the heavy SDK only when needed
let sdkPromise: Promise<typeof import('@provablehq/sdk')> | null = null

async function getSDK() {
  if (!sdkPromise) {
    sdkPromise = import('@provablehq/sdk')
  }
  return sdkPromise
}

/**
 * Mint tokens via token_registry.aleo/mint_public using the faucet admin key.
 * Tokens go to the receiver's PUBLIC balance.
 *
 * mint_public(token_id: field, receiver: address, amount: u128, authorized_until: u32)
 */
export async function faucetMintPublic(
  tokenId: string,
  receiver: string,
  amount: bigint,
  onStatus?: (msg: string) => void,
): Promise<string> {
  if (!FAUCET_PRIVATE_KEY) {
    throw new Error('Faucet admin key not configured')
  }

  onStatus?.('Loading Aleo SDK...')
  const sdk = await getSDK()

  onStatus?.('Initializing WASM...')
  await sdk.initializeWasm()

  // Use thread pool to avoid blocking main thread during proof generation
  try {
    await sdk.initThreadPool()
  } catch {
    // Thread pool may already be initialized or not supported
  }

  const account = new sdk.Account({ privateKey: FAUCET_PRIVATE_KEY })
  // SDK auto-appends "/testnet" — use base URL without path
  const sdkEndpoint = RPC_URL.replace('/v1', '/v2').replace(/\/testnet$/, '')
  const pm = new sdk.ProgramManager(sdkEndpoint, undefined, undefined)
  pm.setAccount(account)

  const inputs = [
    tokenId,           // token_id: field
    receiver,          // receiver: address
    `${amount}u128`,   // amount: u128
    '0u32',            // authorized_until: u32
  ]

  onStatus?.('Generating proof & submitting transaction...')
  console.log('[FaucetMint] mint_public:', { tokenId, receiver, amount: amount.toString() })

  try {
    const txId = await pm.execute({
      programName: 'token_registry.aleo',
      functionName: 'mint_public',
      inputs,
      priorityFee: FAUCET_PRIORITY_FEE_CREDITS,
      privateFee: false,
    } as any)

    console.log('[FaucetMint] TX submitted:', txId)
    return typeof txId === 'string' ? txId : String(txId)
  } catch (err: any) {
    console.error('[FaucetMint] Failed:', err)
    throw new Error(`Mint failed: ${err?.message || err}`)
  }
}
