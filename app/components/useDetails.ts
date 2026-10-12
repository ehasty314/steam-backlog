"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Details } from "@/lib/steam";

const CACHE_KEY = "backlog.details.v1";
const TTL = 7 * 24 * 60 * 60 * 1000;
type Cached = Details & { at: number };

// Loads store details only for games that are actually on screen, batching requests
// and caching them in the browser for a week to stay under Steam's rate limit.
export function useDetails() {
  const [details, setDetails] = useState<Record<number, Cached>>({});
  const queued = useRef(new Set<number>());
  const requested = useRef(new Set<number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const cached: Record<number, Cached> = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
      const fresh = Object.fromEntries(Object.entries(cached).filter(([, d]) => Date.now() - d.at < TTL));
      for (const id of Object.keys(fresh)) requested.current.add(Number(id));
      setDetails(fresh);
    } catch {}
  }, []);

  const flush = useCallback(async () => {
    timer.current = null;
    const ids = [...queued.current].slice(0, 20);
    ids.forEach((id) => queued.current.delete(id));
    if (queued.current.size) timer.current = setTimeout(flush, 1500);
    if (!ids.length) return;
    try {
      const res = await fetch(`/api/details?appids=${ids.join(",")}`);
      const data: { details: Record<number, Details> } = await res.json();
      const at = Date.now();
      setDetails((prev) => {
        const next = { ...prev };
        for (const [id, d] of Object.entries(data.details)) next[Number(id)] = { ...d, at };
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
      // Anything Steam didn't answer can be asked for again when it scrolls back into view.
      ids.filter((id) => !(id in data.details)).forEach((id) => requested.current.delete(id));
    } catch {
      ids.forEach((id) => requested.current.delete(id));
    }
  }, []);

  const want = useCallback((appids: number[]) => {
    for (const id of appids) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      queued.current.add(id);
    }
    if (queued.current.size && !timer.current) timer.current = setTimeout(flush, 150);
  }, [flush]);

  return { details, want };
}
