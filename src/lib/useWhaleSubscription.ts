"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  createPublicClient,
  http,
  webSocket,
  formatUnits,
  parseEther,
  keccak256,
  toBytes,
  parseAbiItem,
  encodeFunctionData,
  decodeFunctionResult,
  type Hex,
  type Log,
} from "viem";
import { SDK, type WebsocketSubscriptionInitParams } from "@somnia-chain/reactivity";
import { somniaTestnet, ERC20_METADATA_ABI, WHALE_HANDLER_ADDRESS, WHALE_HANDLER_ABI, WHALE_STORM_ADDRESS, WHALE_STORM_ABI } from "./somnia";

export type EventType = "transfer" | "mint" | "burn" | "swap";

export interface WhaleTransfer {
  token: string;
  tokenSymbol: string;
  tokenDecimals: number;
  from: string;
  to: string;
  amount: string;
  blockNumber: number;
  timestamp: number;
  id: string;
  eventType: EventType;
}

const TRANSFER_TOPIC = keccak256(toBytes("Transfer(address,address,uint256)"));
const WHALE_ALERT_TOPIC = keccak256(toBytes("WhaleAlert(address,address,address,uint256,uint64)"));
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
// Minimum threshold — filter out zero-amount mints/burns, show real transfers
const WHALE_THRESHOLD = 1n;

const tokenCache = new Map<string, { symbol: string; decimals: number }>();
const blockTimestampCache = new Map<number, number>();
const contractCache = new Map<string, boolean>(); // address -> isContract

async function isContract(address: string): Promise<boolean> {
  const key = address.toLowerCase();
  if (contractCache.has(key)) return contractCache.get(key)!;
  try {
    const client = getHttpClient();
    const code = await client.getCode({ address: address as `0x${string}` });
    const result = !!code && code !== "0x";
    contractCache.set(key, result);
    return result;
  } catch {
    return false;
  }
}

function classifyEventType(from: string, to: string): EventType {
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();
  if (fromLower === ZERO_ADDRESS) return "mint";
  if (toLower === ZERO_ADDRESS) return "burn";
  return "transfer"; // will be upgraded to "swap" async if both are contracts
}

function getHttpClient() {
  return createPublicClient({ chain: somniaTestnet, transport: http() });
}

async function resolveTokenMeta(
  tokenAddress: string
): Promise<{ symbol: string; decimals: number }> {
  const key = tokenAddress.toLowerCase();
  if (tokenCache.has(key)) return tokenCache.get(key)!;
  try {
    const client = getHttpClient();
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: tokenAddress as `0x${string}`, abi: ERC20_METADATA_ABI, functionName: "symbol" }).catch(() => "ERC20"),
      client.readContract({ address: tokenAddress as `0x${string}`, abi: ERC20_METADATA_ABI, functionName: "decimals" }).catch(() => 18),
    ]);
    const meta = { symbol: symbol as string, decimals: Number(decimals) };
    tokenCache.set(key, meta);
    return meta;
  } catch {
    const fallback = { symbol: "ERC20", decimals: 18 };
    tokenCache.set(key, fallback);
    return fallback;
  }
}

async function getBlockTimestamp(blockNumber: number): Promise<number> {
  if (blockTimestampCache.has(blockNumber)) return blockTimestampCache.get(blockNumber)!;
  try {
    const client = getHttpClient();
    const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
    const ts = Number(block.timestamp) * 1000;
    blockTimestampCache.set(blockNumber, ts);
    return ts;
  } catch {
    return Date.now();
  }
}

let latestBlockCache = 0;
let latestBlockCacheTime = 0;

async function getLatestBlockNumber(): Promise<number> {
  if (Date.now() - latestBlockCacheTime < 5000 && latestBlockCache > 0) return latestBlockCache;
  try {
    const client = getHttpClient();
    latestBlockCache = Number(await client.getBlockNumber());
    latestBlockCacheTime = Date.now();
  } catch {}
  return latestBlockCache;
}

