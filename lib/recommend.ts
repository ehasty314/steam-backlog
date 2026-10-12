import type { Game } from "./steam";

export type Status = "unplayed" | "playing" | "finished" | "dropped" | "backlog";
export type Entry = { status?: Status; rating?: number; review?: string };
export type Log = Record<number, Entry>;

export type Pick = {
  game: Game;
  match: number; // 0 to 1, cosine similarity to your taste profile
  tags: number[]; // tag ids that drove the match, strongest first
  because: Game[]; // played games most like this one
};

type Vec = Map<number, number>;

// How much a played game tells us about your taste: diminishing returns on hours,
// boosted or dampened by your star rating, and mostly ignored if you dropped it.
function signal(g: Game, entry: Entry | undefined): number {
  let s = Math.log1p(g.playtimeMinutes / 60);
  if (entry?.rating) s *= entry.rating / 3;
  if (entry?.status === "dropped") s *= 0.3;
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

export function recommend(games: Game[], log: Log, limit = 12): Pick[] {
  const tagged = games.filter((g) => g.tags.length);
  if (!tagged.length) return [];

  // Tags that nearly every game in your library has ("Singleplayer") say little,
  // so weight each tag by how rare it is in your library (IDF).
  const df = new Map<number, number>();
  for (const g of tagged) for (const t of g.tags) df.set(t.id, (df.get(t.id) ?? 0) + 1);
  const idf = (id: number) => Math.log((tagged.length + 1) / (df.get(id) ?? 1));

  const vectors = new Map<number, Vec>();
  for (const g of tagged) {
    const max = g.tags[0].weight || 1;
    vectors.set(g.appid, new Map(g.tags.map((t) => [t.id, (t.weight / max) * idf(t.id)])));
  }

  const played = tagged
    .map((g) => ({ g, s: signal(g, log[g.appid]) }))
    .filter((p) => p.s > 0);
  if (!played.length) return [];

  const profile: Vec = new Map();
  for (const { g, s } of played) {
    for (const [id, w] of vectors.get(g.appid)!) profile.set(id, (profile.get(id) ?? 0) + s * w);
  }
  const profileNorm = norm(profile);

  const candidates = tagged.filter((g) => {
    const status = log[g.appid]?.status;
    return g.playtimeMinutes === 0 && status !== "finished" && status !== "dropped" && status !== "playing";
  });

  return candidates
    .map((game) => {
      const v = vectors.get(game.appid)!;
      const match = dot(profile, v) / (profileNorm * norm(v) || 1);
      const tags = [...v]
        .map(([id, w]) => [id, w * (profile.get(id) ?? 0)] as const)
        .filter(([, c]) => c > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([id]) => id);
      const because = played
        .map(({ g, s }) => {
          const pv = vectors.get(g.appid)!;
          const sim = dot(pv, v) / (norm(pv) * norm(v) || 1);
          return { g, sim, rank: sim * Math.min(s, 3) };
        })
        .filter((x) => x.sim >= 0.25)
        .sort((a, b) => b.rank - a.rank)
        .slice(0, 2)
        .map((x) => x.g);
      return { game, match, tags, because };
    })
    .sort((a, b) => b.match - a.match)
    .slice(0, limit);
}
