"use client";

import React, { useEffect, useMemo, useRef } from "react";
import * as d3 from "d3";

/** ---------- Types ---------- */
type FlatItem = {
  name: string;
  level: number; // 1..6
  parent?: string;
  source?: string;
  value?: number; // optional weight
};

type Node = d3.SimulationNodeDatum & {
  id: string;
  label: string;
  group: string;
  level: number;
  r: number;
  source?: string;
  parent?: string;
  value?: number;
};

type ForcePackedBubblesProps = {
  data: FlatItem[];
  groupBy?: "source" | "level" | "parent" | "none";
  bg?: string;
  collidePadding?: number; // extra spacing between bubbles
};

/** ---------- Resize Observer ---------- */
function useResizeObserver<T extends HTMLElement>(
  ref: React.RefObject<T | null> | React.MutableRefObject<T | null>
): { w: number; h: number } {
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        setSize({ w: width, h: height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return size;
}

/** ---------- Component ---------- */
export default function PackedBubbles({
  data,
  groupBy = "source",
  bg = "#0b1220",
  collidePadding = 2,
}: ForcePackedBubblesProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { w, h } = useResizeObserver(wrapRef);
  const width = Math.max(320, w || 900);
  const height = Math.max(360, h || 600);

  // ---------- Preprocess nodes ----------
  // Build a radius based on optional value (sqrt scale) or level fallback
  const valueExtent = d3.extent(data.map((d) => d.value ?? 1)) as [
    number,
    number,
  ];
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  const rScale = useMemo(() => {
    const [vmin, vmax] = valueExtent || [1, 1];
    if (vmin === vmax) {
      // no values or all equal → use level-based sizing
      return (d: FlatItem) => clamp(10, 36 - (d.level ?? 3) * 4, 42);
    }
    const s = d3
      .scaleSqrt()
      .domain([Math.max(0.1, vmin), vmax])
      .range([10, 42]);
    return (d: FlatItem) => s(d.value ?? 1);
  }, [valueExtent, data]);

  const nodes: Node[] = useMemo(() => {
    // Decide grouping key
    const key = (d: FlatItem) => {
      if (groupBy === "source") return d.source ?? "Unknown";
      if (groupBy === "level") return `L${d.level}`;
      if (groupBy === "parent") return d.parent ?? "(no parent)";
      return "All";
    };

    return data.map((d, i) => ({
      id: `${d.source ?? "unknown"}::${d.level}::${d.parent ?? "-"}::${d.name}`,
      label: d.name,
      group: key(d),
      level: d.level,
      r: rScale(d),
      x: Math.random() * width,
      y: Math.random() * height,
      vx: 0,
      vy: 0,
      source: d.source,
      parent: d.parent,
      value: d.value,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, groupBy, rScale, width, height]);

  // Unique groups & scales for clustering
  const groups = useMemo(
    () => Array.from(new Set(nodes.map((n) => n.group))),
    [nodes]
  );
  const xScale = useMemo(() => {
    if (groupBy === "none") return () => width / 2;
    return d3
      .scalePoint<string>()
      .domain(groups)
      .range([Math.max(80, width * 0.1), Math.min(width - 80, width * 0.9)]);
  }, [groups, groupBy, width]);

  const color = useMemo(
    () => d3.scaleOrdinal<string, string>(d3.schemeTableau10).domain(groups),
    [groups]
  );

  // ---------- D3 rendering & simulation ----------
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // clear previous

    // Root group
    const g = svg.append("g");

    // Legend (top)
    if (groupBy !== "none") {
      const legend = g.append("g").attr("transform", `translate(12, 12)`);
      const L_SIZE = 12;
      groups.forEach((grp, i) => {
        const row = legend
          .append("g")
          .attr("transform", `translate(0, ${i * 18})`);
        row
          .append("rect")
          .attr("rx", 3)
          .attr("ry", 3)
          .attr("width", L_SIZE)
          .attr("height", L_SIZE)
          .attr("fill", color(grp))
          .attr("fill-opacity", 0.9);
        row
          .append("text")
          .attr("x", L_SIZE + 6)
          .attr("y", L_SIZE - 2)
          .attr("fill", "#e3e7ef")
          .attr("font-size", 12)
          .text(grp);
      });
    }

    // Node groups
    const nodeG = g
      .selectAll("g.node")
      .data(nodes, (d: any) => d.id)
      .join("g")
      .attr("class", "node")
      .style("cursor", "grab")
      .call(
        d3
          .drag<SVGGElement, Node>()
          .on("start", function (event, d) {
            d3.select(this).style("cursor", "grabbing");
            if (!event.active) sim.alphaTarget(0.15).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", function (event, d) {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", function (_event, d) {
            d3.select(this).style("cursor", "grab");
            if (!(_event as any).active) sim.alphaTarget(0);
            // release fixed position so it rejoins the pack
            d.fx = null as unknown as number;
            d.fy = null as unknown as number;
          }) as any
      );

    nodeG
      .append("circle")
      .attr("r", (d: any) => d.r)
      .attr("fill", (d: any) => color(d.source))
      .attr("fill-opacity", 0.9)
      .attr("stroke", "rgba(255,255,255,0.22)")
      .attr("stroke-width", 1.2);

    nodeG
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("pointer-events", "none")
      .attr("fill", "#fff")
      .attr("font-weight", 600)
      .attr("font-size", (d: any) => Math.max(10, Math.min(16, d.r / 3)))
      .style("filter", "drop-shadow(0 1px 1px rgba(0,0,0,0.65))")
      .text((d: any) => (d.r >= 13 ? d.label : "")); // hide labels on tiny bubbles

    // Position updater
    const ticked = () => {
      nodeG.attr("transform", (d: any) => `translate(${d.x!},${d.y!})`);
    };

    // Simulation
    const sim = d3
      .forceSimulation(nodes as any)
      .force(
        "x",
        d3
          .forceX<Node>((d) =>
            groupBy === "none" ? width / 2 : xScale(d.group)!
          )
          .strength(0.08)
      )
      .force("y", d3.forceY<Node>(height / 2).strength(0.08))
      .force(
        "collide",
        d3
          .forceCollide<Node>()
          .radius((d) => d.r + collidePadding)
          .iterations(2)
      )
      .force("charge", d3.forceManyBody<Node>().strength(0)) // neutral charge; packing comes from collide
      .alpha(0.9)
      .alphaDecay(0.05)
      .on("tick", ticked);

    // Centering & padding walls (keep inside viewport)
    const padding = 4;
    sim.on("tick", () => {
      nodes.forEach((n) => {
        n.x = Math.max(n.r + padding, Math.min(width - n.r - padding, n.x!));
        n.y = Math.max(n.r + padding, Math.min(height - n.r - padding, n.y!));
      });
      ticked();
    });

    // Cleanup
    return () => {
      sim.stop();
    };
  }, [nodes, width, height, groups, groupBy, color, xScale, collidePadding]);

  return (
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        height: "100%",
        background: bg,
        borderRadius: 12,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <svg ref={svgRef} width={width} height={height} />
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 10,
          opacity: 0.75,
          fontSize: 12,
          color: "#e3e7ef",
        }}
      >
        Drag bubbles • Groups: <b>{groupBy}</b>
      </div>
    </div>
  );
}
