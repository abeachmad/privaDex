/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL: string
  readonly VITE_NETWORK: string
  readonly VITE_PROGRAM_TOKEN: string
  readonly VITE_PROGRAM_AMM: string
  readonly VITE_PROGRAM_AMM_BTCX: string
  readonly VITE_PROGRAM_AMM_ETHX: string
  readonly VITE_PROGRAM_AMM_NATIVE_BTCX: string
  readonly VITE_PROGRAM_AMM_NATIVE_ETHX: string
  readonly VITE_PROGRAM_AMM_BTCX_ETHX: string
  readonly VITE_PROGRAM_USDCX: string
  readonly VITE_PROGRAM_TOKEN_REGISTRY: string
  readonly VITE_PROGRAM_DARKPOOL: string
  readonly VITE_PROGRAM_ORDERBOOK: string
  readonly VITE_PROGRAM_ROUTER: string
  readonly VITE_USE_ONCHAIN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
