"use client";

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "whale-tracker-watchlist";

export function useWatchlist() {
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setWatchlist(new Set(JSON.parse(stored)));
      }
    } catch {}
  }, []);

  // Persist to localStorage
  const persist = useCallback((newSet: Set<string>) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...newSet]));
    } catch {}
  }, []);

  const addAddress = useCallback(
    (addr: string) => {
      const normalized = addr.toLowerCase();
      setWatchlist((prev) => {
        const next = new Set(prev);
        next.add(normalized);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const removeAddress = useCallback(
    (addr: string) => {
      const normalized = addr.toLowerCase();
      setWatchlist((prev) => {
        const next = new Set(prev);
        next.delete(normalized);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const isWatched = useCallback(
    (addr: string) => watchlist.has(addr.toLowerCase()),
    [watchlist]
  );

  return { watchlist, addAddress, removeAddress, isWatched };
}
