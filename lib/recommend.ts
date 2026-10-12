import type { Game } from "./steam";

export type Status = "unplayed" | "playing" | "finished" | "dropped" | "backlog";
export type Entry = { status?: Status; rating?: number; review?: string };
export type Log = Record<number, Entry>;

export type Pick = {
  game: Game;
  match: number; // 0 to 1, cosine similarity to your taste profile
  predicted: number | null; // 1 to 5 stars, from your ratings of similar games
  tags: number[]; // tag ids that drove the match, strongest first
  because: Game[]; // games you liked that are most like this one
};

type Vec = Map<number, number>;

// Similarity a rated game needs before it counts toward a predicted rating or "because".
const SIMILAR = 0.25;

// How much a game tells us about your taste. Your star rating is the strongest signal:
// 4 to 5 stars pull picks toward its tags, 1 to 2 stars push them away. Unrated games
// fall back to playtime with diminishing returns. A rated game counts even with no
// Steam hours, since you may have played it elsewhere.
export function signal(g: Game, entry: Entry | undefined): number {
  const hours = Math.log1p(g.playtimeMinutes / 60);
  let s = entry?.rating ? Math.max(hours, 1) * ((entry.rating - 2.5) / 1.25) : hours;
  if (entry?.status === "dropped" && s > 0) s *= 0.3;
  return s;
}

function norm(v: Vec) {
  let sum = 0;
  for (const x of v.values()) sum += x * x;
  return Math.sqrt(sum);
}

function dot(a: Vec, b: Vec) {
  let sum = 0;
  for (const [k, x] of a) sum += x * (b.get(k) ?? 0);
  return sum;
}

function cosine(a: Vec, b: Vec) {
  return dot(a, b) / (norm(a) * norm(b) || 1);
}

// Each game's tags as a vector. Tags that nearly every game in your library has
// ("Singleplayer") say little, so each tag is weighted by how rare it is in your library (IDF).
export function tagVectors(tagged: Game[]): Map<number, Vec> {
  const df = new Map<number, number>();
  for (const g of tagged) for (const t of g.tags) df.set(t.id, (df.get(t.id) ?? 0) + 1);
  const idf = (id: number) => Math.log((tagged.length + 1) / (df.get(id) ?? 1));

  const vectors = new Map<number, Vec>();
  for (const g of tagged) {
    const max = g.tags[0].weight || 1;
    vectors.set(g.appid, new Map(g.tags.map((t) => [t.id, (t.weight / max) * idf(t.id)])));
  }
  return vectors;
}

// Your taste as tag weights: positive for tags you gravitate to, negative for ones you rate down.
export function tasteProfile(tagged: Game[], log: Log, vectors = tagVectors(tagged)) {
  const known = tagged
    .map((g) => ({ g, s: signal(g, log[g.appid]), rating: log[g.appid]?.rating ?? 0 }))
    .filter((p) => p.s !== 0);
  const profile: Vec = new Map();
  for (const { g, s } of known) {
    for (const [id, w] of vectors.get(g.appid)!) profile.set(id, (profile.get(id) ?? 0) + s * w);
  }
  return { known, profile };
}

export function recommend(games: Game[], log: Log, limit = 12): Pick[] {
  const tagged = games.filter((g) => g.tags.length);
  if (!tagged.length) return [];

  const vectors = tagVectors(tagged);
  const { known, profile } = tasteProfile(tagged, log, vectors);
  if (!known.length) return [];

  const candidates = tagged.filter((g) => {
    const entry = log[g.appid];
    const status = entry?.status;
    return (
      g.playtimeMinutes === 0 &&
      !entry?.rating &&
      status !== "finished" &&
      status !== "dropped" &&
      status !== "playing"
    );
  });

  return candidates
    .map((game) => {
      const v = vectors.get(game.appid)!;
      const match = Math.max(0, cosine(profile, v));
      const tags = [...v]
        .map(([id, w]) => [id, w * (profile.get(id) ?? 0)] as const)
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);

      const similar = known
        .map((k) => ({ ...k, sim: cosine(vectors.get(k.g.appid)!, v) }))
        .filter((k) => k.sim >= SIMILAR);

      // Predicted stars: your ratings of similar games, weighted toward the most similar.
      const rated = similar.filter((k) => k.rating);
      const weight = rated.reduce((sum, k) => sum + k.sim ** 2, 0);
      const predicted = weight ? rated.reduce((sum, k) => sum + k.rating * k.sim ** 2, 0) / weight : null;

      const because = similar
        .filter((k) => k.s > 0)
        .sort((a, b) => b.sim * Math.min(b.s, 3) - a.sim * Math.min(a.s, 3))
        .slice(0, 2)
        .map((k) => k.g);

      return { game, match, predicted, tags, because };
    })
    .filter((p) => p.match >= 0.05)
    .sort((a, b) => b.match - a.match)
    .slice(0, limit);
}
