// Server-only helpers for the Steam Web API. The API key never reaches the browser.
const API = "https://api.steampowered.com";

export type Game = {
  appid: number;
  name: string;
  playtimeMinutes: number;
  lastPlayed: number | null; // unix seconds
  iconUrl: string | null;
  headerUrl: string;
  tags: GameTag[]; // strongest first; empty if Steam has none
  timeToBeat: TimeToBeat | null; // hours, from IGDB when configured
};

export type TimeToBeat = { main: number | null; extras: number | null; completionist: number | null };

export type GameTag = { id: number; weight: number };

function key(): string {
  const k = process.env.STEAM_API_KEY;
  if (!k) throw new Error("STEAM_API_KEY is not set. Add it to .env.local.");
  return k;
}

// Accepts a 64-bit SteamID, a vanity name, or a profile URL.
export async function resolveSteamId(input: string): Promise<string> {
  const trimmed = input.trim().replace(/\/+$/, "");
  const profile = trimmed.match(/steamcommunity\.com\/profiles\/(\d{17})/);
  if (profile) return profile[1];
  if (/^\d{17}$/.test(trimmed)) return trimmed;
  const vanity = trimmed.match(/steamcommunity\.com\/id\/([^/]+)/)?.[1] ?? trimmed;

  const res = await fetch(
    `${API}/ISteamUser/ResolveVanityURL/v1/?key=${key()}&vanityurl=${encodeURIComponent(vanity)}`
  );
  const data = await res.json();
  if (data?.response?.success !== 1) throw new Error(`Couldn't find a Steam profile for "${input}".`);
  return data.response.steamid;
}

// Steam lists servers, test builds and tools as owned "games"; they aren't things you play.
const NON_GAME =
  /\b(dedicated server|test server|public test|test branch|pts|playtest|sdk|soundtrack|ost|benchmark|redistributables?|mod tools?)\b/i;

export function isNonGame(name: string) {
  return NON_GAME.test(name);
}

export async function getOwnedGames(steamId: string): Promise<Game[]> {
  const res = await fetch(
    `${API}/IPlayerService/GetOwnedGames/v1/?key=${key()}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`,
    { next: { revalidate: 600 } }
  );
  if (!res.ok) throw new Error(`Steam returned ${res.status}.`);
  const data = await res.json();
  const games = data?.response?.games;
  if (!games) throw new Error("No games returned. Is your profile's Game details setting public?");

  return games.filter((g: any) => !isNonGame(g.name ?? "")).map((g: any) => ({
    appid: g.appid,
    name: g.name,
    playtimeMinutes: g.playtime_forever ?? 0,
    lastPlayed: g.rtime_last_played || null,
    iconUrl: g.img_icon_url
      ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
      : null,
    headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
    tags: [],
    timeToBeat: null,
  }));
}

// Community tags (e.g. "Roguelike", "Story Rich") with vote weights, from the store browse API.
// Batched because a library can hold thousands of games.
export async function getTagsForApps(appids: number[]): Promise<Map<number, GameTag[]>> {
  const out = new Map<number, GameTag[]>();
  const BATCH = 50;
  const batches: number[][] = [];
  for (let i = 0; i < appids.length; i += BATCH) batches.push(appids.slice(i, i + BATCH));

  await Promise.all(
    batches.map(async (ids) => {
      const input = {
        ids: ids.map((appid) => ({ appid })),
        context: { language: "english", country_code: "US" },
        data_request: { include_tag_count: 20 },
      };
      const res = await fetch(
        `${API}/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
        { next: { revalidate: 86400 } }
      );
      if (!res.ok) return;
      const data = await res.json();
      for (const item of data?.response?.store_items ?? []) {
        const appid = item.appid ?? item.id;
        let tags: GameTag[] = (item.tags ?? []).map((t: any) => ({ id: t.tagid, weight: t.weight ?? 0 }));
        // Fall back to tag order when weights are missing: earlier tags have more votes.
        if (!tags.length && item.tagids) {
          tags = item.tagids.map((id: number, i: number) => ({ id, weight: item.tagids.length - i }));
        }
        if (appid && tags.length) out.set(appid, tags.sort((a, b) => b.weight - a.weight));
      }
    })
  );
  return out;
}

export async function getTagNames(): Promise<Record<number, string>> {
  const res = await fetch(`${API}/IStoreService/GetTagList/v1/?key=${key()}&language=english`, {
    next: { revalidate: 604800 },
  });
  if (!res.ok) return {};
  const data = await res.json();
  const names: Record<number, string> = {};
  for (const t of data?.response?.tags ?? []) names[t.tagid] = t.name;
  return names;
}

export type Details = { metacritic: number | null; metacriticUrl: string | null };

// Store page details (Metacritic score). The store API takes one app per request and
// rate-limits to roughly 200 requests per 5 minutes, so callers fetch these lazily.
export async function getDetails(appid: number): Promise<Details> {
  const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&cc=us&l=english`, {
    next: { revalidate: 604800 },
  });
  if (!res.ok) throw new Error(`Steam store returned ${res.status}`);
  const data = (await res.json())?.[appid]?.data;
  return {
    metacritic: data?.metacritic?.score ?? null,
    metacriticUrl: data?.metacritic?.url ?? null,
  };
}
