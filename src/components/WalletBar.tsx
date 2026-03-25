"use client";

import { useState } from "react";

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function WalletBar({
  address,
  isConnecting,
  onConnect,
  onDisconnect,
  watchlist,
  onAddWatch,
  onRemoveWatch,
}: {
  address: string | null;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  watchlist: Set<string>;
  onAddWatch: (addr: string) => void;
  onRemoveWatch: (addr: string) => void;
}) {
  const [watchInput, setWatchInput] = useState("");

  const handleAddWatch = () => {
    const addr = watchInput.trim();
    if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      onAddWatch(addr);
      setWatchInput("");
    }
  };

  return (
    <div className="wallet-bar">
      <div className="wallet-connect">
        {address ? (
          <div className="wallet-info">
            <span className="wallet-dot" />
            <span className="wallet-address">{shortenAddress(address)}</span>
            <button className="btn btn-sm" onClick={onDisconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={onConnect} disabled={isConnecting}>
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
        )}
      </div>

      <div className="watchlist-section">
        <div className="watchlist-input-row">
          <input
            type="text"
            placeholder="0x... address to watch"
            value={watchInput}
            onChange={(e) => setWatchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddWatch()}
            className="watch-input"
          />
          <button className="btn btn-sm" onClick={handleAddWatch}>
            Watch
          </button>
        </div>

        {watchlist.size > 0 && (
          <div className="watchlist-tags">
            {[...watchlist].map((addr) => (
              <span key={addr} className="watch-tag">
                {shortenAddress(addr)}
                <button className="watch-remove" onClick={() => onRemoveWatch(addr)}>
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
