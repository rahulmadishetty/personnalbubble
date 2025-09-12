"use client";

import dynamic from "next/dynamic";

const FinanceSigmaGraph = dynamic(
  () => import("@/components/FinanceSigmaGraph"),
  { ssr: false } // ⟵ prevents server from importing anything that references WebGL
);

export default function Page() {
  return (
    <main style={{ padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Finance Network Graph</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        Data loaded from finance-dataset Click nodes to focus, search to find.
      </p>
      <FinanceSigmaGraph datasetUrl="/finance-dataset.json" />
    </main>
  );
}
