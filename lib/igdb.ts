// Time-to-beat estimates from IGDB (igdb.com), which uses Twitch developer credentials.
// Optional: without IGDB_CLIENT_ID and IGDB_CLIENT_SECRET in .env.local, times are skipped.
import type { TimeToBeat } from "./steam";

const IGDB = "https://api.igdb.com/v4";
const STEAM_SOURCE = 1; // IGDB's id for Steam in external game sources
const BATCH = 500; // IGDB's max results per query

let token: { value: string; expires: number } | null = null;
const cache = new Map<number, TimeToBeat | null>(); // by Steam appid; null = IGDB has no data

export function igdbConfigured() {
  return Boolean(process.env.IGDB_CLIENT_ID && process.env.IGDB_CLIENT_SECRET);
}

async function accessToken(): Promise<string> {
  if (token && token.expires > Date.now() + 60_000) return token.value;
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${process.env.IGDB_CLIENT_ID}&client_secret=${process.env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`,
    { method: "POST", cache: "no-store" }
  );
  if (!res.ok) throw new Error(`Twitch login failed (${res.status}). Check IGDB_CLIENT_ID and IGDB_CLIENT_SECRET.`);
  const data = await res.json();
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return token.value;
}

async function query<T>(endpoint: string, body: string): Promise<T[]> {
  const res = await fetch(`${IGDB}/${endpoint}`, {
    method: "POST",
    headers: { "Client-ID": process.env.IGDB_CLIENT_ID!, Authorization: `Bearer ${await accessToken()}` },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`IGDB ${endpoint} returned ${res.status}: ${await res.text()}`);
  return res.json();
}

const hours = (seconds?: number) => (seconds ? Math.round((seconds / 3600) * 2) / 2 : null);

export async function getTimesToBeat(appids: number[]): Promise<Map<number, TimeToBeat>> {
  const missing = appids.filter((id) => !cache.has(id));

  for (let i = 0; i < missing.length; i += BATCH) {
    const chunk = missing.slice(i, i + BATCH);
    const uids = chunk.map((id) => `"${id}"`).join(",");

    // Steam appid -> IGDB game id. Older IGDB accounts still use `category` for the source.
    let links: { game: number; uid: string }[];
    try {
      links = await query("external_games", `fields game,uid; where external_game_source = ${STEAM_SOURCE} & uid = (${uids}); limit ${BATCH};`);
    } catch {
      links = await query("external_games", `fields game,uid; where category = ${STEAM_SOURCE} & uid = (${uids}); limit ${BATCH};`);
    }
    const gameToApp = new Map(links.map((l) => [l.game, Number(l.uid)]));

    const times = gameToApp.size
      ? await query<{ game_id: number; hastily?: number; normally?: number; completely?: number }>(
          "game_time_to_beats",
          `fields game_id,hastily,normally,completely; where game_id = (${[...gameToApp.keys()].join(",")}); limit ${BATCH};`
        )
      : [];

    for (const id of chunk) cache.set(id, null);
    for (const t of times) {
      const appid = gameToApp.get(t.game_id);
      if (!appid) continue;
      // IGDB's "hastily / normally / completely" line up with HowLongToBeat's Main / Main+Extras / Completionist.
      const ttb = { main: hours(t.hastily), extras: hours(t.normally), completionist: hours(t.completely) };
      if (ttb.main || ttb.extras || ttb.completionist) cache.set(appid, ttb);
    }
  }

  const out = new Map<number, TimeToBeat>();
  for (const id of appids) {
    const t = cache.get(id);
    if (t) out.set(id, t);
  }
  return out;
}
