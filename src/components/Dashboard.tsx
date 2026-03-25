"use client";

import { useMemo, useEffect } from "react";
import { useWhaleSubscription } from "@/lib/useWhaleSubscription";
import { useSummaryData } from "@/lib/useSummaryData";
import { useTps } from "@/lib/useTps";
import { useWallet } from "@/lib/useWallet";
import { useWatchlist } from "@/lib/useWatchlist";
import { WhaleCard } from "./WhaleCard";
import { VolumeChart } from "./VolumeChart";
import { Leaderboard } from "./Leaderboard";
import { WalletBar } from "./WalletBar";

export function Dashboard() {
  const { transfers, streamStatus, totalAlerts, connectionMethod } = useWhaleSubscription();
  const { summaries, currentWindow } = useSummaryData(transfers);
  const tps = useTps();
  const wallet = useWallet();
  const { watchlist, addAddress, removeAddress, isWatched } = useWatchlist();

  const connectionLabel = connectionMethod === "reactivity-sdk"
    ? "Reactivity SDK"
    : connectionMethod === "websocket"
    ? "WebSocket"
    : connectionMethod === "polling"
    ? "HTTP Polling"
    : "";

  const statusLabel =
    streamStatus === "live"
      ? `LIVE — ${connectionLabel}`
      : streamStatus === "reconnecting"
      ? "RECONNECTING..."
      : streamStatus === "down"
      ? "DOWN"
      : "CONNECTING...";

  const statusClass =
    streamStatus === "live"
      ? "connected"
      : streamStatus === "reconnecting"
      ? "reconnecting"
      : "disconnected";

  // Event type counts
  const eventCounts = useMemo(() => {
    const counts = { transfer: 0, mint: 0, burn: 0, swap: 0 };
    for (const t of transfers) {
      counts[t.eventType]++;
    }
    return counts;
  }, [transfers]);

  // Auto-add connected wallet to watchlist
  useEffect(() => {
    if (wallet.address) {
      addAddress(wallet.address);
    }
  }, [wallet.address, addAddress]);

  // Browser notifications for watched addresses
  useEffect(() => {
    if (transfers.length === 0) return;
    const latest = transfers[0];
    if (
      latest.id.startsWith("live-") &&
      (isWatched(latest.from) || isWatched(latest.to))
    ) {
      if (Notification.permission === "granted") {
        new Notification(`Whale Alert: ${latest.tokenSymbol}`, {
          body: `${Number(latest.amount).toLocaleString()} ${latest.tokenSymbol} moved`,
          icon: "/whale.png",
        });
      }
    }
  }, [transfers, isWatched]);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const volumeChartData = useMemo(() => {
    return summaries.map((s, i) => ({
      label: `W${i + 1}`,
      value: s.totalVolume,
    }));
  }, [summaries]);

  const txCountChartData = useMemo(() => {
    return summaries.map((s, i) => ({
      label: `W${i + 1}`,
      value: s.transferCount,
    }));
  }, [summaries]);

  const leaderboard = useMemo(() => {
    const volumeMap = new Map<string, { volume: number; count: number }>();

    for (const t of transfers) {
      const key = t.from.toLowerCase();
      const prev = volumeMap.get(key) ?? { volume: 0, count: 0 };
      volumeMap.set(key, {
        volume: prev.volume + Number(t.amount),
        count: prev.count + 1,
      });
    }

    return [...volumeMap.entries()]
      .sort((a, b) => b[1].volume - a[1].volume)
      .slice(0, 10)
      .map(([address, data]) => ({
        address,
        volume: data.volume.toString(),
        count: data.count,
      }));
  }, [transfers]);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Somnia Whale Tracker</h1>
        <p className="subtitle">
          Real-time on-chain intelligence powered by Somnia Reactivity SDK
        </p>
      </header>

      <WalletBar
        address={wallet.address}
        isConnecting={wallet.isConnecting}
        onConnect={wallet.connect}
        onDisconnect={wallet.disconnect}
        watchlist={watchlist}
        onAddWatch={addAddress}
        onRemoveWatch={removeAddress}
      />

      <div className="stats-bar">
        <div className="stat">
          <span className="stat-label">Stream</span>
          <span className={`stat-value ${statusClass}`}>
            {statusLabel}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">TPS</span>
          <span className="stat-value">{tps.current}</span>
          <span className="stat-sub">peak {tps.peak}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Block</span>
          <span className="stat-value">{tps.latestBlock ? `#${tps.latestBlock.toLocaleString()}` : "--"}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Alerts</span>
          <span className="stat-value">{totalAlerts}</span>
        </div>
      </div>

      <div className="event-counters">
        <span className="event-counter">
          <span className="event-dot event-dot-transfer" />Transfers {eventCounts.transfer}
        </span>
        <span className="event-counter">
          <span className="event-dot event-dot-swap" />Swaps {eventCounts.swap}
        </span>
        <span className="event-counter">
          <span className="event-dot event-dot-mint" />Mints {eventCounts.mint}
        </span>
        <span className="event-counter">
          <span className="event-dot event-dot-burn" />Burns {eventCounts.burn}
        </span>
        {currentWindow && (
          <span className="event-counter">
            Window Vol: {currentWindow.volume.toLocaleString()}
          </span>
        )}
      </div>

      <div className="charts-row">
        <VolumeChart data={volumeChartData} title="Volume by Window" />
        <VolumeChart data={txCountChartData} title="Transfers by Window" />
      </div>

      <div className="main-content">
        <div className="feed-column">
          <h3 className="section-title">Live Feed</h3>
          <div className="feed">
            {transfers.length === 0 ? (
              <div className="empty-state">
                <p>Waiting for whale transfers...</p>
                <p className="hint">
                  Large token transfers above the threshold will appear here in real-time.
                </p>
              </div>
            ) : (
              transfers.map((t) => (
                <WhaleCard
                  key={t.id}
                  transfer={t}
                  isWatched={isWatched(t.from) || isWatched(t.to)}
                />
              ))
            )}
          </div>
        </div>

        <div className="sidebar-column">
          <Leaderboard entries={leaderboard} watchlist={watchlist} />
        </div>
      </div>
    </div>
  );
}
