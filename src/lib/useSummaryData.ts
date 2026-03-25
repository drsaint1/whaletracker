"use client";

import { useMemo } from "react";
import type { WhaleTransfer } from "./useWhaleSubscription";

export interface WindowSummary {
  totalVolume: number;
  transferCount: number;
  topWhaleAddress: string;
  topWhaleAmount: number;
  windowStartBlock: number;
  windowEndBlock: number;
  timestamp: number;
}

export interface CurrentWindow {
  volume: number;
  transferCount: number;
  topWhale: string;
  topAmount: number;
  windowStart: number;
}

// Group transfers into time windows (5-minute buckets) for chart display
export function useSummaryData(transfers: WhaleTransfer[]) {
  const summaries = useMemo<WindowSummary[]>(() => {
    if (transfers.length === 0) return [];

    // Group by 5-minute windows
    const WINDOW_MS = 5 * 60 * 1000;
    const buckets = new Map<number, WhaleTransfer[]>();

    for (const t of transfers) {
      const windowKey = Math.floor(t.timestamp / WINDOW_MS) * WINDOW_MS;
      const bucket = buckets.get(windowKey) ?? [];
      bucket.push(t);
      buckets.set(windowKey, bucket);
    }

    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ts, txs]) => {
        const volumeMap = new Map<string, number>();
        let totalVolume = 0;
        for (const t of txs) {
          const amt = Number(t.amount);
          totalVolume += amt;
          const key = t.from.toLowerCase();
          volumeMap.set(key, (volumeMap.get(key) ?? 0) + amt);
        }

        let topWhale = "";
        let topAmount = 0;
        for (const [addr, vol] of volumeMap) {
          if (vol > topAmount) {
            topWhale = addr;
            topAmount = vol;
          }
        }

        const blocks = txs.map((t) => t.blockNumber).filter((b) => b > 0);

        return {
          totalVolume,
          transferCount: txs.length,
          topWhaleAddress: topWhale,
          topWhaleAmount: topAmount,
          windowStartBlock: blocks.length > 0 ? Math.min(...blocks) : 0,
          windowEndBlock: blocks.length > 0 ? Math.max(...blocks) : 0,
          timestamp: ts,
        };
      });
  }, [transfers]);

  const currentWindow = useMemo<CurrentWindow | null>(() => {
    if (transfers.length === 0) return null;

    let totalVolume = 0;
    const volumeMap = new Map<string, number>();

    for (const t of transfers) {
      const amt = Number(t.amount);
      totalVolume += amt;
      const key = t.from.toLowerCase();
      volumeMap.set(key, (volumeMap.get(key) ?? 0) + amt);
    }

    let topWhale = "";
    let topAmount = 0;
    for (const [addr, vol] of volumeMap) {
      if (vol > topAmount) {
        topWhale = addr;
        topAmount = vol;
      }
    }

    const blocks = transfers.map((t) => t.blockNumber).filter((b) => b > 0);

    return {
      volume: totalVolume,
      transferCount: transfers.length,
      topWhale,
      topAmount,
      windowStart: blocks.length > 0 ? Math.min(...blocks) : 0,
    };
  }, [transfers]);

  return { summaries, currentWindow };
}
