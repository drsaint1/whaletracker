# Somnia Whale Tracker

Real-time on-chain intelligence dashboard built with **Somnia Reactivity SDK** for the Somnia Reactivity Mini Hackathon.

## Deployed Contracts (Somnia Testnet)

| Contract | Address | Explorer |
|----------|---------|----------|
| **WhaleHandler** | `0x4a532A3C76DBd879c4a9BD4Cf169Af627D5b3c7f` | [View](https://shannon-explorer.somnia.network/address/0x4a532A3C76DBd879c4a9BD4Cf169Af627D5b3c7f) |
| **WhaleSummary** | `0x23A8525e50FbA0843737A37AA2AfaD500c95A748` | [View](https://shannon-explorer.somnia.network/address/0x23A8525e50FbA0843737A37AA2AfaD500c95A748) |

### WhaleHandler.sol
Extends `SomniaEventHandler`. Reactively receives all ERC-20 Transfer events chain-wide via `_onEvent`. Filters by whale threshold, stores qualifying transfers in a 100-slot ring buffer, and emits `WhaleAlert` for downstream consumption.

**Key functions:**
- `_onEvent(emitter, topics, data)` — Decodes Transfer, filters by threshold, stores + emits WhaleAlert
- `getRecentTransfers(count)` — Returns last N whale transfers from ring buffer
- `transferCount()` — Total whale transfers recorded (read atomically via `ethCalls`)
- `whaleThreshold()` — Current minimum amount to qualify

### WhaleSummary.sol
Subscribes to `WhaleAlert` events from WhaleHandler + `BlockTick` from the Reactivity Precompile (`0x0100`). Accumulates per-window stats and finalizes rolling summary snapshots.

**Key functions:**
- `_onEvent(emitter, topics, data)` — Routes WhaleAlert (accumulate) vs BlockTick (finalize)
- `getRecentSummaries(count)` — Returns last N finalized window summaries
- `getCurrentWindowStats()` — Returns live accumulator (volume, count, top whale, window start)
- `summaryCount()` — Total finalized windows

## How Reactivity Is Used

This project demonstrates **3 distinct Reactivity primitives** working together:

### 1. On-Chain Event Subscription (WhaleHandler)
The `WhaleHandler` contract extends `SomniaEventHandler` to reactively receive **all ERC-20 Transfer events** across the Somnia chain. When a transfer exceeds the whale threshold, it:
- Decodes the Transfer event (from, to, amount)
- Filters transfers below the threshold
- Stores qualifying whale transfers in an on-chain ring buffer (last 100)
- Emits a `WhaleAlert` event for downstream consumption

### 2. Reactive Contract Chaining (WhaleSummary)
The `WhaleSummary` contract subscribes to `WhaleAlert` events from `WhaleHandler`, demonstrating **reactive contract composition**:
- Accumulates volume, transfer count, and per-address stats in rolling windows
- Tracks the top whale address by volume per window
- Uses **BlockTick** subscriptions to periodically finalize summary snapshots
- Stores the last 20 summary windows on-chain

### 3. Off-Chain WebSocket Subscription + ethCalls (Frontend)
The Next.js dashboard uses `@somnia-chain/reactivity` SDK's `subscribe()` method:
- Subscribes to **ERC-20 Transfer events** chain-wide via `topicOverrides` with the Transfer topic hash
- Uses `ethCalls` to atomically read `WhaleHandler.transferCount()` with each event notification — the on-chain transfer count is bundled in `simulationResults` alongside the event data
- Auto-reconnects with exponential backoff (1s -> 2s -> 4s -> ... 30s max) on connection drop
- Classifies each event as Transfer, Swap, Mint, or Burn based on address analysis
- Token metadata (symbol, decimals) is resolved via RPC and cached for human-readable display

## Architecture

```
Any ERC-20 Transfer Event (chain-wide)
        |
        v
[Somnia Reactivity - On-Chain Subscription]
        |
        v
WhaleHandler.sol (_onEvent)
  - Decodes Transfer(from, to, amount)
  - Filters by whale threshold
  - Stores in ring buffer
  - Emits WhaleAlert
        |
        +---> [Reactivity - Event Subscription]
        |             |
        |             v
        |     WhaleSummary.sol (_onEvent)
        |       - Accumulates per-window stats
        |       - Tracks top whale leaderboard
        |             |
        |     [Reactivity - BlockTick Subscription]
        |             |
        |             v
        |     Finalize window snapshot every N blocks
        |
        +---> [Reactivity - Off-Chain WebSocket]
                      |
                      v
              Next.js Dashboard
                - sdk.subscribe() with ethCalls + simulationResults
                - Event classification (Transfer/Swap/Mint/Burn)
                - Real-time TPS monitor
                - Auto-reconnect with exponential backoff
                - Volume & transaction charts
                - Top whales leaderboard
                - Wallet connect + watchlist
                - Browser notifications
```

## Features

- **Live Whale Feed** — Real-time stream of token transfers with slide-in animations and tier badges (Shrimp/Dolphin/Whale)
- **Event Classification** — Each event is categorized as Transfer, Swap, Mint, or Burn based on from/to address analysis (zero-address = mint/burn, contract-to-contract = swap)
- **Real-Time TPS Monitor** — Tracks current, average, and peak transactions per second with live block counter
- **ethCalls Integration** — Atomically reads `transferCount()` from WhaleHandler with each event via `simulationResults`
- **Auto-Reconnect** — Exponential backoff (1s -> 30s max) with live status indicator (LIVE / RECONNECTING / DOWN)
- **Volume Charts** — Canvas-rendered bar charts showing volume and transaction count per 5-minute window
- **Top Whales Leaderboard** — Ranked by transfer volume with medal indicators
- **Wallet Connect** — Connect MetaMask, auto-add to watchlist, auto-switch to Somnia testnet
- **Personal Watchlist** — Watch any address; watched transfers get highlighted with gold border + browser notifications
- **Token Metadata** — Resolves ERC-20 symbol/decimals; displays "1,000 USDC" instead of raw amounts
- **Responsive Design** — Dark theme, works on mobile and desktop

## Testnet Limitations

The on-chain reactivity callbacks (`_onEvent` in WhaleHandler/WhaleSummary) depend on the Somnia testnet reactivity infrastructure to trigger them. At the time of development:
- **On-chain subscriptions are registered** and funded, but the reactivity callback delivery may not fire consistently on the current testnet
- As a result, `WhaleHandler.transferCount()` may return `0` even when Transfer events are occurring — the contracts are deployed and correct, but the testnet infra hasn't triggered `_onEvent`
- The `ethCalls` feature still works correctly — `simulationResults` returns the current on-chain value, demonstrating the atomic read pattern
- The dashboard connects via Reactivity SDK (`somnia_watch`) with timeout-based fallback to standard WebSocket and HTTP polling

## Setup

### Prerequisites
- Node.js 18+
- A wallet with STT (Somnia testnet tokens)

### Install
```bash
npm install
```

### Configure
```bash
cp .env.example .env
# Edit .env and add your PRIVATE_KEY
```

### Deploy Contracts
```bash
npm run compile
npm run deploy
# Copy both addresses to .env
```

### Fund the Contracts
Send at least **32 STT to each contract** (WhaleHandler + WhaleSummary) for on-chain subscription fees.

### Create Reactivity Subscriptions
```bash
npm run subscribe
```
This creates 3 subscriptions:
1. WhaleHandler <- all ERC-20 Transfer events (wildcard)
2. WhaleSummary <- WhaleAlert events from WhaleHandler
3. WhaleSummary <- BlockTick for periodic snapshot finalization

### Run the Dashboard
```bash
npm run dev
# Open http://localhost:3000
```

## Tech Stack
- **Blockchain**: Somnia Testnet (Chain ID: 50312)
- **Reactivity SDK**: `@somnia-chain/reactivity` (off-chain WebSocket + ethCalls + on-chain subscriptions + BlockTick)
- **Reactivity Contracts**: `@somnia-chain/reactivity-contracts` (SomniaEventHandler base)
- **Frontend**: Next.js 14, React 18, TypeScript, Canvas charts
- **Smart Contracts**: Solidity 0.8.30, Hardhat
- **Chain Interaction**: viem

## Network Info
- RPC: `https://dream-rpc.somnia.network/`
- WebSocket: `wss://dream-rpc.somnia.network/ws`
- Explorer: `https://shannon-explorer.somnia.network/`
- Faucet: `https://testnet.somnia.network/`

## License
MIT
