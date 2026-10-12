export default function Metacritic({ score, url }: { score: number | null | undefined; url?: string | null }) {
  if (score == null) return null;
  const tone = score >= 75 ? "mc-good" : score >= 50 ? "mc-mixed" : "mc-bad";
  const badge = <span className={`mc ${tone}`} title="Metacritic score">{score}</span>;
  return url ? <a href={url} target="_blank" rel="noreferrer">{badge}</a> : badge;
}
