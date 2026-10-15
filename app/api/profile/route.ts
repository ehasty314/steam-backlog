import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

// Writes a short "who you are as a player" profile from your ratings, reviews and tags.
// Optional: needs ANTHROPIC_API_KEY in .env.local.

export type GamerProfile = {
  headline: string;
  summary: string;
  loves: string[];
  dislikes: string[];
  playNext: { name: string; why: string }[];
};

const SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "A punchy one-line title for this player, under 10 words." },
    summary: { type: "string", description: "Two short paragraphs, in second person, about who they are as a player." },
    loves: { type: "array", items: { type: "string" }, description: "3 to 5 specific things they love, grounded in the data." },
    dislikes: { type: "array", items: { type: "string" }, description: "1 to 3 things that don't land for them. Empty if the data shows none." },
    playNext: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, why: { type: "string" } },
        required: ["name", "why"],
        additionalProperties: false,
      },
      description: "Up to 3 games chosen only from unplayedCandidates, each with one sentence on why.",
    },
  },
  required: ["headline", "summary", "loves", "dislikes", "playNext"],
  additionalProperties: false,
};

const SYSTEM = `You write a short, warm and honest taste profile for someone's personal game library app, in the spirit of a Letterboxd year-in-review.
Base every claim on the data you're given: their star ratings (1 to 5), their own review text, hours played, the community tags they gravitate toward or rate down, and what they've finished or dropped. Quote or paraphrase their reviews when it helps. Don't invent games, facts, or tastes the data doesn't support, and if there's little data, say what you can and keep it short.
Write in second person ("you"). Keep it specific and a little playful, not generic.`;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Add ANTHROPIC_API_KEY to .env.local to turn this on." }, { status: 501 });
  }
  const data = await req.json();
  const body = JSON.stringify(data);
  if (body.length > 200_000) return NextResponse.json({ error: "Too much data to send." }, { status: 413 });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: `Here is my library data as JSON:\n\n${body}` }],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "Claude declined to write this profile. Try again later." }, { status: 422 });
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("No text in response");
    const profile: GamerProfile = JSON.parse(text.text);
    return NextResponse.json({ profile });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Anthropic rejected the API key. Check ANTHROPIC_API_KEY." }, { status: 401 });
    }
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "Rate limited by Anthropic. Try again in a minute." }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Anthropic API error ${e.status}: ${e.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
