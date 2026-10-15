import Taste from "../components/Taste";

export const metadata = { title: "My taste · Backlog" };

export default function MePage() {
  return (
    <main>
      <header className="top">
        <h1>My taste</h1>
        <a href="/" className="nav">← Library</a>
      </header>
      <Taste />
    </main>
  );
}
