"use client";

import React, { useEffect, useMemo, useState } from "react";
import Graph from "graphology";
import circular from "graphology-layout/circular";
import forceAtlas2 from "graphology-layout-forceatlas2";
import {
  SigmaContainer,
  ControlsContainer,
  ZoomControl,
  FullScreenControl,
  useLoadGraph,
  useRegisterEvents,
  useSetSettings,
  useCamera,
} from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import {
  GraphSearch,
  GraphSearchContextProvider,
} from "@react-sigma/graph-search";
import "@react-sigma/graph-search/lib/style.css";
import type { GraphSearchOption, OptionItem } from "@react-sigma/graph-search";

type DatasetNode = {
  key: string;
  label: string;
  tag: string;
  cluster: string;
  score?: number; // used for size
  color?: string; // optional override
  [k: string]: any; // keep extensible
};

type Dataset = {
  nodes: DatasetNode[];
  edges: [string, string][];
  clusters?: { key: string; color: string; clusterLabel?: string }[];
  tags?: { key: string; image?: string }[];
};

function useDataset(url: string) {
  const [data, setData] = useState<Dataset | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => !canceled && setData(json))
      .catch((e) => !canceled && setErr(String(e)));
    return () => {
      canceled = true;
    };
  }, [url]);

  return { data, err };
}

function LoadGraph({ graph }: { graph: Graph }) {
  const load = useLoadGraph();
  useEffect(() => {
    load(graph);
  }, [graph, load]);
  return null;
}

function GraphEvents({
  onNodeClick,
}: {
  onNodeClick: (n: string | null) => void;
}) {
  const register = useRegisterEvents();
  useEffect(() => {
    register({
      clickNode: ({ node }) => onNodeClick(node),
      clickStage: () => onNodeClick(null),
    });
  }, [register, onNodeClick]);
  return null;
}

function reducersForFocus(
  graph: Graph,
  focusNode: string | null,
  dim = "#d0d3d8"
) {
  return {
    nodeReducer: (node: string, attrs: any) => {
      if (!focusNode) return attrs;
      const nbrs = new Set(graph.neighbors(focusNode));
      const on = node === focusNode || nbrs.has(node);
      return {
        ...attrs,
        zIndex: on ? 2 : 0,
        label: on ? attrs.label : "",
        color: on ? attrs.color : dim,
      };
    },
    edgeReducer: (edge: string, attrs: any) => {
      if (!focusNode) return attrs;
      const [s, t] = graph.extremities(edge);
      const on = s === focusNode || t === focusNode;
      return { ...attrs, hidden: !on, color: on ? attrs.color : dim };
    },
  };
}

function buildGraphFromDataset(ds: Dataset) {
  // keep undirected + non-multi:
  const g = new Graph({ type: "undirected" });

  const clusterColors = new Map<string, string>();
  ds.clusters?.forEach((c) => clusterColors.set(c.key, c.color));

  // nodes...
  for (const n of ds.nodes) {
    const { key, label, cluster, tag, score, color: colorOverride, ...rest } = n;
    const size = score && score > 0 ? 6 + Math.min(18, Math.log10(score * 1e6 + 10)) : 8;
    const color = colorOverride || clusterColors.get(cluster) || "#9aa1a9";
    g.addNode(key, { label, kind: tag, cluster, size, color, ...rest });
  }

  // ✅ dedupe undirected pairs
  const seen = new Set<string>();
  let i = 0;
  for (const [a, b] of ds.edges) {
    if (!g.hasNode(a) || !g.hasNode(b)) continue;
    const u = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(u)) continue;
    seen.add(u);
    g.addUndirectedEdgeWithKey(`e:${i++}:${u}`, a, b, { size: 1 });
  }

  circular.assign(g, { scale: 1 });
  forceAtlas2.assign(g, { iterations: 250, settings: { gravity: 1, scalingRatio: 12 } });
  return g;
}

