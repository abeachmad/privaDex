# PrivaDEX — Wave Updates

## Updates in this Wave

**Live Demo:** https://priva-dex.vercel.app/

This is our first submission. PrivaDEX is a privacy-first decentralized exchange built entirely on Aleo. Unlike traditional DEXs where every trade is publicly visible, PrivaDEX uses zero-knowledge proofs to keep trade size, price, and wallet identity fully shielded. The protocol consists of 10 Leo smart contracts deployed on Aleo testnet covering three execution venues: a constant-product AMM (6 pool pairs), an epoch-based dark pool, and a shielded limit order book.

### What's built and working
- **Token Swap** across 6 pools (ALEO, USDCx, BTCx, ETHx) with blind routing that auto-selects the best venue. All swaps execute as shielded transitions with reserve snapshot verification.
- **Liquidity Pools** with add/remove liquidity, real on-chain LP position tracking, and auto-ratio calculation.
- **Dark Pool** (ALEO/USDCx) for anonymous epoch-based trading with batch settlement.
- **Order Book** (ALEO/USDCx) for private limit orders.
- **Faucet** for testnet token minting + bidirectional public/private balance conversion.
- **Wallet Panel** showing private vs public balance breakdown per token.
- **Analytics Dashboard** with live TVL, spot prices from reserves, and dark pool epoch state.
- **Privacy Shield** toggle to hide/reveal sensitive values across the UI.

### What's not yet complete
- Dark pool and order book only support ALEO/USDCx — other pairs require additional contracts.
- Atomic multi-hop router is written but cannot deploy due to a snarkOS cross-program simulation bug.
- No backend indexer — 24h volume relies on client-side reserve delta detection.
- LP fee distribution is not yet implemented.
- Only Shield Wallet is supported; no Leo Wallet or other adapters.

## 5th Wave Milestone

Expand dark pool and order book beyond ALEO/USDCx to support all token pairs. This requires new contract variants for each pair type (credits+registry, pure registry) with the same epoch-based settlement and limit order mechanics. Deploy atomic multi-hop router once snarkOS resolves cross-program deployment simulation. Implement LP fee tracking and distribution — calculate each provider's earned fees from cumulative on-chain metrics and display in the My Positions tab. Add on-chain price oracle integration to maintain pool ratios aligned with real market prices, reducing arbitrage gaps on initial liquidity deposits.

## 6th Wave Milestone

Prepare for Aleo mainnet migration. Audit all smart contracts for production security — verify overflow guards, record ownership checks, and finalize-step assertions. Implement wallet abstraction supporting Leo Wallet and other Aleo wallets beyond Shield. Build backend indexer for accurate protocol-wide 24h volume, TVL history, and trade analytics without relying on client-side localStorage. Add governance framework for pool parameter updates (fee tiers, supported tokens). Launch public testnet stress testing with community participants to validate throughput and UX under load before mainnet deployment.
