"use client";

import { useEffect, useMemo, useState } from "react";
import type { Game, TimeToBeat } from "@/lib/steam";
import Metacritic from "./Metacritic";
import Seen from "./Seen";
import { useDetails } from "./useDetails";
import { LOG_KEY, USER_KEY, loadLog } from "./useLibrary";
import { recommend, type Entry, type Log, type Status } from "@/lib/recommend";

type Filter = "all" | "never-played" | Status;


function beat(t: TimeToBeat | null) {
  if (!t) return null;
  const parts = [
    t.main && `${t.main}h main`,
    t.extras && `${t.extras}h +extras`,
    t.completionist && `${t.completionist}h 100%`,
  ].filter(Boolean);
  return parts.length ? <span title="Time to beat (IGDB)">⏱ {parts.join(" · ")}</span> : null;
}

function hours(min: number) {
  return min === 0 ? "Never played" : `${(min / 60).toFixed(1)} h`;
}

export default function Library() {
  const [user, setUser] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [tagNames, setTagNames] = useState<Record<number, string>>({});
  const [log, setLog] = useState<Log>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"name" | "playtime" | "recent" | "shortest">("playtime");
  const { details, want } = useDetails();
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
      setTagNames(data.tagNames ?? {});
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
        : sort === "shortest" ? (a.timeToBeat?.main ?? a.timeToBeat?.extras ?? Infinity) - (b.timeToBeat?.main ?? b.timeToBeat?.extras ?? Infinity)
        : b.playtimeMinutes - a.playtimeMinutes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, log, filter, query, sort]);

  const picks = useMemo(() => recommend(games, log), [games, log]);
  const hasTags = games.some((g) => g.tags?.length);
  const hasTimes = games.some((g) => g.timeToBeat);
  useEffect(() => { want(picks.map((p) => p.game.appid)); }, [picks, want]);

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
          <section className="picks">
            <h2>Picks for you</h2>
            <p className="sub">Unplayed games that match what you've rated highest and played most. Low ratings steer picks away from similar games, and ★ is your predicted rating.</p>
            {!hasTags ? (
              <p className="meta">Steam didn't return tags for your games, so there's nothing to match on yet.</p>
            ) : picks.length === 0 ? (
              <p className="meta">Play or rate a few games and picks will show up here.</p>
            ) : (
              <ol className="pick-list">
                {picks.map((p) => (
                  <li key={p.game.appid} className="pick">
                    <img src={p.game.headerUrl} alt="" loading="lazy" />
                    <div className="body">
                      <div className="pick-head">
                        <h3>{p.game.name}</h3>
                        <span className="match">
                          {p.predicted !== null && <span className="predicted" title="Predicted from your ratings of similar games">★ {p.predicted.toFixed(1)} · </span>}
                          {Math.round(p.match * 100)}% match
                        </span>
                      </div>
                      <div className="chips">
                        {p.tags.map((id) => tagNames[id] && <span key={id} className="chip">{tagNames[id]}</span>)}
                      </div>
                      <div className="meta-row meta">
                        <Metacritic score={details[p.game.appid]?.metacritic} url={details[p.game.appid]?.metacriticUrl} />
                        {p.game.timeToBeat?.main && <span title="Time to beat, main story (IGDB)">⏱ {p.game.timeToBeat.main}h</span>}
                      </div>
                      {p.because.length > 0 && (
                        <p className="meta">Because you played {p.because.map((g) => g.name).join(" and ")}</p>
                      )}
                      <a href={`steam://run/${p.game.appid}`} className="play">Play on Steam</a>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

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
              {hasTimes && <option value="shortest">Shortest to beat</option>}
            </select>
          </div>

          <ul className="grid">
            {visible.map((g) => {
              const entry = log[g.appid] ?? {};
              return (
                <Seen key={g.appid} className="card" onSeen={() => want([g.appid])}>
                  <img src={g.headerUrl} alt="" loading="lazy" />
                  <div className="body">
                    <h3>{g.name}</h3>
                    <div className="meta-row meta">
                      <span>{hours(g.playtimeMinutes)}</span>
                      <Metacritic score={details[g.appid]?.metacritic} url={details[g.appid]?.metacriticUrl} />
                    </div>
                    {g.timeToBeat && <p className="meta">{beat(g.timeToBeat)}</p>}
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
                </Seen>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
