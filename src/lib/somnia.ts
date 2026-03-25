import { defineChain } from "viem";

export const somniaTestnet = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: {
      http: ["https://dream-rpc.somnia.network/"],
      webSocket: ["wss://dream-rpc.somnia.network/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Shannon Explorer",
      url: "https://shannon-explorer.somnia.network",
    },
  },
  testnet: true,
});

export const WHALE_HANDLER_ADDRESS =
  (process.env.NEXT_PUBLIC_WHALE_HANDLER_ADDRESS as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

export const WHALE_SUMMARY_ADDRESS =
  (process.env.NEXT_PUBLIC_WHALE_SUMMARY_ADDRESS as `0x${string}`) ??
  "0x0000000000000000000000000000000000000000";

export const WHALE_HANDLER_ABI = [
  {
    type: "function",
    name: "getRecentTransfers",
    inputs: [{ name: "count", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "blockNumber", type: "uint64" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "transferCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "whaleThreshold",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "WhaleAlert",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "blockNumber", type: "uint64", indexed: false },
    ],
  },
] as const;

export const WHALE_SUMMARY_ABI = [
  {
    type: "function",
    name: "getRecentSummaries",
    inputs: [{ name: "count", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "totalVolume", type: "uint256" },
          { name: "transferCount", type: "uint256" },
          { name: "topWhaleAddress", type: "address" },
          { name: "topWhaleAmount", type: "uint256" },
          { name: "windowStartBlock", type: "uint64" },
          { name: "windowEndBlock", type: "uint64" },
          { name: "timestamp", type: "uint256" },
        ],
      },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getCurrentWindowStats",
    inputs: [],
    outputs: [
      { name: "volume", type: "uint256" },
      { name: "transferCount", type: "uint256" },
      { name: "topWhale", type: "address" },
      { name: "topAmount", type: "uint256" },
      { name: "windowStart", type: "uint64" },
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "summaryCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "SummaryUpdated",
    inputs: [
      { name: "summaryIndex", type: "uint256", indexed: true },
      { name: "totalVolume", type: "uint256", indexed: false },
      { name: "transferCount", type: "uint256", indexed: false },
      { name: "topWhaleAddress", type: "address", indexed: false },
      { name: "topWhaleAmount", type: "uint256", indexed: false },
      { name: "windowStartBlock", type: "uint64", indexed: false },
      { name: "windowEndBlock", type: "uint64", indexed: false },
    ],
  },
] as const;

// Standard ERC-20 ABI for token metadata resolution
export const ERC20_METADATA_ABI = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
  },
] as const;
