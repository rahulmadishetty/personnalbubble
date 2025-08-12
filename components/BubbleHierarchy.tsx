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

  // Overlay node (the next level view)
  const [overlayName, setOverlayName] = useState<string | null>(null);

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
    if (!overlayName) return null;
    return findNodeByName(tree, overlayName);
  }, [overlayName, tree]);

  // overlay pack
  const overlayPack = useMemo<HierarchyCircularNode<TreeNode> | null>(() => {
    if (!overlayNode || !overlayNode.children?.length) return null;
    const side = Math.min(vw, vh);
    return computePackLayout(
      overlayNode,
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
    // Clicking a child bubble opens overlay (Level N+2)
    if (canDrillDown(n)) {
      setOverlayName(n.data.name);
    }
  };

  const drillIntoOverlay = (n: HierarchyNode<TreeNode>) => {
    // Make overlay node the new focus (down one level)
    setFocusName(n.data.name);
    setOverlayName(null);
  };

  const drillUp = () => {
    // find parent of focusName
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
    setOverlayName(null);
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
                  transform={`translate(${d.x},${d.y})`}
                  style={{ cursor: canDrillDown(d) ? "pointer" : "default" }}
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

      {/* Overlay for Level N+2 */}
      {overlayNode && overlayPack && (
        <div
          onClick={() => setOverlayName(null)}
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
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <strong style={{ fontSize: 16 }}>{overlayNode.name}</strong>
              <span style={{ opacity: 0.7 }}>(tap a bubble to drill down)</span>
            </div>
            <svg
              width={overlayPack.r * 2 + 24}
              height={overlayPack.r * 2 + 24}
              style={{ display: "block" }}
            >
              <g
                transform={`translate(${overlayPack.r + 12},${overlayPack.r + 12})`}
              >
                {overlayPack
                  .descendants()
                  .filter((d) => d.depth === 1) /* immediate children only */
                  .map((d, i) => {
                    const fillKey =
                      d.data.source ??
                      (d.parent?.data.name || "") +
                        (d.data.level ?? "") +
                        (d.data.name ?? "");
                    return (
                      <g
                        key={`${d.data.name}-overlay-${i}`}
                        transform={`translate(${d.x - overlayPack.x},${d.y - overlayPack.y})`}
                        style={{
                          cursor: canDrillDown(d) ? "pointer" : "default",
                        }}
                        onClick={() => drillIntoOverlay(d)}
                      >
                        <circle
                          r={d.r}
                          fill={String(color(fillKey))}
                          fillOpacity={0.9}
                          stroke="rgba(255,255,255,0.2)"
                          strokeWidth={1.25}
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
            <div
              style={{
                marginTop: 8,
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setOverlayName(null)}
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
