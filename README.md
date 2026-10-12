# Backlog: Letterboxd for your Steam library

Pulls your owned games and playtime from the Steam Web API, highlights what you've never played, and lets you log a status, a 1 to 5 star rating, and a review for each game.

## Setup

1. Get a Steam Web API key at https://steamcommunity.com/dev/apikey.
2. `cp .env.example .env.local` and paste the key after `STEAM_API_KEY=`. This file is gitignored; keep the key out of chat and commits.
3. In Steam, set Profile → Edit Profile → Privacy Settings → **Game details** to Public (otherwise the API returns no games).
4. `npm install && npm run dev`, then open http://localhost:3000 and enter your profile URL, vanity name, or SteamID64.

## How it works

- `lib/steam.ts` calls `ResolveVanityURL` and `GetOwnedGames` on the server, so the key never reaches the browser.
- `app/api/library/route.ts` exposes `GET /api/library?user=...`.
- `app/components/Library.tsx` is the UI. Your statuses, ratings and reviews are saved in browser localStorage for now.

## Roadmap

1. **Sign in with Steam** (OpenID) instead of typing a profile, so it's your account.
2. **Database** (SQLite via Prisma or Drizzle) for logs, so they sync across devices.
3. **Diary**: dated play log entries, like Letterboxd's diary.
4. **Achievements** (`GetPlayerAchievements`) to show completion percentage.
5. **Backlog picker**: "What should I play next?" weighted by unplayed games and HowLongToBeat lengths.
6. **Lists and public profile pages** to share.
