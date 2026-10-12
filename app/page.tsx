import Library from "./components/Library";

export default function Home() {
  return (
    <main>
      <h1>Backlog</h1>
      <p className="sub">Your Steam library, logged. Rate it, review it, and finally play the stuff you bought.</p>
      <Library />
    </main>
  );
}
