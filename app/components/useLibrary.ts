"use client";

import { useEffect, useState } from "react";
import type { Game } from "@/lib/steam";
import type { Log } from "@/lib/recommend";

// Shared with the library page: what you've logged lives in this browser.
export const LOG_KEY = "backlog.log.v1";
export const USER_KEY = "backlog.user.v1";

export function loadLog(): Log {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) ?? "{}"); } catch { return {}; }
}

// Loads the saved Steam profile's library for pages other than the main one.
export function useSavedLibrary() {
  const [games, setGames] = useState<Game[]>([]);
  const [tagNames, setTagNames] = useState<Record<number, string>>({});
  const [log, setLog] = useState<Log>({});
  const [state, setState] = useState<"loading" | "ready" | "no-user" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLog(loadLog());
    const user = localStorage.getItem(USER_KEY);
    if (!user) { setState("no-user"); return; }
    fetch(`/api/library?user=${encodeURIComponent(user)}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        setGames(data.games);
        setTagNames(data.tagNames ?? {});
        setState("ready");
      })
      .catch((e) => { setError(e.message); setState("error"); });
  }, []);

  return { games, tagNames, log, state, error };
}
