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

// ---------- Utilities ----------

/**
 * Convert flat (level/parent) list into a single tree:
 * { name: "root", children: [ level1 nodes … ] }
 * - Validates max level <= 6
 * - Allows multiple level-1 roots
 */
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
      else roots.push(node); // fallback: missing parent -> treat as root
    }
  }
  return { name: "root", children: roots };
}

/** Find a node in the tree by name (used for restoring focus) */
function findNodeByName(root: TreeNode, name: string): TreeNode | null {
  if (root.name === name) return root;
  if (!root.children) return null;
  for (const c of root.children) {
    const found = findNodeByName(c, name);
    if (found) return found;
  }
  return null;
}

/** Compute a packed layout for a given subtree */
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

/** Clone a node with only depth <= maxDepth (relative to this node) */
function cloneDepthLimited(node: TreeNode, maxDepth: number): TreeNode {
  const out: TreeNode = { ...node };
  if (maxDepth <= 0 || !node.children?.length) {
    out.children = [];
    return out;
  }
  out.children = (node.children || []).map((c) =>
    cloneDepthLimited(c, maxDepth - 1)
  );
  return out;
}

/** Assign values by relative depth: depth0>depth1>depth2 for clear sizes */
function assignDepthValues(node: TreeNode, depth = 0): void {
  // tweak these to taste
  const weights = [1000, 300, 80]; // parent, children, grandchildren
  node.value = weights[Math.min(depth, weights.length - 1)];
  (node.children || []).forEach((c) => assignDepthValues(c, depth + 1));
}

// ---------- Component ----------

