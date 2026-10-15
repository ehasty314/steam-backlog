import { NextResponse } from "next/server";
import { getDetails, type Details } from "@/lib/steam";

const MAX = 20;
const CONCURRENCY = 4;

export async function GET(req: Request) {
  const appids = (new URL(req.url).searchParams.get("appids") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0)
    .slice(0, MAX);

  const details: Record<number, Details> = {};
  let next = 0;
  async function worker() {
    while (next < appids.length) {
      const appid = appids[next++];
      try {
        details[appid] = await getDetails(appid);
      } catch {
        // Leave it out so the browser asks again later (usually a rate limit).
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return NextResponse.json({ details });
}
