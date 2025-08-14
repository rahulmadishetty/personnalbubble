import Image from "next/image";
import BubbleHierarchy from "@/components/BubbleHierarchy";

const sample1 = [
  { name: "Kusama", level: 1, source: "kusama" },
  { name: "Bio", level: 2, parent: "Kusama", source: "kusama" },
  { name: "Art", level: 2, parent: "Kusama", source: "kusama" },
  { name: "Style", level: 3, parent: "Art", source: "kusama" },
  { name: "Exhibits", level: 3, parent: "Art", source: "kusama" },
  { name: "Infinity Mirrors", level: 4, parent: "Exhibits", source: "kusama" },
  { name: "Polka Dots", level: 4, parent: "Exhibits", source: "kusama" },
  { name: "Pumpkin", level: 4, parent: "Exhibits", source: "kusama" },
  { name: "Victoria Miro", level: 4, parent: "Exhibits", source: "kusama" },
  { name: "David Zwirner", level: 4, parent: "Exhibits", source: "kusama" },
  { name: "Fondation LV", level: 4, parent: "Exhibits", source: "kusama" },
  { name: "Kusama Museum", level: 4, parent: "Exhibits", source: "kusama" },
];

const sample2 = [
  { name: "Louis Vuitton", level: 1, source: "louis" },
  { name: "History", level: 2, parent: "Louis Vuitton", source: "louis" },
  { name: "Products", level: 2, parent: "Louis Vuitton", source: "louis" },
  { name: "Location", level: 2, parent: "Louis Vuitton", source: "louis" },
  {
    name: "Travel & Culture",
    level: 2,
    parent: "Louis Vuitton",
    source: "louis",
  },
  { name: "New York", level: 3, parent: "Location", source: "louis" },
  { name: "Paris", level: 3, parent: "Location", source: "louis" },
  { name: "London", level: 3, parent: "Location", source: "louis" },
  { name: "St Tropez", level: 3, parent: "Location", source: "louis" },
  {
    name: "Fondation LV",
    level: 3,
    parent: "Travel & Culture",
    source: "louis",
  },
  { name: "Store", level: 4, parent: "New York", source: "louis" },
  { name: "Hotel", level: 4, parent: "New York", source: "louis" },
  { name: "Restaurant", level: 4, parent: "New York", source: "louis" },
  { name: "Store", level: 4, parent: "Paris", source: "louis" },
  { name: "Hotel", level: 4, parent: "Paris", source: "louis" },
  { name: "Restaurant", level: 4, parent: "Paris", source: "louis" },
  { name: "Store", level: 4, parent: "London", source: "louis" },
  { name: "Store", level: 4, parent: "St Tropez", source: "louis" },
  { name: "Restaurant", level: 4, parent: "St Tropez", source: "louis" },
];

export default function Home() {
  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>
        Packed Bubbles (3-level view with overlay)
      </h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        Click a bubble to open its children in an overlay (Level N+2). Use “Up”
        to drill up.
      </p>

      {/* Example 1 */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ margin: "8px 0" }}>Sample JSON 1 — Kusama</h2>
        <div style={{ height: 520 }}>
          <BubbleHierarchy data={sample1} />
        </div>
      </section>

      {/* Example 2 */}
      <section>
        <h2 style={{ margin: "8px 0" }}>Sample JSON 2 — Louis Vuitton</h2>
        <div style={{ height: 520 }}>
          <BubbleHierarchy data={sample2} />
        </div>
      </section>
    </main>
  );
}
