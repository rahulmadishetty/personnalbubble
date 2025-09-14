"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  hierarchy as d3Hierarchy,
  pack as d3Pack,
  HierarchyCircularNode,
} from "d3-hierarchy";
import { scaleOrdinal } from "d3-scale";
import { schemeCategory10 } from "d3-scale-chromatic";

/** ---------- Types ---------- */
type FlatItem = {
  name: string;
  level: number; // 1..6
  parent?: string;
  source?: string;
  value?: number; // optional weight; defaults to 1
};

type TreeNode = {
  name: string;
  level?: number;
  parent?: string;
  source?: string;
  value?: number;
  children?: TreeNode[];
};

type PackedBubblesProps = {
  data: FlatItem[];
  padding?: number; // spacing between circles
  bg?: string; // background color
};

/** ---------- Utils ---------- */
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
    if (node.level === 1) roots.push(node);
    else {
      const p = node.parent ? byName.get(node.parent) : undefined;
      if (p) p.children!.push(node);
      else roots.push(node);
    }
  }
  return { name: "root", children: roots };
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

/** ---------- Component ---------- */
export default function CircularPacking({
  data,
  padding = 6,
  bg = "#0b1220",
}: PackedBubblesProps) {
  const tree: TreeNode = useMemo(() => nestFlatToTree(data), [data]);
  const color = useMemo(
    () => scaleOrdinal<string, string>(schemeCategory10),
    []
  );

  // container & responsive sizing
  const containerRef = useRef<HTMLDivElement>(null);
  const { w, h } = useResizeObserver(containerRef);
  const side = Math.max(320, Math.min(w || 900, h || 600)); // square canvas

  // build packed layout
  const packRoot = useMemo<HierarchyCircularNode<TreeNode>>(() => {
    const root = d3Hierarchy(tree)
      .sum((d) => (typeof d.value === "number" ? d.value : 1))
      .sort((a, b) => (b.value || 0) - (a.value || 0));
    return d3Pack<TreeNode>().size([side, side]).padding(padding)(
      root
    ) as HierarchyCircularNode<TreeNode>;
  }, [tree, side, padding]);

  // zoom focus node
  const [focus, setFocus] = useState<HierarchyCircularNode<TreeNode> | null>(
    null
  );
  useEffect(() => setFocus(packRoot), [packRoot]);

  // compute transform to center/zoom on focus
  const cx = side / 2;
  const cy = side / 2;
  const k = focus ? side / (focus.r * 2) : 1;
  const tx = focus ? cx - focus.x * k : 0;
  const ty = focus ? cy - focus.y * k : 0;

  // click handlers
  const handleBackgroundClick = () => setFocus(packRoot);
  const handleNodeClick = (d: HierarchyCircularNode<TreeNode>) => {
    if (focus === d && d.parent)
      setFocus(d.parent); // click again → zoom out one level
    else setFocus(d);
  };

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        background: bg,
        color: "#e3e7ef",
        borderRadius: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <svg width={side} height={side} style={{ display: "block" }}>
        {/* background for easy zoom-out */}
        <rect
          x={0}
          y={0}
          width={side}
          height={side}
          fill="transparent"
          onClick={handleBackgroundClick}
        />

        {/* Zooming layer */}
        <g
          style={{
            transform: `translate(${tx}px, ${ty}px) scale(${k})`,
            transition: "transform 420ms cubic-bezier(.2,.8,.2,1)",
          }}
        >
          {packRoot
            .descendants()
            // classic circle-packing usually hides the outermost root circle
            .filter((d) => d.depth > 0)
            .map((d, i) => {
              // color by top-level ancestor for stable grouping
              const top =
                d.ancestors().length > 1
                  ? d.ancestors()[d.ancestors().length - 2].data.name
                  : "root";
              const isBranch = !!d.children && d.children.length > 0;
              const labelVisible = d.r > 14;

              return (
                <g
                  key={`${d.data.name}-${i}`}
                  style={{ transform: `translate(${d.x}px, ${d.y}px)` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isBranch) handleNodeClick(d);
                  }}
                >
                  <circle
                    r={d.r}
                    fill={String(color(top))}
                    fillOpacity={isBranch ? 0.78 : 0.9}
                    stroke="rgba(255,255,255,0.18)"
                    strokeWidth={1.2}
                    style={{ cursor: isBranch ? "pointer" : "default" }}
                  />
                  {labelVisible && (
                    <text
                      textAnchor="middle"
                      dy="0.35em"
                      style={{
                        pointerEvents: "none",
                        fill: "#fff",
                        fontWeight: 600,
                        fontSize: Math.max(10, Math.min(18, d.r / 3)),
                        filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.7))",
                      }}
                    >
                      {d.data.name}
                    </text>
                  )}
                  <title>{d.data.name}</title>
                </g>
              );
            })}
        </g>
      </svg>

      {/* small help hint (optional) */}
      <div
        style={{
          position: "absolute",
          left: 12,
          bottom: 10,
          opacity: 0.75,
          fontSize: 12,
        }}
      >
        Click a larger bubble to zoom in. Click background (or the same bubble
        again) to zoom out.
      </div>
    </div>
  );
}
