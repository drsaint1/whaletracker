"use client";

import { useEffect, useRef, useState } from "react";
import { createPublicClient, http } from "viem";
import { somniaTestnet } from "./somnia";

export interface TpsStats {
  current: number;
  average: number;
  peak: number;
  latestBlock: number;
}

export function useTps() {
  const [stats, setStats] = useState<TpsStats>({
    current: 0,
    average: 0,
    peak: 0,
    latestBlock: 0,
  });
  const didInit = useRef(false);
  const samplesRef = useRef<number[]>([]);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const client = createPublicClient({ chain: somniaTestnet, transport: http() });
    let prevBlock = 0n;
    let prevTimestamp = 0n;

    const poll = async () => {
      try {
        const block = await client.getBlock({ blockTag: "latest" });
        const blockNum = block.number;
        const txCount = block.transactions.length;
        const timestamp = block.timestamp;

        if (prevBlock > 0n && blockNum > prevBlock) {
          const timeDiff = Number(timestamp - prevTimestamp);
          const tps = timeDiff > 0 ? txCount / timeDiff : 0;

          samplesRef.current.push(tps);
          // Keep last 30 samples for average
          if (samplesRef.current.length > 30) samplesRef.current.shift();

          const avg =
            samplesRef.current.reduce((a, b) => a + b, 0) /
            samplesRef.current.length;

          setStats((prev) => ({
            current: Math.round(tps * 10) / 10,
            average: Math.round(avg * 10) / 10,
            peak: Math.round(Math.max(prev.peak, tps) * 10) / 10,
            latestBlock: Number(blockNum),
          }));
        }

        prevBlock = blockNum;
        prevTimestamp = timestamp;
      } catch {}
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  return stats;
}
