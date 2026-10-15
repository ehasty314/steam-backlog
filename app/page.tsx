import Library from "./components/Library";

export default function Home() {
  return (
    <main>
      <header className="top">
        <h1>Backlog</h1>
        <a href="/me" className="nav">My taste →</a>
      </header>
      <p className="sub">Your Steam library, logged. Rate it, review it, and finally play the stuff you bought.</p>
      <Library />
    </main>
  );
}
