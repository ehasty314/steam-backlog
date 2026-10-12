import { NextResponse } from "next/server";
import { getOwnedGames, resolveSteamId } from "@/lib/steam";

export async function GET(req: Request) {
  const user = new URL(req.url).searchParams.get("user");
  if (!user) return NextResponse.json({ error: "Missing ?user=" }, { status: 400 });
  try {
    const steamId = await resolveSteamId(user);
    const games = await getOwnedGames(steamId);
    return NextResponse.json({ steamId, games });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
