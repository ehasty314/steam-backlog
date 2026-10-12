"use client";

import { useEffect, useMemo, useState } from "react";
import type { Game } from "@/lib/steam";
import { recommend } from "@/lib/recommend";
import { analyzeTaste } from "@/lib/taste";
import type { GamerProfile } from "@/app/api/profile/route";
import { useSavedLibrary } from "./useLibrary";

const PROFILE_KEY = "backlog.profile.v1";
const stars = (n: number) => "★".repeat(n) + "☆".repeat(5 - n);
const hrs = (g: Game) => `${Math.round(g.playtimeMinutes / 60)}h`;

export default function Taste() {
  const { games, tagNames, log, state, error } = useSavedLibrary();
  const taste = useMemo(() => analyzeTaste(games, log), [games, log]);
  const picks = useMemo(() => recommend(games, log, 10), [games, log]);

  const [profile, setProfile] = useState<{ data: GamerProfile; at: number } | null>(null);
  const [writing, setWriting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    try { setProfile(JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "null")); } catch {}
  }, []);

  if (state === "loading") return <p className="sub">Loading your library…</p>;
  if (state === "no-user") return <p className="sub">Load your library on the <a href="/">main page</a> first.</p>;
  if (state === "error") return <p className="error">{error}</p>;

  const name = (id: number) => tagNames[id] ?? `Tag ${id}`;
  const topTags = (g: Game) => g.tags.slice(0, 5).map((t) => name(t.id));

  async function writeProfile() {
    setWriting(true); setProfileError(null);
    // Only what the profile needs: your logged games, top played games, tag leanings and candidates.
    const payload = {
      stats: {
        owned: taste.owned, played: taste.played, hours: taste.hours, finished: taste.finished,
        dropped: taste.dropped, averageRating: taste.averageRating, ratingCounts: taste.ratingCounts,
      },
      lovedTags: taste.loves.map((l) => name(l.tag)),
      avoidedTags: taste.avoids.map((a) => name(a.tag)),
      loggedGames: games
        .filter((g) => log[g.appid]?.rating || log[g.appid]?.review?.trim() || log[g.appid]?.status)
        .map((g) => ({
          name: g.name, hours: Math.round(g.playtimeMinutes / 60), rating: log[g.appid]?.rating || null,
          status: log[g.appid]?.status ?? null, review: log[g.appid]?.review?.trim().slice(0, 1500) || null, tags: topTags(g),
        })),
      mostPlayed: taste.mostPlayed.map((g) => ({ name: g.name, hours: Math.round(g.playtimeMinutes / 60), tags: topTags(g) })),
      unplayedCandidates: picks.map((p) => ({
        name: p.game.name, tags: p.tags.map(name), predictedRating: p.predicted && Number(p.predicted.toFixed(1)),
        hoursToBeat: p.game.timeToBeat?.main ?? null,
      })),
    };
    try {
      const res = await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const saved = { data: data.profile as GamerProfile, at: Date.now() };
      setProfile(saved);
      try { localStorage.setItem(PROFILE_KEY, JSON.stringify(saved)); } catch {}
    } catch (e) {
      setProfileError((e as Error).message);
    } finally {
      setWriting(false);
    }
  }

  const maxRatingCount = Math.max(...taste.ratingCounts, 1);

  return (
    <div className="taste">
      <div className="tiles">
        <div className="tile"><b>{taste.hours.toLocaleString()}</b><span>hours played</span></div>
        <div className="tile"><b>{taste.played} / {taste.owned}</b><span>games played ({Math.round((taste.played / Math.max(taste.owned, 1)) * 100)}%)</span></div>
        <div className="tile"><b>{taste.averageRating ? `★ ${taste.averageRating.toFixed(1)}` : "–"}</b><span>average across {taste.rated} rated</span></div>
        <div className="tile"><b>{taste.finished} / {taste.dropped}</b><span>finished / dropped</span></div>
        <div className="tile">
          <b>{taste.backlog.count}</b>
          <span>in your backlog{taste.backlog.withTimes > 0 && `, about ${taste.backlog.hours.toLocaleString()}h to beat ${taste.backlog.withTimes} of them`}</span>
        </div>
      </div>

      <section className="panel ai">
        <div className="panel-head">
          <h2>Your gamer profile</h2>
          <button onClick={writeProfile} disabled={writing || (taste.rated === 0 && taste.played === 0)}>
            {writing ? "Writing…" : profile ? "Rewrite" : "Write it with Claude"}
          </button>
        </div>
        {profileError && <p className="error">{profileError}</p>}
        {!profile && !profileError && (
          <p className="meta">Claude reads your ratings, reviews, playtime and tags and writes a short profile of you as a player. The more you rate and review, the better it gets.</p>
        )}
        {profile && (
          <>
            <h3 className="headline">{profile.data.headline}</h3>
            {profile.data.summary.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)}
            <div className="cols">
              <div>
                <h4>You love</h4>
                <ul>{profile.data.loves.map((l, i) => <li key={i}>{l}</li>)}</ul>
              </div>
              {profile.data.dislikes.length > 0 && (
                <div>
                  <h4>Doesn't land</h4>
                  <ul>{profile.data.dislikes.map((l, i) => <li key={i}>{l}</li>)}</ul>
                </div>
              )}
            </div>
            {profile.data.playNext.length > 0 && (
              <>
                <h4>Play next</h4>
                <ul>{profile.data.playNext.map((p, i) => <li key={i}><b>{p.name}</b>: {p.why}</li>)}</ul>
              </>
            )}
            <p className="meta">Written {new Date(profile.at).toLocaleDateString()}</p>
          </>
        )}
      </section>

      <div className="cols">
        <section className="panel">
          <h2>Tags you gravitate to</h2>
          {taste.loves.length === 0 ? <p className="meta">Play or rate a few games to see this.</p> : (
            <ul className="bars">
              {taste.loves.map((l) => (
                <li key={l.tag}><span>{name(l.tag)}</span><i style={{ width: `${Math.max(l.weight * 100, 4)}%` }} /></li>
              ))}
            </ul>
          )}
          {taste.avoids.length > 0 && (
            <>
              <h4>Not for you</h4>
              <div className="chips">{taste.avoids.map((a) => <span key={a.tag} className="chip chip-bad">{name(a.tag)}</span>)}</div>
            </>
          )}
        </section>

        <section className="panel">
          <h2>How you rate</h2>
          <ul className="bars ratings">
            {[5, 4, 3, 2, 1].map((n) => (
              <li key={n}><span>{stars(n)}</span><i style={{ width: `${(taste.ratingCounts[n - 1] / maxRatingCount) * 100}%` }} /><em>{taste.ratingCounts[n - 1]}</em></li>
            ))}
          </ul>
          <h4>Favorites</h4>
          {taste.favorites.length === 0 ? <p className="meta">Rate games 4 or 5 stars to see them here.</p> : (
            <ul className="plain">{taste.favorites.map((g) => <li key={g.appid}>{g.name} <span className="predicted">{stars(log[g.appid]!.rating!)}</span></li>)}</ul>
          )}
          <h4>Most played</h4>
          <ul className="plain">{taste.mostPlayed.map((g) => <li key={g.appid}>{g.name} <span className="meta">{hrs(g)}</span></li>)}</ul>
        </section>
      </div>

      <section className="panel">
        <h2>Your reviews</h2>
        {taste.reviews.length === 0 ? <p className="meta">Reviews you write in the library show up here.</p> : (
          <ul className="reviews">
            {taste.reviews.map((r) => (
              <li key={r.game.appid}>
                <div className="pick-head"><h3>{r.game.name}</h3>{r.rating > 0 && <span className="predicted">{stars(r.rating)}</span>}</div>
                <p>{r.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