async function logToTransfer(
  log: { address: string; topics: Hex[]; data: Hex; blockNumber?: bigint | number },
  idPrefix: string
): Promise<WhaleTransfer | null> {
  const topics = log.topics;
  if (!topics || topics.length < 3 || topics[0] !== TRANSFER_TOPIC) return null;

  const from = `0x${topics[1].slice(26)}`;
  const to = `0x${topics[2].slice(26)}`;

  let amount = 0n;
  try {
    if (log.data && log.data !== "0x") amount = BigInt(log.data.slice(0, 66));
  } catch { return null; }

  if (amount < WHALE_THRESHOLD) return null;

  let blockNumber = typeof log.blockNumber === "bigint" ? Number(log.blockNumber) : Number(log.blockNumber ?? 0);
  // If blockNumber is missing (somnia_watch doesn't include it), use latest known block
  if (blockNumber === 0) blockNumber = await getLatestBlockNumber();
  const meta = await resolveTokenMeta(log.address);
  const timestamp = blockNumber > 0 ? await getBlockTimestamp(blockNumber) : Date.now();

  // Classify event type
  let eventType = classifyEventType(from, to);
  // Async swap detection: if both from and to are contracts, likely a DEX swap
  if (eventType === "transfer") {
    try {
      const [fromIsContract, toIsContract] = await Promise.all([
        isContract(from),
        isContract(to),
      ]);
      if (fromIsContract && toIsContract) eventType = "swap";
    } catch {}
  }

  return {
    token: log.address,
    tokenSymbol: meta.symbol,
    tokenDecimals: meta.decimals,
    from, to,
    amount: formatUnits(amount, meta.decimals),
    blockNumber,
    timestamp,
    id: `${idPrefix}-${blockNumber}-${Math.random().toString(36).slice(2)}`,
    eventType,
  };
}

export type ConnectionMethod = "reactivity-sdk" | "websocket" | "polling" | null;
export type StreamStatus = "connecting" | "live" | "reconnecting" | "down";

const MAX_BACKOFF = 30000;

