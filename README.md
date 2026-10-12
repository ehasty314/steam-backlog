# Backlog: Letterboxd for your Steam library

Pulls your owned games and playtime from the Steam Web API, highlights what you've never played, and lets you log a status, a 1 to 5 star rating, and a review for each game.

## Setup

1. Get a Steam Web API key at https://steamcommunity.com/dev/apikey.
2. `cp .env.example .env.local` and paste the key after `STEAM_API_KEY=`. This file is gitignored; keep the key out of chat and commits.
3. Optional, for time-to-beat estimates: create a free app at https://dev.twitch.tv/console/apps (any name, OAuth redirect URL `http://localhost`, category "Application Integration"). Copy its Client ID and generate a Client Secret, then add both to `.env.local` as `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`.
4. In Steam, set Profile → Edit Profile → Privacy Settings → **Game details** to Public (otherwise the API returns no games).
5. `npm install && npm run dev`, then open http://localhost:3000 and enter your profile URL, vanity name, or SteamID64.

## How it works

- `lib/steam.ts` calls `ResolveVanityURL` and `GetOwnedGames` on the server, so the key never reaches the browser.
- `app/api/library/route.ts` exposes `GET /api/library?user=...`.
- `lib/steam.ts` also pulls each game's community tags (with vote weights) from the store's `IStoreBrowseService/GetItems` API.
- `lib/recommend.ts` powers **Picks for you**: it builds a taste profile from the tags of games you've rated and played. Your star ratings lead: 4 to 5 stars pull picks toward a game's tags, 1 to 2 stars push them away, and unrated games count by hours played (diminishing returns). Tags common across your whole library count for less. Unplayed games are ranked by how closely their tags match that profile, and each pick gets a predicted star rating from your ratings of similar games.
- `lib/igdb.ts` looks up time-to-beat estimates (main, main + extras, completionist) from IGDB for the whole library in a few batched calls.
- `app/api/details/route.ts` fetches Metacritic scores from the Steam store. That API takes one game per request and is rate-limited, so the UI only asks for games as they scroll into view and caches them in the browser for a week.
- `app/components/Library.tsx` is the UI. Your statuses, ratings and reviews are saved in browser localStorage for now.

## Roadmap

1. **Sign in with Steam** (OpenID) instead of typing a profile, so it's your account.
2. **Database** (SQLite via Prisma or Drizzle) for logs, so they sync across devices.
3. **Diary**: dated play log entries, like Letterboxd's diary.
4. **Achievements** (`GetPlayerAchievements`) to show completion percentage.
5. **Backlog picker**: "What should I play next?" weighted by unplayed games and HowLongToBeat lengths.
6. **Lists and public profile pages** to share.
