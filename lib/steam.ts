// Server-only helpers for the Steam Web API. The API key never reaches the browser.
const API = "https://api.steampowered.com";

export type Game = {
  appid: number;
  name: string;
  playtimeMinutes: number;
  lastPlayed: number | null; // unix seconds
  iconUrl: string | null;
  headerUrl: string;
};

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

export async function getOwnedGames(steamId: string): Promise<Game[]> {
  const res = await fetch(
    `${API}/IPlayerService/GetOwnedGames/v1/?key=${key()}&steamid=${steamId}&include_appinfo=1&include_played_free_games=1&format=json`,
    { next: { revalidate: 600 } }
  );
  if (!res.ok) throw new Error(`Steam returned ${res.status}.`);
  const data = await res.json();
  const games = data?.response?.games;
  if (!games) throw new Error("No games returned. Is your profile's Game details setting public?");

  return games.map((g: any) => ({
    appid: g.appid,
    name: g.name,
    playtimeMinutes: g.playtime_forever ?? 0,
    lastPlayed: g.rtime_last_played || null,
    iconUrl: g.img_icon_url
      ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
      : null,
    headerUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/header.jpg`,
  }));
}