export function useWhaleSubscription() {
  const [transfers, setTransfers] = useState<WhaleTransfer[]>([]);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [connectionMethod, setConnectionMethod] = useState<ConnectionMethod>(null);
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
  const [stormCount, setStormCount] = useState(0);
  const [whaleAlertCount, setWhaleAlertCount] = useState(0);
  const cleanupRef = useRef<(() => void) | null>(null);
  const cleanupRef2 = useRef<(() => void) | null>(null);
  const didInit = useRef(false);
  const backoffRef = useRef(1000);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const addTransfer = useCallback((transfer: WhaleTransfer) => {
    setTransfers((prev) => {
      if (prev.some((t) => t.blockNumber === transfer.blockNumber && t.token === transfer.token && t.from === transfer.from && t.to === transfer.to)) {
        return prev;
      }
      return [transfer, ...prev].slice(0, 50);
    });
    setTotalAlerts((prev) => prev + 1);
  }, []);

  const loadRecent = useCallback(async () => {
    const client = getHttpClient();
    try {
      const latestBlock = await client.getBlockNumber();
      const fromBlock = latestBlock - 500n > 0n ? latestBlock - 500n : 0n;
      console.log(`[WhaleTracker] Scanning blocks ${fromBlock.toString()} - ${latestBlock.toString()}...`);
      const logs = await (client as any).getLogs({
        event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
        fromBlock,
        toBlock: latestBlock,
      });
      console.log(`[WhaleTracker] Found ${(logs as any[]).length} Transfer events in recent blocks`);

      const results: WhaleTransfer[] = [];
      for (const log of (logs as Log[]).slice(-50)) {
        const transfer = await logToTransfer(
          { address: log.address, topics: log.topics as Hex[], data: log.data, blockNumber: log.blockNumber ?? 0n },
          "hist"
        );
        if (transfer) results.push(transfer);
      }

      if (results.length > 0) {
        results.sort((a, b) => b.blockNumber - a.blockNumber);
        setTransfers(results);
        setTotalAlerts(results.length);
      }
    } catch { /* ignore */ }
  }, []);

  const connectRef = useRef<() => Promise<void>>();

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    const delay = backoffRef.current;
    backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
    console.log(`[WhaleTracker] Reconnecting in ${delay}ms...`);
    setStreamStatus("reconnecting");
    reconnectTimerRef.current = setTimeout(() => {
      if (mountedRef.current) connectRef.current?.();
    }, delay);
  }, []);

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;

    // Clean up previous connection
    cleanupRef.current?.();
    cleanupRef.current = null;

    // Helper: race a promise against a timeout
    function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
      return Promise.race([
        promise,
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
      ]);
    }

    // Strategy 1: Somnia Reactivity SDK (somnia_watch) — 8s timeout
    try {
      const wsClient = createPublicClient({ chain: somniaTestnet, transport: webSocket() });
      const sdk = new SDK({ public: wsClient });

      const transferCountCalldata = encodeFunctionData({
        abi: WHALE_HANDLER_ABI,
        functionName: "transferCount",
      });

      // Subscription 1: Transfer events chain-wide with ethCalls (transferCount) + onlyPushChanges
      const result = await withTimeout(sdk.subscribe({
        ethCalls: [
          {
            to: WHALE_HANDLER_ADDRESS,
            data: transferCountCalldata,
          },
        ],
        topicOverrides: [TRANSFER_TOPIC],
        onlyPushChanges: true,
        onData: async (message: any) => {
          console.log("[WhaleTracker] somnia_watch Transfer event received");
          const r = message?.params?.result ?? message?.result ?? message;

          const simResults = r?.simulationResults ?? [];
          if (simResults.length > 0) {
            try {
              const count = decodeFunctionResult({
                abi: WHALE_HANDLER_ABI,
                functionName: "transferCount",
                data: simResults[0],
              });
              console.log("[WhaleTracker] ethCalls transferCount:", count.toString());
            } catch (e) {
              console.warn("[WhaleTracker] Could not decode transferCount:", e);
            }
          }

          const transfer = await logToTransfer(
            { address: r?.address ?? r?.emitter ?? "0x0", topics: r?.topics, data: r?.data, blockNumber: r?.blockNumber ? BigInt(r.blockNumber) : 0n },
            "live"
          );
          if (transfer) addTransfer(transfer);
        },
        onError: (err: Error) => {
          console.error("[WhaleTracker] somnia_watch error:", err.message);
          scheduleReconnect();
        },
      }), 8000);
      if (result instanceof Error) throw result;

      console.log("[WhaleTracker] Sub 1 connected: Transfer events + ethCalls + onlyPushChanges");

      // Subscription 2: WhaleAlert events from WhaleHandler with stormCount ethCalls
      try {
        const stormCountCalldata = encodeFunctionData({
          abi: WHALE_STORM_ABI,
          functionName: "stormCount",
        });

        const result2 = await withTimeout(sdk.subscribe({
          ethCalls: [
            {
              to: WHALE_STORM_ADDRESS,
              data: stormCountCalldata,
            },
          ],
          eventContractSources: [WHALE_HANDLER_ADDRESS],
          topicOverrides: [WHALE_ALERT_TOPIC],
          onData: (message: any) => {
            console.log("[WhaleTracker] WhaleAlert event received from WhaleHandler");
            setWhaleAlertCount((prev) => prev + 1);

            const r = message?.params?.result ?? message?.result ?? message;
            const simResults = r?.simulationResults ?? [];
            if (simResults.length > 0) {
              try {
                const count = decodeFunctionResult({
                  abi: WHALE_STORM_ABI,
                  functionName: "stormCount",
                  data: simResults[0],
                });
                console.log("[WhaleTracker] WhaleStorm stormCount:", count.toString());
                setStormCount(Number(count));
              } catch (e) {
                console.warn("[WhaleTracker] Could not decode stormCount:", e);
              }
            }
          },
          onError: (err: Error) => {
            console.warn("[WhaleTracker] WhaleAlert sub error:", err.message);
          },
        }), 8000);

        if (!(result2 instanceof Error)) {
          console.log("[WhaleTracker] Sub 2 connected: WhaleAlert + eventContractSources + stormCount ethCalls");
          cleanupRef2.current = () => result2.unsubscribe?.();
        }
      } catch (e) {
        console.warn("[WhaleTracker] WhaleAlert subscription failed (non-critical):", e);
      }

      backoffRef.current = 1000;
      setStreamStatus("live");
      setConnectionMethod("reactivity-sdk");
      cleanupRef.current = () => result.unsubscribe?.();
      return;
    } catch (e) {
      console.warn("[WhaleTracker] Reactivity SDK failed, trying fallback:", e);
    }

    // Strategy 2: Standard viem WebSocket — 6s timeout
    try {
      const wsClient = await withTimeout(
        Promise.resolve(createPublicClient({ chain: somniaTestnet, transport: webSocket() })),
        6000
      );
      const unwatch = (wsClient as any).watchEvent({
        event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
        onLogs: async (logs: Log[]) => {
          for (const log of logs) {
            const transfer = await logToTransfer(
              { address: log.address, topics: log.topics as Hex[], data: log.data, blockNumber: log.blockNumber ?? 0n },
              "live"
            );
            if (transfer) addTransfer(transfer);
          }
        },
        onError: () => {
          scheduleReconnect();
        },
      });
      console.log("[WhaleTracker] Connected via standard WebSocket (eth_subscribe)");
      backoffRef.current = 1000;
      setStreamStatus("live");
      setConnectionMethod("websocket");
      cleanupRef.current = unwatch;
      return;
    } catch (e) {
      console.warn("[WhaleTracker] WebSocket failed, trying polling:", e);
    }

    // Strategy 3: HTTP polling fallback (always works if loadRecent worked)
    console.log("[WhaleTracker] Starting HTTP polling fallback...");
    const httpClient = getHttpClient();
    let lastBlock = 0n;
    try {
      lastBlock = await httpClient.getBlockNumber();
    } catch { /* will retry in poll */ }

    let failCount = 0;
    const pollInterval = setInterval(async () => {
      try {
        const currentBlock = await httpClient.getBlockNumber();
        if (lastBlock === 0n) { lastBlock = currentBlock; return; }
        if (currentBlock <= lastBlock) return;
        const logs = await (httpClient as any).getLogs({
          event: parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)"),
          fromBlock: lastBlock + 1n,
          toBlock: currentBlock,
        });
        for (const log of logs as Log[]) {
          const transfer = await logToTransfer(
            { address: log.address, topics: log.topics as Hex[], data: log.data, blockNumber: log.blockNumber ?? 0n },
            "live"
          );
          if (transfer) addTransfer(transfer);
        }
        lastBlock = currentBlock;
        failCount = 0;
      } catch {
        failCount++;
        if (failCount >= 5) {
          clearInterval(pollInterval);
          scheduleReconnect();
        }
      }
    }, 2000);
    console.log("[WhaleTracker] Connected via HTTP polling fallback");
    backoffRef.current = 1000;
    setStreamStatus("live");
    setConnectionMethod("polling");
    cleanupRef.current = () => clearInterval(pollInterval);
  }, [addTransfer, scheduleReconnect]);

  connectRef.current = connect;

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    mountedRef.current = true;
    loadRecent();
    connect();
    return () => {
      mountedRef.current = false;
      cleanupRef.current?.();
      cleanupRef2.current?.();
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [loadRecent, connect]);

  return { transfers, streamStatus, totalAlerts, connectionMethod, stormCount, whaleAlertCount };
}
