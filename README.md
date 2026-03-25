# Somnia Whale Tracker

Real-time on-chain intelligence dashboard built with **Somnia Reactivity SDK** for the Somnia Reactivity Mini Hackathon.

## Deployed Contracts (Somnia Testnet)

| Contract | Address | Explorer |
|----------|---------|----------|
| **WhaleHandler** | `0x4a532A3C76DBd879c4a9BD4Cf169Af627D5b3c7f` | [View](https://shannon-explorer.somnia.network/address/0x4a532A3C76DBd879c4a9BD4Cf169Af627D5b3c7f) |
| **WhaleSummary** | `0x23A8525e50FbA0843737A37AA2AfaD500c95A748` | [View](https://shannon-explorer.somnia.network/address/0x23A8525e50FbA0843737A37AA2AfaD500c95A748) |
| **WhaleStorm** | `0xD31BE65B510ad5636b3221fb69bbcC4d2F03BB7E` | [View](https://shannon-explorer.somnia.network/address/0xD31BE65B510ad5636b3221fb69bbcC4d2F03BB7E) |

### WhaleHandler.sol
Extends `SomniaEventHandler`. Reactively receives **all ERC-20 Transfer events** chain-wide via `_onEvent`. Filters by whale threshold, stores qualifying transfers in a 100-slot ring buffer, and emits `WhaleAlert` for downstream consumption.

### WhaleSummary.sol
Subscribes to **WhaleAlert** events from WhaleHandler + **BlockTick** from the Reactivity Precompile (`0x0100`). Accumulates per-window volume/count stats and finalizes rolling summary snapshots on each BlockTick.

### WhaleStorm.sol
Subscribes to **WhaleAlert** events from WhaleHandler. Tracks rolling window volume and increments a `stormCount` when cumulative whale volume crosses a configurable threshold — demonstrating a **3-contract reactive pipeline** where one on-chain event triggers a chain of reactive contracts.

## How Reactivity Is Used

This project uses **5 distinct Reactivity SDK features** across 3 contracts and 2 frontend subscriptions:

### On-Chain Reactivity (3 contracts)
1. **Event Subscription** — WhaleHandler subscribes to all ERC-20 Transfer events chain-wide
2. **Reactive Contract Chaining** — WhaleSummary subscribes to WhaleAlert from WhaleHandler
3. **Reactive Contract Chaining** — WhaleStorm subscribes to WhaleAlert from WhaleHandler (parallel pipeline)
4. **BlockTick Subscription** — WhaleSummary uses BlockTick to periodically finalize summary windows

### Off-Chain Reactivity (Frontend)
5. **Dual WebSocket Subscriptions** via `sdk.subscribe()`:
   - **Subscription 1**: Transfer events chain-wide with `topicOverrides`, `ethCalls` (reads `WhaleHandler.transferCount()` atomically), and `onlyPushChanges: true` for dedup optimization
   - **Subscription 2**: WhaleAlert events from WhaleHandler using `eventContractSources` filter, with `ethCalls` reading `WhaleStorm.stormCount()` atomically

### SDK Features Demonstrated
| Feature | Where Used |
|---------|-----------|
| `topicOverrides` | Sub 1 — filter for Transfer topic |
| `ethCalls` + `simulationResults` | Sub 1 — read transferCount; Sub 2 — read stormCount |
| `eventContractSources` | Sub 2 — filter events from WhaleHandler only |
| `onlyPushChanges` | Sub 1 — skip duplicate notifications |
| `createSoliditySubscription` | Deploy scripts — register on-chain handlers |
| `createOnchainBlockTickSubscription` | Deploy scripts — WhaleSummary periodic finalization |

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
        +---> [Reactivity - Event Subscription]
        |             |
        |             v
        |     WhaleStorm.sol (_onEvent)
        |       - Accumulates window volume
        |       - Detects volume spikes (storms)
        |       - Emits StormDetected
        |
        +---> [Reactivity - Off-Chain WebSocket]
                      |
                      v
              Next.js Dashboard
                - Sub 1: Transfer + ethCalls(transferCount) + onlyPushChanges
                - Sub 2: WhaleAlert + eventContractSources + ethCalls(stormCount)
                - Event classification (Transfer/Swap/Mint/Burn)
                - Real-time TPS monitor
                - Auto-reconnect with exponential backoff
                - Volume & transaction charts
                - Top whales leaderboard
                - Wallet connect + watchlist
                - Browser notifications
```

## Features

- **3-Contract Reactive Pipeline** — WhaleHandler -> WhaleSummary + WhaleStorm, all triggered by on-chain events
- **Dual SDK Subscriptions** — Two concurrent `sdk.subscribe()` calls with different filters and ethCalls
- **Event Classification** — Transfer, Swap, Mint, or Burn detection via address analysis
- **Storm Detection** — WhaleStorm contract tracks volume spikes; dashboard reads stormCount via ethCalls
- **Real-Time TPS Monitor** — Current, average, and peak TPS with live block counter
- **ethCalls + simulationResults** — Atomic on-chain reads bundled with event notifications
- **onlyPushChanges** — SDK dedup optimization to skip redundant notifications
- **Auto-Reconnect** — Exponential backoff (1s -> 30s max) with status indicator (LIVE / RECONNECTING / DOWN)
- **Live Whale Feed** — Real-time stream with tier badges (Shrimp/Dolphin/Whale) and slide-in animations
- **Volume Charts** — Canvas-rendered bar charts per 5-minute window
- **Top Whales Leaderboard** — Ranked by transfer volume with medal indicators
- **Wallet Connect** — MetaMask integration with auto-switch to Somnia testnet
- **Personal Watchlist** — Watch addresses with gold border highlights + browser notifications
- **Token Metadata** — Resolves ERC-20 symbol/decimals for human-readable display

## Testnet Limitations

The on-chain reactivity callbacks (`_onEvent`) depend on the Somnia testnet infrastructure to trigger them:
- **On-chain subscriptions are registered** and funded, but callback delivery may not fire consistently on the current testnet
- `WhaleHandler.transferCount()` and `WhaleStorm.stormCount()` may return `0` — contracts are deployed and correct, but awaiting infra activation
- The `ethCalls` feature works correctly regardless — `simulationResults` returns current on-chain values, demonstrating the atomic read pattern
- The dashboard connects via Reactivity SDK with timeout-based fallback to standard WebSocket and HTTP polling

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
npm run deploy          # deploys WhaleHandler + WhaleSummary + WhaleStorm
# Copy all 3 addresses to .env
```

### Fund the Contracts
Send at least **32 STT to each contract** (WhaleHandler + WhaleSummary + WhaleStorm) for on-chain subscription fees.

### Create Reactivity Subscriptions
```bash
npm run subscribe        # WhaleHandler + WhaleSummary subscriptions
npm run subscribe-storm  # WhaleStorm subscription
```
This creates 4 subscriptions:
1. WhaleHandler <- all ERC-20 Transfer events (wildcard)
2. WhaleSummary <- WhaleAlert events from WhaleHandler
3. WhaleSummary <- BlockTick for periodic snapshot finalization
4. WhaleStorm <- WhaleAlert events from WhaleHandler

### Run the Dashboard
```bash
npm run dev
# Open http://localhost:3000
```

## Tech Stack
- **Blockchain**: Somnia Testnet (Chain ID: 50312)
- **Reactivity SDK**: `@somnia-chain/reactivity` — `subscribe()` with ethCalls, eventContractSources, onlyPushChanges; `createSoliditySubscription`; `createOnchainBlockTickSubscription`
- **Reactivity Contracts**: `@somnia-chain/reactivity-contracts` (SomniaEventHandler base)
- **Frontend**: Next.js 14, React 18, TypeScript, Canvas charts
- **Smart Contracts**: Solidity 0.8.30, Hardhat (3 contracts)
- **Chain Interaction**: viem

## Network Info
- RPC: `https://dream-rpc.somnia.network/`
- WebSocket: `wss://dream-rpc.somnia.network/ws`
- Explorer: `https://shannon-explorer.somnia.network/`
- Faucet: `https://testnet.somnia.network/`

## License
MIT
