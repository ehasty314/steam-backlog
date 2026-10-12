"use client";

import { useEffect, useMemo, useState } from "react";
import type { Game } from "@/lib/steam";

type Status = "unplayed" | "playing" | "finished" | "dropped" | "backlog";
type Entry = { status?: Status; rating?: number; review?: string };
type Log = Record<number, Entry>;
type Filter = "all" | "never-played" | Status;

// Personal logs live in the browser for now; a database can replace this later.
const LOG_KEY = "backlog.log.v1";
const USER_KEY = "backlog.user.v1";

function loadLog(): Log {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) ?? "{}"); } catch { return {}; }
}

function hours(min: number) {
  return min === 0 ? "Never played" : `${(min / 60).toFixed(1)} h`;
}

export default function Library() {
  const [user, setUser] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [log, setLog] = useState<Log>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "playtime" | "recent">("playtime");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLog(loadLog());
    const saved = localStorage.getItem(USER_KEY);
    if (saved) { setUser(saved); fetchLibrary(saved); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchLibrary(u: string) {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/library?user=${encodeURIComponent(u)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGames(data.games);
      localStorage.setItem(USER_KEY, u);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function update(appid: number, patch: Entry) {
    const next = { ...log, [appid]: { ...log[appid], ...patch } };
    setLog(next);
    localStorage.setItem(LOG_KEY, JSON.stringify(next));
  }

  const statusOf = (g: Game): Status => log[g.appid]?.status ?? (g.playtimeMinutes === 0 ? "unplayed" : "backlog");

  const visible = useMemo(() => {
    const q = query.toLowerCase();
    return games
      .filter((g) => g.name.toLowerCase().includes(q))
      .filter((g) =>
        filter === "all" ? true
        : filter === "never-played" ? g.playtimeMinutes === 0
        : statusOf(g) === filter)
      .sort((a, b) =>
        sort === "name" ? a.name.localeCompare(b.name)
        : sort === "recent" ? (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0)
        : b.playtimeMinutes - a.playtimeMinutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, log, filter, query, sort]);

  const neverPlayed = games.filter((g) => g.playtimeMinutes === 0).length;
  const totalHours = Math.round(games.reduce((s, g) => s + g.playtimeMinutes, 0) / 60);

  return (
    <>
      <form className="row" onSubmit={(e) => { e.preventDefault(); fetchLibrary(user); }}>
        <input value={user} onChange={(e) => setUser(e.target.value)}
          placeholder="Steam profile URL, vanity name, or SteamID64" />
        <button disabled={!user || loading}>{loading ? "Loading…" : "Load library"}</button>
      </form>
      {error && <p className="error">{error}</p>}

      {games.length > 0 && (
        <>
          <div className="stats">
            <div><b>{games.length}</b> games</div>
            <div><b>{neverPlayed}</b> never played ({Math.round((neverPlayed / games.length) * 100)}%)</div>
            <div><b>{totalHours}</b> hours total</div>
          </div>
          <div className="row">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" />
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              <option value="all">All</option>
              <option value="never-played">Never played</option>
              <option value="backlog">Backlog</option>
              <option value="playing">Playing</option>
              <option value="finished">Finished</option>
              <option value="dropped">Dropped</option>
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="playtime">Most played</option>
              <option value="recent">Recently played</option>
              <option value="name">A to Z</option>
            </select>
          </div>

          <ul className="grid">
            {visible.map((g) => {
              const entry = log[g.appid] ?? {};
              return (
                <li key={g.appid} className="card">
                  <img src={g.headerUrl} alt="" loading="lazy" />
                  <div className="body">
                    <h3>{g.name}</h3>
                    <p className="meta">{hours(g.playtimeMinutes)}</p>
                    <select value={statusOf(g)} onChange={(e) => update(g.appid, { status: e.target.value as Status })}>
                      <option value="unplayed">Unplayed</option>
                      <option value="backlog">Backlog</option>
                      <option value="playing">Playing</option>
                      <option value="finished">Finished</option>
                      <option value="dropped">Dropped</option>
                    </select>
                    <div className="stars">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} type="button" className={n <= (entry.rating ?? 0) ? "on" : ""}
                          onClick={() => update(g.appid, { rating: entry.rating === n ? 0 : n })}
                          aria-label={`${n} stars`}>★</button>
                      ))}
                    </div>
                    <textarea placeholder="Notes or review" value={entry.review ?? ""}
                      onChange={(e) => update(g.appid, { review: e.target.value })} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
