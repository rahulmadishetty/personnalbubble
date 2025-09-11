"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  hierarchy as d3Hierarchy,
  pack as d3Pack,
  HierarchyCircularNode,
  HierarchyNode,
} from "d3-hierarchy";
import { scaleOrdinal } from "d3-scale";
import { schemeCategory10 } from "d3-scale-chromatic";

// ---------- Types ----------
type FlatItem = {
  name: string;
  level: number; // 1..6
  parent?: string;
  source?: string;
  value?: number; // optional weight (defaults to 1)
};

type TreeNode = {
  name: string;
  level?: number;
  parent?: string;
  source?: string;
  value?: number;
  children?: TreeNode[];
};

type BubbleHierarchyProps = {
  data: FlatItem[];
  width?: number;
  height?: number;
  padding?: number;
  bg?: string;
};

type PlacedBubble = {
  id: string;
  name: string;
  depth: 0 | 1 | 2; // parent, child, grandchild
  data: TreeNode;
  r: number;
  x: number;
  y: number;
  parentId?: string;
};

// ---------- Utilities ----------
function nestFlatToTree(items: FlatItem[]): TreeNode {
  const byName = new Map<string, TreeNode>();
  for (const it of items) {
    if (it.level < 1 || it.level > 6) {
      throw new Error(
        `Level out of range (1..6) for "${it.name}" - got ${it.level}`
      );
    }
    byName.set(it.name, { ...it, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of byName.values()) {
    if (node.level === 1) {
      roots.push(node);
    } else {
      const p = node.parent ? byName.get(node.parent) : undefined;
      if (p) p.children!.push(node);
      else roots.push(node);
    }
  }
  return { name: "root", children: roots };
}

function findNodeByName(root: TreeNode, name: string): TreeNode | null {
  if (root.name === name) return root;
  if (!root.children) return null;
  for (const c of root.children) {
    const found = findNodeByName(c, name);
    if (found) return found;
  }
  return null;
}

function findParentName(root: TreeNode, targetName: string): string | null {
  function dfs(cur: TreeNode, parent: TreeNode | null): string | null {
    if (cur.name === targetName) return parent?.name ?? null;
    for (const c of cur.children || []) {
      const r = dfs(c, cur);
      if (r) return r;
    }
    return null;
  }
  return dfs(root, null);
}

/** d3.pack for main view (unchanged) */
function computePackLayout(
  subtree: TreeNode,
  width: number,
  height: number,
  padding: number
): HierarchyCircularNode<TreeNode> {
  const root = d3Hierarchy(subtree)
    .sum((d) => (typeof d.value === "number" ? d.value : 1))
    .sort((a, b) => (b.value || 0) - (a.value || 0));
  return d3Pack<TreeNode>().size([width, height]).padding(padding)(
    root
  ) as HierarchyCircularNode<TreeNode>;
}

type AnyRef<T> = React.RefObject<T | null> | React.MutableRefObject<T | null>;
function useResizeObserver<T extends HTMLElement>(
  ref: AnyRef<T>
): { w: number; h: number } {
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ w: width, h: height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return size;
}

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

/**
 * Bubble PACKING layout for 3 levels (parent center, children around,
 * grandchildren around each child). No nesting—everything is "beside".
 */
/**
 * Bubble PACKING layout for 3 levels (parent center, children around,
 * grandchildren around each child on the OUTER side only).
 * Ensures grandchildren:
 *  - never sit between parent and child
 *  - avoid overlapping parent/children
 *  - distribute along an outward arc around each child
 */
function computeBubblePackingLayout(
  focus: TreeNode,
  side: number
): { nodes: PlacedBubble[]; side: number } {
  const cx = side / 2;
  const cy = side / 2;

  const children = (focus.children || []) as TreeNode[];
  const rParent = clamp(side * 0.16, 40, 120);

  // ---- Place CHILDREN on a ring around the parent (same as before) ----
  const childInfo = children.map((c) => {
    const gc = c.children?.length ?? 0;
    // child radius scales a bit with number of grandchildren
    const r = clamp(
      side * 0.06 + gc * (side * 0.005),
      side * 0.05,
      side * 0.12
    );
    return { node: c, r, gc };
  });

  const gapC = clamp(side * 0.008, 6, 16);
  const circumferenceNeeded = childInfo.reduce(
    (acc, it) => acc + (2 * it.r + gapC),
    0
  );
  const baseRing =
    rParent + (childInfo.reduce((m, it) => Math.max(m, it.r), 0) || 0) + 28;
  const ringR = Math.max(baseRing, circumferenceNeeded / (2 * Math.PI));
  const ringCirc = 2 * Math.PI * ringR;

  let theta = 0;
  type ChildPlaced = PlacedBubble & { angle: number };
  const placedChildren: ChildPlaced[] = childInfo.map((it) => {
    const arcLen = 2 * it.r + gapC;
    const delta = (arcLen / ringCirc) * 2 * Math.PI;
    const mid = theta + delta / 2;
    const x = cx + ringR * Math.cos(mid);
    const y = cy + ringR * Math.sin(mid);
    theta += delta;
    return {
      id: it.node.name,
      name: it.node.name,
      depth: 1,
      data: it.node,
      r: it.r,
      x,
      y,
      parentId: focus.name,
      angle: mid, // <— angle from parent->child (used for outward arc)
    };
  });

  // ---- Place GRANDCHILDREN on outward arc around each child ----
  const gapG = clamp(side * 0.006, 4, 12);
  const minGrandR = clamp(side * 0.042, 13, 32); // floor size; can still scale up if room allows
  const arcSpan = (150 * Math.PI) / 180; // 140° outward arc (tweak 120–160 for aesthetics)
  const safety = 6; // padding to avoid touching child/neighbor

  const placedGrandchildren: PlacedBubble[] = [];

  // Quick neighbor lookup to cap ring size so grandkids don't hit adjacent children
  const childCount = placedChildren.length;
  function neighborRingCap(ch: ChildPlaced, rG: number) {
    if (childCount <= 1) return Infinity;
    const idx = placedChildren.findIndex((p) => p.id === ch.id);
    const prev = placedChildren[(idx - 1 + childCount) % childCount];
    const next = placedChildren[(idx + 1) % childCount];

    const distPrev = Math.hypot(ch.x - prev.x, ch.y - prev.y);
    const distNext = Math.hypot(ch.x - next.x, ch.y - next.y);

    // triangle inequality safe upper bound: ringG <= dist - neighbor.r - rG - safety
    const capPrev = distPrev - prev.r - rG - safety;
    const capNext = distNext - next.r - rG - safety;
    return Math.max(0, Math.min(capPrev, capNext));
  }

  for (const ch of placedChildren) {
    const gcNodes = (ch.data.children || []) as TreeNode[];
    const N = gcNodes.length;
    if (!N) continue;

    // Start with a candidate grandchild radius (could be tuned per child size)
    let rG = minGrandR;

    // We want all N grandchildren on an outward arc of length: L = ringG * arcSpan.
    // Needed arc length (no overlap): N * (2*rG + gapG). So ringG >= needed / arcSpan.
    const neededArcLen = N * (2 * rG + gapG);

    // Lower bound so grandkids don't touch child or parent:
    // - not touching child: ringG >= ch.r + rG + safety
    // - parent is always further away on outward side (child is already outside the parent),
    //   so outward-only arc guarantees we never sit "between" parent & child.
    let ringGmin = Math.max(neededArcLen / arcSpan, ch.r + rG + safety);

    // Upper bound so grandkids don't hit neighboring children
    let ringGmax = neighborRingCap(ch, rG);

    // If we don't have enough room, try reducing rG proportionally once
    if (ringGmax < ringGmin && isFinite(ringGmax) && ringGmax > 0) {
      const ratio = clamp(ringGmax / ringGmin, 0.65, 1); // don't shrink below ~55%
      rG = Math.max(6, rG * ratio);
      const needed2 = N * (2 * rG + gapG);
      ringGmin = Math.max(needed2 / arcSpan, ch.r + rG + safety);
      ringGmax = neighborRingCap(ch, rG);
    }

    // Final ring radius for grandchildren around this child
    let ringG = Math.max(ringGmin, 0);
    if (isFinite(ringGmax))
      ringG = Math.min(ringG, Math.max(ringGmax, ringGmin));

    // Distribute grandkids evenly along outward arc centered at ch.angle
    // Arc center = ch.angle (from parent to child). We use symmetric placement across the arc.
    // Step by arc-length: Δθ_i ≈ (2*rG + gapG) / ringG
    const stepTheta = (2 * rG + gapG) / ringG;
    const totalTheta = (N - 1) * stepTheta; // spread N points by step
    const thetaStart = ch.angle - totalTheta / 2; // centered on outward direction

    for (let i = 0; i < N; i++) {
      const theta = thetaStart + i * stepTheta;
      const gx = ch.x + ringG * Math.cos(theta);
      const gy = ch.y + ringG * Math.sin(theta);

      placedGrandchildren.push({
        id: `${ch.id}::${gcNodes[i].name}`,
        name: gcNodes[i].name,
        depth: 2,
        data: gcNodes[i],
        r: rG,
        x: gx,
        y: gy,
        parentId: ch.id,
      });
    }
  }

  // Parent at center (render underneath)
  const parentPlaced: PlacedBubble = {
    id: focus.name,
    name: focus.name,
    depth: 0,
    data: focus,
    r: rParent,
    x: cx,
    y: cy,
  };

  const nodes = [parentPlaced, ...placedChildren, ...placedGrandchildren];
  return { nodes, side };
}

// ---------- Component ----------
export default function NewBubbleHierarchy({
  data,
  width = 900,
  height = 600,
  padding = 6,
  bg = "#0b1220",
}: BubbleHierarchyProps) {
  // Prepare tree
  const tree: TreeNode = useMemo(() => nestFlatToTree(data), [data]);
  const color = React.useMemo(
    () => scaleOrdinal<string, string>(schemeCategory10),
    []
  );

  // Main view focus (unchanged)
  const [focusName, setFocusName] = useState<string>("root");

  // Overlay modal state (updated)
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [overlayFocusName, setOverlayFocusName] = useState<string | null>(null);

  // Re-find nodes
  const focusNode = useMemo(
    () => findNodeByName(tree, focusName) ?? tree,
    [tree, focusName]
  );
  const overlayNode = useMemo(
    () => (overlayFocusName ? findNodeByName(tree, overlayFocusName) : null),
    [overlayFocusName, tree]
  );

  // Layout sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const { w, h } = useResizeObserver(containerRef);
  const vw = Math.max(320, w || width);
  const vh = Math.max(360, h || height);

  // Main view (still circle-packed for a clean "catalog" of the next level)
  const packRoot = useMemo<HierarchyCircularNode<TreeNode>>(() => {
    const target: TreeNode =
      focusNode?.children && focusNode.children.length > 0
        ? { ...focusNode, children: focusNode.children }
        : focusNode || tree;
    return computePackLayout(target, vw, vh, padding);
  }, [focusNode, vw, vh, padding, tree]);

  // Breadcrumb path from root → focus
  const breadcrumb = useMemo(() => {
    const path: string[] = [];
    let found = false;
    function dfs(n: TreeNode, trail: string[]) {
      if (n.name === focusName) {
        found = true;
        for (const t of trail) path.push(t);
        path.push(n.name);
        return;
      }
      for (const c of n.children || []) {
        if (found) return;
        dfs(c, [...trail, n.name]);
      }
    }
    dfs(tree, []);
    return path.filter((x) => x !== "root");
  }, [tree, focusName]);

  // Click handlers (main view)
  const canDrillDown = (n: HierarchyNode<TreeNode>) =>
    !!(n.data.children && n.data.children.length > 0);
  const handleBubbleClick = (n: HierarchyNode<TreeNode>) => {
    if (canDrillDown(n)) {
      setOverlayFocusName(n.data.name);
      setIsOverlayOpen(true);
    }
  };

  // Overlay drill handlers
  const overlayDrillDown = (n: PlacedBubble) => {
    const target = findNodeByName(tree, n.name);
    if (target?.children && target.children.length > 0) {
      setOverlayFocusName(n.name);
    }
  };
  const overlayDrillUp = () => {
    if (!overlayFocusName) return;
    const p = findParentName(tree, overlayFocusName);
    if (p) setOverlayFocusName(p);
    else setIsOverlayOpen(false);
  };

  // Re-animate on overlay focus change
  const [overlayAnimKey, setOverlayAnimKey] = useState(0);
  useEffect(() => {
    if (isOverlayOpen && overlayFocusName) setOverlayAnimKey((k) => k + 1);
  }, [isOverlayOpen, overlayFocusName]);

  // Bubble-packing layout for modal (parent + children + grandchildren)
  const overlayLayout = useMemo(() => {
    if (!overlayNode) return null;
    const side = Math.floor(Math.min(vw, vh) * 0.9);
    return computeBubblePackingLayout(overlayNode, side);
  }, [overlayNode, vw, vh]);

  // Main drill up (header button)
  const drillUp = () => {
    function findParent(
      current: TreeNode,
      parent: TreeNode | null
    ): string | null {
      if (current.name === focusName) return parent?.name || "root";
      for (const c of current.children || []) {
        const res = findParent(c, current);
        if (res) return res;
      }
      return null;
    }
    const parentName = findParent(tree, null) || "root";
    setFocusName(parentName);
    // don't touch modal here
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minHeight: vh,
        background: bg,
        color: "#e3e7ef",
        position: "relative",
        overflow: "hidden",
        borderRadius: 12,
      }}
    >
      {/* Header / Breadcrumb */}
      <div
        style={{
          position: "absolute",
          inset: "0 0 auto 0",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0))",
          zIndex: 2,
        }}
      >
        <strong style={{ opacity: 0.85 }}>Path:</strong>
        {breadcrumb.length === 0 ? (
          <span>root</span>
        ) : (
          <>
            <button
              onClick={drillUp}
              title="Drill up"
              style={{
                border: "1px solid #3a4157",
                background: "rgba(255,255,255,0.08)",
                color: "inherit",
                borderRadius: 8,
                padding: "2px 8px",
                cursor: "pointer",
              }}
            >
              ← Up
            </button>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {breadcrumb.map((b, i) => (
                <span
                  key={b}
                  style={{ opacity: i === breadcrumb.length - 1 ? 1 : 0.7 }}
                >
                  {b}
                  {i < breadcrumb.length - 1 && " / "}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main SVG (unchanged layout, animated transform for smoothness) */}
      <svg width={vw} height={vh} style={{ display: "block" }}>
        <g>
          {packRoot
            .descendants()
            .filter((d) => d.depth === 1)
            .map((d, i) => {
              const fillKey =
                d.data.source ??
                `${d.parent?.data.name ?? ""}${d.data.level ?? ""}${d.data.name ?? ""}`;
              return (
                <g
                  key={`${d.data.name}-${i}`}
                  style={{
                    transform: `translate(${d.x}px, ${d.y}px)`,
                    transition: "transform 320ms cubic-bezier(.2,.8,.2,1)",
                    cursor: canDrillDown(d) ? "pointer" : "default",
                  }}
                  onClick={() => handleBubbleClick(d)}
                >
                  <circle
                    r={d.r}
                    fill={String(color(fillKey))}
                    fillOpacity={0.85}
                    stroke="rgba(255,255,255,0.15)"
                    strokeWidth={1.5}
                  />
                  <text
                    textAnchor="middle"
                    dy="0.35em"
                    style={{
                      pointerEvents: "none",
                      fill: "#fff",
                      fontSize: Math.max(10, Math.min(18, d.r / 3)),
                      fontWeight: 600,
                      filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.7))",
                    }}
                  >
                    {d.data.name}
                  </text>
                </g>
              );
            })}
        </g>
      </svg>

      {/* Overlay / Modal: Bubble PACKING hierarchy (3 levels visible) */}
      {isOverlayOpen && overlayNode && overlayLayout && (
        <div
          onClick={() => setIsOverlayOpen(false)}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(8,12,24,0.6)",
            backdropFilter: "blur(2px)",
            display: "grid",
            placeItems: "center",
            zIndex: 5,
            animation: "fadeIn 1000ms ease-out",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#0e1529",
              border: "1px solid #2b3350",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
              width: "min(88vw, 1000px)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 8,
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={overlayDrillUp}
                  title="Drill up"
                  style={{
                    border: "1px solid #3a4157",
                    background: "rgba(255,255,255,0.08)",
                    color: "inherit",
                    borderRadius: 8,
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  ← Up
                </button>
                <strong style={{ fontSize: 16 }}>{overlayNode.name}</strong>
                <span style={{ opacity: 0.7 }}>
                  (click a bubble to drill; click outside to close)
                </span>
              </div>
              <button
                onClick={() => setIsOverlayOpen(false)}
                style={{
                  border: "1px solid #3a4157",
                  background: "rgba(255,255,255,0.08)",
                  color: "inherit",
                  borderRadius: 8,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            {/* Animated container keyed to reflow on focus change */}
            <div
              key={overlayAnimKey}
              style={{
                display: "grid",
                placeItems: "center",
                padding: 8,
                transition:
                  "transform 320ms cubic-bezier(.2,.8,.2,1), opacity 200ms ease",
                transform: "scale(1)",
                animation: "fadeIn 1000ms ease-out",
              }}
            >
              <svg
                width={overlayLayout.side}
                height={overlayLayout.side}
                style={{ display: "block" }}
              >
                <g>
                  {overlayLayout.nodes.map((n, i) => {
                    const fillKey =
                      n.data.source ??
                      `${n.parentId ?? ""}-${n.data.level ?? ""}-${n.data.name ?? ""}`;
                    return (
                      <g
                        key={`${n.id}-${i}`}
                        style={{
                          transform: `translate(${n.x}px, ${n.y}px)`,
                          transition:
                            "transform 320ms cubic-bezier(.2,.8,.2,1)",
                          cursor:
                            n.data.children && n.data.children.length > 0
                              ? "pointer"
                              : "default",
                        }}
                        onClick={() => overlayDrillDown(n)}
                      >
                        <circle
                          r={n.r}
                          fill={String(color(fillKey))}
                          fillOpacity={
                            n.depth === 0 ? 0.75 : n.depth === 1 ? 0.88 : 0.95
                          }
                          stroke="rgba(255,255,255,0.2)"
                          strokeWidth={1.25}
                        />
                        <text
                          textAnchor="middle"
                          dy="0.35em"
                          style={{
                            pointerEvents: "none",
                            fill: "#fff",
                            fontSize:
                              n.depth === 0
                                ? Math.max(12, Math.min(22, n.r / 2.4))
                                : n.depth === 1
                                  ? Math.max(11, Math.min(18, n.r / 2.8))
                                  : Math.max(10, Math.min(16, n.r / 3.2)),
                            fontWeight: 600,
                            filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.7))",
                          }}
                        >
                          {n.name}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