export default function BubbleHierarchy({
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

  // Focus node (the "current level" node whose children we show)
  // Start at synthetic root (shows all level-1 items)
  const [focusName, setFocusName] = useState<string>("root");

  // Overlay (“overlay focus” + “is open”)
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [overlayFocusName, setOverlayFocusName] = useState<string | null>(null);

  // Re-find focus node from the immutable tree
  const focusNode = useMemo(() => {
    const node = findNodeByName(tree, focusName);
    return node ?? tree;
  }, [tree, focusName]);

  // Layout sizing (responsive container)
  const containerRef = useRef<HTMLDivElement>(null);
  const { w, h } = useResizeObserver(containerRef);
  const vw = Math.max(320, w || width);
  const vh = Math.max(360, h || height);

  // Compute main pack for focusNode.children (Level N+1)
  const packRoot = useMemo<HierarchyCircularNode<TreeNode>>(() => {
    // If focus has children, pack that subtree; else pack focus itself
    const target: TreeNode =
      focusNode?.children && focusNode.children.length > 0
        ? { ...focusNode, children: focusNode.children }
        : focusNode || tree;

    return computePackLayout(target, vw, vh, padding);
  }, [focusNode, vw, vh, padding, tree]);

  // Compute overlay pack for overlay node (Level N+2)
  const overlayNode = useMemo(() => {
    if (!overlayFocusName) return null;
    return findNodeByName(tree, overlayFocusName);
  }, [overlayFocusName, tree]);

  // Used only to force re-animations when focus changes
  const [overlayAnimKey, setOverlayAnimKey] = useState(0);
  useEffect(() => {
    if (isOverlayOpen && overlayFocusName) setOverlayAnimKey((k) => k + 1);
  }, [isOverlayOpen, overlayFocusName]);

  // overlay pack
  const overlayPack = useMemo<HierarchyCircularNode<TreeNode> | null>(() => {
    if (!overlayNode) return null;
    // limit to 3 levels: focus (0), children (1), grandchildren (2)
    const limited = cloneDepthLimited(overlayNode, 2);
    assignDepthValues(limited); // ensure parent > children > grandchildren

    const side = Math.min(vw, vh);
    return computePackLayout(
      limited,
      Math.floor(side * 0.8),
      Math.floor(side * 0.8),
      Math.max(3, padding - 2)
    );
  }, [overlayNode, vw, vh, padding]);

  // Breadcrumb path from root → focus
  const breadcrumb = useMemo(() => {
    const path: string[] = [];
    function dfs(n: TreeNode, trail: string[]) {
      if (n.name === focusName) {
        breadcrumbFound = true;
        for (const t of trail) path.push(t);
        path.push(n.name);
        return;
      }
      for (const c of n.children || []) {
        if (breadcrumbFound) return;
        dfs(c, [...trail, n.name]);
      }
    }
    let breadcrumbFound = false;
    dfs(tree, []);
    // Cleanup synthetic "root" for display
    return path.filter((x) => x !== "root");
  }, [tree, focusName]);

  // Click handlers
  const canDrillDown = (n: HierarchyNode<TreeNode>) =>
    n.data.children && n.data.children.length > 0;

  const handleBubbleClick = (n: HierarchyNode<TreeNode>) => {
    // Clicking a child bubble opens overlay with Parent, Children and Grandchildren
    if (canDrillDown(n)) {
      setOverlayFocusName(n.data.name);
      setIsOverlayOpen(true);
    }
  };

  const overlayDrillDown = (n: HierarchyNode<TreeNode>) => {
    if (n.data.children && n.data.children.length > 0) {
      setOverlayFocusName(n.data.name);
    }
  };

  const overlayDrillUp = () => {
    if (!overlayFocusName) return;
    const p = findParentName(tree, overlayFocusName);
    if (p) setOverlayFocusName(p);
    else setIsOverlayOpen(false); // if somehow at the top, close
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
              onClick={overlayDrillUp}
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

      {/* Main SVG */}
      <svg width={vw} height={vh} style={{ display: "block" }}>
        <g>
          {packRoot
            .descendants()
            .filter(
              (d) => d.depth === 1
            ) /* show only immediate children bubbles */
            .map((d, i) => {
              const fillKey =
                d.data.source ??
                (d.parent?.data.name || "") +
                  (d.data.level ?? "") +
                  (d.data.name ?? "");

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

      {/* Overlay / Modal */}
      {isOverlayOpen && overlayNode && overlayPack && (
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
            animation: "fadeIn 160ms ease-out",
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
              width: "min(86vw, 960px)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
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
                  (click child to drill; click outside to close)
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

            {/* Animated container keyed by focus to trigger CSS transitions */}
            <div
              key={overlayAnimKey}
              style={{
                display: "grid",
                placeItems: "center",
                padding: 8,
                transition:
                  "transform 320ms cubic-bezier(.2,.8,.2,1), opacity 200ms ease",
                transform: "scale(1)", // (key flip triggers transition)
              }}
            >
              <svg
                width={overlayPack.r * 2 + 24}
                height={overlayPack.r * 2 + 24}
                style={{ display: "block" }}
              >
                <g
                  style={{
                    transform: `translate(${overlayPack.r + 12}px, ${overlayPack.r + 12}px)`,
                  }}
                >
                  {overlayPack
                    .descendants()
                    // show parent (0), children (1), grandchildren (2)
                    .filter((d) => d.depth <= 2)
                    .map((d, i) => {
                      const fillKey =
                        d.data.source ??
                        `${d.parent?.data.name ?? ""}-${d.data.level ?? ""}-${d.data.name ?? ""}`;

                      // Animate position with CSS transform (smooth on drill)
                      const posStyle: React.CSSProperties = {
                        transition: "transform 320ms cubic-bezier(.2,.8,.2,1)",
                        transform: `translate(${d.x - overlayPack.x}px, ${d.y - overlayPack.y}px)`,
                        cursor:
                          d.data.children && d.data.children.length > 0
                            ? "pointer"
                            : "default",
                      };

                      return (
                        <g
                          key={`${d.data.name}-ov-${i}`}
                          style={posStyle}
                          onClick={() => overlayDrillDown(d)}
                        >
                          <circle
                            r={d.r}
                            fill={String(color(fillKey))}
                            fillOpacity={
                              d.depth === 0 ? 0.75 : d.depth === 1 ? 0.88 : 0.95
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
                                d.depth === 0
                                  ? Math.max(12, Math.min(22, d.r / 2.4))
                                  : d.depth === 1
                                    ? Math.max(11, Math.min(18, d.r / 2.8))
                                    : Math.max(10, Math.min(16, d.r / 3.2)),
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
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
        .zoomIn {
          animation: fadeIn 160ms ease-out;
          will-change: transform, opacity;
        }
        /* Smoothen main canvas bubbles on focus/resize */
        svg g, svg circle {
          transition: transform 220ms ease, r 220ms ease, opacity 200ms ease;
        }
      `}</style>
    </div>
  );
}
