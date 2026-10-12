import type { Game } from "./steam";
import { tasteProfile, type Log } from "./recommend";

export type Taste = {
  owned: number;
  played: number;
  hours: number;
  rated: number;
  averageRating: number | null;
  ratingCounts: number[]; // index 0 = 1 star ... index 4 = 5 stars
  finished: number;
  dropped: number;
  backlog: { count: number; hours: number; withTimes: number };
  loves: { tag: number; weight: number }[]; // strongest first, weight 0 to 1
  avoids: { tag: number; weight: number }[];
  favorites: Game[];
  mostPlayed: Game[];
  reviews: { game: Game; rating: number; text: string }[];
};

export function analyzeTaste(games: Game[], log: Log): Taste {
  const played = games.filter((g) => g.playtimeMinutes > 0);
  const ratings = games.map((g) => log[g.appid]?.rating ?? 0).filter((r) => r > 0);
  const ratingCounts = [1, 2, 3, 4, 5].map((n) => ratings.filter((r) => r === n).length);

  const tagged = games.filter((g) => g.tags.length);
  const { profile } = tasteProfile(tagged, log);
  const entries = [...profile].sort((a, b) => b[1] - a[1]);
  const positive = entries.filter(([, w]) => w > 0).slice(0, 10);
  const negative = entries.filter(([, w]) => w < 0).reverse().slice(0, 6);
  const loves = positive.map(([tag, w]) => ({ tag, weight: w / positive[0][1] }));
  const avoids = negative.map(([tag, w]) => ({ tag, weight: w / negative[0][1] }));

  const status = (g: Game) => log[g.appid]?.status;
  const unplayed = games.filter((g) => g.playtimeMinutes === 0 && !log[g.appid]?.rating && status(g) !== "dropped" && status(g) !== "finished");
  const times = unplayed.map((g) => g.timeToBeat?.main ?? g.timeToBeat?.extras).filter((h): h is number => !!h);

  const byRatingThenHours = (a: Game, b: Game) =>
    (log[b.appid]?.rating ?? 0) - (log[a.appid]?.rating ?? 0) || b.playtimeMinutes - a.playtimeMinutes;

  return {
    owned: games.length,
    played: played.length,
    hours: Math.round(games.reduce((s, g) => s + g.playtimeMinutes, 0) / 60),
    rated: ratings.length,
    averageRating: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
    ratingCounts,
    finished: games.filter((g) => status(g) === "finished").length,
    dropped: games.filter((g) => status(g) === "dropped").length,
    backlog: { count: unplayed.length, hours: Math.round(times.reduce((a, b) => a + b, 0)), withTimes: times.length },
    loves,
    avoids,
    favorites: games.filter((g) => (log[g.appid]?.rating ?? 0) >= 4).sort(byRatingThenHours).slice(0, 8),
    mostPlayed: [...played].sort((a, b) => b.playtimeMinutes - a.playtimeMinutes).slice(0, 8),
    reviews: games
      .filter((g) => log[g.appid]?.review?.trim())
      .map((g) => ({ game: g, rating: log[g.appid]?.rating ?? 0, text: log[g.appid]!.review!.trim() }))
      .sort((a, b) => b.rating - a.rating),
  };
}
