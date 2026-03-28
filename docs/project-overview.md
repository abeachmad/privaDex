# PrivaDEX — Privacy-First Decentralized Exchange on Aleo

## What it does

PrivaDEX is a fully shielded DEX built on Aleo. Users swap tokens, provide liquidity, and trade through dark pools — all while keeping trade size, price, and identity completely private using zero-knowledge proofs.

It supports four tokens (ALEO, USDCx, BTCx, ETHx) across six AMM pools, an epoch-based dark pool, and a limit order book. Every transaction executes as a shielded Aleo program transition — no trade data is ever exposed on-chain. A blind router automatically selects the best execution venue, and users manage both private and public balances through Shield Wallet.

## The problem it solves

On traditional DEXs, every swap is publicly visible. Front-running bots extract value from pending transactions (MEV), large trades reveal portfolio strategies, and wallet activity links to real identities.

PrivaDEX eliminates this using Aleo's ZK proof system. Trade inputs/outputs are private records — the blockchain verifies correctness without revealing data. Pool reserves remain public for price discovery, but individual positions and trade amounts stay fully shielded.

The dark pool adds another layer: orders batch into epochs, settle at a single clearing price, and are claimed individually — making front-running impossible.

## Challenges I ran into

**Leo language constraints.** Leo evaluates both ternary branches at the circuit level, causing unsigned integer underflows that only appear on-chain. We redesigned share calculations to avoid subtraction entirely.

**Record management.** Aleo's UTXO model means tokens are private records that get consumed and recreated. Shield Wallet sometimes returns empty results mid-transaction. We built a 4-layer fallback (React context, direct window.shield, shared cache, Provable Record Scanner).

**Reserve snapshot verification.** AMM contracts require reserve snapshots verified against live state in finalize. The frontend must fetch fresh reserves immediately before execution and handle rejection when reserves shift between proof generation and confirmation.

**Cross-program deployment.** The router calls across three AMM programs. SnarkOS fails to deploy it due to a cross-program simulation bug — direct AMM swaps work, but atomic multi-hop routing awaits a fix.

## Technologies I used

- **Aleo / Leo** — ZK blockchain and smart contract language
- **React 18 + TypeScript** — Frontend framework
- **Vite 6** — Build tool with WASM support
- **Tailwind CSS 4** — Styling
- **@provablehq/sdk + Shield Wallet** — Aleo SDK and wallet adapter
- **Recharts** — Analytics charts
- **Motion (Framer Motion)** — Animations
- **CoinGecko API** — Real-time price feeds
- **Vercel** — Deployment

## How we built it

We started with Leo AMM contracts implementing constant-product (x*y=k) pools with private token records and MerkleProof compliance. Six specialized AMM programs handle different token types (credits, registry tokens, USDCx with freeze-list proofs).

The frontend connects via Shield Wallet with robust record discovery. The swap flow evaluates venues through a blind router, prepares input records, fetches live reserve snapshots, and submits with ZK proof generation. For liquidity, a 3-phase flow handles record preparation, reserve refresh with slippage protection, and snapshot-verified execution. LP positions are private on-chain records.

Volume tracking uses reserve delta detection — monitoring public reserve changes captures all users' swaps without indexer infrastructure.

## What we learned

Privacy and DeFi have fundamentally different constraints. Simple patterns like reading a balance become complex when balances are encrypted records. Leo's circuit evaluation means every branch executes and every division must be guarded — local testing is insufficient since on-chain behavior differs in the finalize step.

Record management is the hardest UX challenge. Users don't understand why they need to "prepare" tokens or why transactions fail from already-spent records. Abstracting this complexity while maintaining correctness required significant effort.

## What's next for PrivaDEX

- **Multi-pair dark pool and order book** — Expand beyond ALEO/USDCx to all pairs
- **Atomic multi-hop router** — Deploy when snarkOS fixes cross-program simulation
- **Oracle integration** — On-chain price feeds for market-aligned pool ratios
- **LP fee distribution** — Track and distribute swap fees to providers
- **Mainnet deployment** — Migrate to Aleo mainnet when production-ready