function ControlsWithCamera({
  graph,
  setFocus,
  reLayout,
}: {
  graph: Graph;
  setFocus: (id: string | null) => void;
  reLayout: () => void;
}) {
  // ✅ This is now inside SigmaContainer, so hooks are legal:
  const { gotoNode } = useCamera();

  return (
    <ControlsContainer position="bottom-right">
      <ZoomControl />
      <FullScreenControl />
      <GraphSearch
        onChange={(opt: GraphSearchOption | null) => {
          if (!opt) return;
          if ("type" in opt && opt.type === "message") return; // ignore banner rows

          const item = opt as OptionItem; // { id, type: "nodes" | "edges" }
          if (item.type === "nodes") {
            setFocus(item.id);
            gotoNode(item.id, { duration: 400 });
          } else if (item.type === "edges" && graph) {
            const [s] = graph.extremities(item.id);
            if (s) gotoNode(s, { duration: 400 });
          }
        }}
      />
      <button onClick={reLayout} style={btn}>
        Re-run Layout
      </button>
      <button onClick={() => setFocus(null)} style={btn}>
        Clear Focus
      </button>
    </ControlsContainer>
  );
}

function FocusReducers({ graph, focus }: { graph: Graph; focus: string | null }) {
  const setSettings = useSetSettings(); 
  useEffect(() => {
    
    setSettings(reducersForFocus(graph, focus));
  }, [graph, focus, setSettings]);
  return null;
}

export default function FinanceSigmaGraph({
  datasetUrl = "/finance-dataset.json",
}: {
  datasetUrl?: string;
}) {
  const { data, err } = useDataset(datasetUrl);
  const [focus, setFocus] = useState<string | null>(null);

  const graph = useMemo(
    () => (data ? buildGraphFromDataset(data) : null),
    [data]
  );

  if (err)
    return (
      <div style={{ color: "crimson" }}>Failed to load dataset: {err}</div>
    );
  if (!data || !graph) return <div>Loading graph…</div>;

  const reLayout = () => {
    forceAtlas2.assign(graph, {
      iterations: 140,
      settings: { gravity: 1, scalingRatio: 12 },
    });
  };

  return (
    <div
      style={{ display: "grid", gridTemplateColumns: "1fr 320px", height: 600 }}
    >
      <SigmaContainer
        style={{ height: "100%", background: "#0b1220" }}
        settings={{
          renderLabels: true,
          labelColor: { color: "#ffffff" },
          zIndex: true,
        }}
      >
        <GraphSearchContextProvider>
          <LoadGraph graph={graph} />
          <GraphEvents onNodeClick={setFocus} />
          <FocusReducers graph={graph} focus={focus} />
          <ControlsWithCamera
            graph={graph}
            setFocus={setFocus}
            reLayout={reLayout}
          />
        </GraphSearchContextProvider>
      </SigmaContainer>

      <aside style={panel}>
        <h3 style={{ margin: "8px 0" }}>Details</h3>
        {!focus ? (
          <p style={{ opacity: 0.7 }}>Click a node to inspect its neighbors.</p>
        ) : (
          <NodeInfo graph={graph} node={focus} />
        )}

        <hr style={{ margin: "16px 0", borderColor: "#2a3348" }} />
        <h4 style={{ margin: "8px 0" }}>Legend</h4>
        <Legend clusters={data.clusters} />
      </aside>
    </div>
  );
}

function NodeInfo({ graph, node }: { graph: Graph; node: string }) {
  const attrs = graph.getNodeAttributes(node);
  const neighbors = graph
    .neighbors(node)
    .map((n) => graph.getNodeAttribute(n, "label"));
  return (
    <div>
      <div style={kv}>
        <span>Label</span>
        <strong>{attrs.label}</strong>
      </div>
      <div style={kv}>
        <span>Tag</span>
        <code>{attrs.kind}</code>
      </div>
      <div style={kv}>
        <span>Cluster</span>
        <span>{attrs.cluster}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>
          Neighbors
        </div>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {neighbors.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Legend({
  clusters,
}: {
  clusters?: { key: string; color: string; clusterLabel?: string }[];
}) {
  if (!clusters || clusters.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {clusters.map((c) => (
        <div
          key={c.key}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <span
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: c.color,
              display: "inline-block",
            }}
          />
          <span>{c.clusterLabel ?? c.key}</span>
        </div>
      ))}
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "6px 10px",
  marginLeft: 8,
  borderRadius: 8,
  border: "1px solid #2a3348",
  background: "#0f172a",
  color: "#e2e8f0",
  cursor: "pointer",
};

const panel: React.CSSProperties = {
  background: "#0f172a",
  color: "#e2e8f0",
  borderLeft: "1px solid #1f2937",
  padding: 16,
  overflow: "auto",
};

const kv: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: 12,
  padding: "2px 0",
};
