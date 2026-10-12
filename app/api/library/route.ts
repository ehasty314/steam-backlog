import { NextResponse } from "next/server";
import { getOwnedGames, getTagNames, getTagsForApps, resolveSteamId } from "@/lib/steam";

export async function GET(req: Request) {
  const user = new URL(req.url).searchParams.get("user");
  if (!user) return NextResponse.json({ error: "Missing ?user=" }, { status: 400 });
  try {
    const steamId = await resolveSteamId(user);
    const games = await getOwnedGames(steamId);

    // Tags power recommendations; the library still loads if Steam's store API is down.
    let tagNames: Record<number, string> = {};
    try {
      const [tags, names] = await Promise.all([getTagsForApps(games.map((g) => g.appid)), getTagNames()]);
      for (const g of games) g.tags = tags.get(g.appid) ?? [];
      tagNames = names;
    } catch (e) {
      console.warn("Couldn't load tags:", (e as Error).message);
    }

    return NextResponse.json({ steamId, games, tagNames });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
