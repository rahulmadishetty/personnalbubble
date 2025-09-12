import Image from "next/image";
import CircularPacking from "@/components/CircularPacking";
import PackedBubbles from "@/components/PackedBubbles";
import BubbleHierarchy from "@/components/BubbleHierarchy";
import NewBubbleHierarchy from "@/components/NewBubbleHierarchy";

const sample1 = [
  { name: "Ford Motor Company", level: 1, source: "ford-corporate" },

  {
    name: "History",
    level: 2,
    parent: "Ford Motor Company",
    source: "ford-corporate",
  },
  {
    name: "Products",
    level: 2,
    parent: "Ford Motor Company",
    source: "ford-corporate",
  },
  {
    name: "Global Presence",
    level: 2,
    parent: "Ford Motor Company",
    source: "ford-corporate",
  },

  { name: "Model T", level: 3, parent: "History", source: "ford-corporate" },
  {
    name: "Assembly Line",
    level: 3,
    parent: "History",
    source: "ford-corporate",
  },

  { name: "SUVs", level: 3, parent: "Products", source: "ford-corporate" },
  { name: "Trucks", level: 3, parent: "Products", source: "ford-corporate" },
  { name: "EVs", level: 3, parent: "Products", source: "ford-corporate" },

  {
    name: "USA",
    level: 3,
    parent: "Global Presence",
    source: "ford-corporate",
  },
  {
    name: "Europe",
    level: 3,
    parent: "Global Presence",
    source: "ford-corporate",
  },
  {
    name: "Asia",
    level: 3,
    parent: "Global Presence",
    source: "ford-corporate",
  },

  { name: "Mustang Mach-E", level: 4, parent: "EVs", source: "ford-corporate" },
  {
    name: "F-150 Lightning",
    level: 4,
    parent: "EVs",
    source: "ford-corporate",
  },
  { name: "Bronco", level: 4, parent: "SUVs", source: "ford-corporate" },
  { name: "Ranger", level: 4, parent: "Trucks", source: "ford-corporate" },
  {
    name: "Cologne Plant",
    level: 4,
    parent: "Europe",
    source: "ford-corporate",
  },
  { name: "Dearborn HQ", level: 4, parent: "USA", source: "ford-corporate" },
];

const sample2 = [
  { name: "Ford Europe", level: 1, source: "ford-europe" },

  { name: "Locations", level: 2, parent: "Ford Europe", source: "ford-europe" },
  {
    name: "Popular Models",
    level: 2,
    parent: "Ford Europe",
    source: "ford-europe",
  },
  {
    name: "Sustainability",
    level: 2,
    parent: "Ford Europe",
    source: "ford-europe",
  },

  { name: "Germany", level: 3, parent: "Locations", source: "ford-europe" },
  { name: "UK", level: 3, parent: "Locations", source: "ford-europe" },
  { name: "Spain", level: 3, parent: "Locations", source: "ford-europe" },

  { name: "Fiesta", level: 3, parent: "Popular Models", source: "ford-europe" },
  { name: "Focus", level: 3, parent: "Popular Models", source: "ford-europe" },
  { name: "Puma", level: 3, parent: "Popular Models", source: "ford-europe" },

  {
    name: "Electrification",
    level: 3,
    parent: "Sustainability",
    source: "ford-europe",
  },
  {
    name: "Hybrid Tech",
    level: 3,
    parent: "Sustainability",
    source: "ford-europe",
  },

  { name: "Cologne Plant", level: 4, parent: "Germany", source: "ford-europe" },
  { name: "Dagenham Plant", level: 4, parent: "UK", source: "ford-europe" },
  { name: "Valencia Plant", level: 4, parent: "Spain", source: "ford-europe" },

  {
    name: "Fiesta Hybrid",
    level: 4,
    parent: "Hybrid Tech",
    source: "ford-europe",
  },
  {
    name: "All-Electric Puma",
    level: 4,
    parent: "Electrification",
    source: "ford-europe",
  },
];

const sample3 = [
  { name: "Ford Technologies", level: 1, source: "ford-tech" },

  {
    name: "Smart Mobility",
    level: 2,
    parent: "Ford Technologies",
    source: "ford-tech",
  },
  {
    name: "Connected Car",
    level: 2,
    parent: "Ford Technologies",
    source: "ford-tech",
  },
  {
    name: "Services",
    level: 2,
    parent: "Ford Technologies",
    source: "ford-tech",
  },

  {
    name: "Ride Sharing",
    level: 3,
    parent: "Smart Mobility",
    source: "ford-tech",
  },
  {
    name: "E-Scooters",
    level: 3,
    parent: "Smart Mobility",
    source: "ford-tech",
  },

  { name: "SYNC", level: 3, parent: "Connected Car", source: "ford-tech" },
  { name: "FordPass", level: 3, parent: "Connected Car", source: "ford-tech" },

  { name: "Financing", level: 3, parent: "Services", source: "ford-tech" },
  { name: "Leasing", level: 3, parent: "Services", source: "ford-tech" },
  { name: "Maintenance", level: 3, parent: "Services", source: "ford-tech" },

  { name: "Chariot", level: 4, parent: "Ride Sharing", source: "ford-tech" },
  { name: "Spin", level: 4, parent: "E-Scooters", source: "ford-tech" },
  { name: "SYNC 4", level: 4, parent: "SYNC", source: "ford-tech" },
  { name: "FordPass App", level: 4, parent: "FordPass", source: "ford-tech" },
];

const allData = [...sample1, ...sample2, ...sample3];

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
        <h2 style={{ margin: "8px 0" }}>Sample JSON 1 </h2>
        <div style={{ height: 520 }}>
          {/* <PackedBubbles data={sample1} /> */}
          <BubbleHierarchy data={sample2} />
        </div>
      </section>

      {/* Example 2 */}
      <section>
        <h2 style={{ margin: "8px 0" }}>Sample JSON 2 </h2>
        <div style={{ height: 520 }}>
          <NewBubbleHierarchy data={sample3} />
        </div>
      </section>
    </main>
  );
}
