"use client";

import { WhaleTransfer, type EventType } from "@/lib/useWhaleSubscription";

function shortenAddress(addr: string) {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function timeAgo(timestampMs: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestampMs) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export type TransferTier = "shrimp" | "dolphin" | "whale";

export function getTier(amount: number): TransferTier {
  if (amount >= 1000) return "whale";
  if (amount >= 100) return "dolphin";
  return "shrimp";
}

const tierConfig: Record<TransferTier, { icon: string; label: string }> = {
  shrimp: { icon: "🦐", label: "Shrimp" },
  dolphin: { icon: "🐬", label: "Dolphin" },
  whale: { icon: "🐋", label: "Whale" },
};

const eventTypeConfig: Record<EventType, { label: string; className: string }> = {
  transfer: { label: "Transfer", className: "event-type-transfer" },
  mint: { label: "Mint", className: "event-type-mint" },
  burn: { label: "Burn", className: "event-type-burn" },
  swap: { label: "Swap", className: "event-type-swap" },
};

export function WhaleCard({
  transfer,
  isWatched,
}: {
  transfer: WhaleTransfer;
  isWatched: boolean;
}) {
  const explorerBase = "https://shannon-explorer.somnia.network";
  const tier = getTier(Number(transfer.amount));
  const { icon, label } = tierConfig[tier];
  const eventType = eventTypeConfig[transfer.eventType];

  return (
    <div className={`whale-card tier-${tier} ${isWatched ? "whale-card-watched" : ""}`}>
      {isWatched && <div className="watched-indicator">WATCHED</div>}
      <div className="whale-card-header">
        <span className="whale-icon">{icon}</span>
        <span className="whale-amount">
          {Number(transfer.amount).toLocaleString()} {transfer.tokenSymbol}
        </span>
        <span className={`tier-badge tier-badge-${tier}`}>{label}</span>
        <span className={`event-type-badge ${eventType.className}`}>{eventType.label}</span>
        <span className="whale-time">{timeAgo(transfer.timestamp)}</span>
      </div>
      <div className="whale-card-body">
        <div className="whale-addresses">
          <a
            href={`${explorerBase}/address/${transfer.from}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {shortenAddress(transfer.from)}
          </a>
          <span className="arrow">&rarr;</span>
          <a
            href={`${explorerBase}/address/${transfer.to}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {shortenAddress(transfer.to)}
          </a>
        </div>
        <div className="whale-meta">
          Token:{" "}
          <a
            href={`${explorerBase}/address/${transfer.token}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {transfer.tokenSymbol} ({shortenAddress(transfer.token)})
          </a>{" "}
          {transfer.blockNumber > 0 && `| Block #${transfer.blockNumber}`}
        </div>
      </div>
    </div>
  );
}
