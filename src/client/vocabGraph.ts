import Graph from "graphology";
import Sigma from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { EdgeDisplayData, NodeDisplayData } from "sigma/types";
import { fetchGraph, type GraphNode, type GraphEdge } from "./api";

// ── DOM refs ─────────────────────────────────────────────────────────────────

const form = document.getElementById("graph-form") as HTMLFormElement;
const wordInput = document.getElementById("g-word") as HTMLInputElement;
const graphBtn = document.getElementById("graph-btn") as HTMLButtonElement;
const statusEl = document.getElementById("graph-status") as HTMLDivElement;
const container = document.getElementById("sigma-container") as HTMLDivElement;
const placeholder = document.getElementById("graph-placeholder") as HTMLDivElement;
const nodeInfo = document.getElementById("node-info") as HTMLDivElement;

// ── State ────────────────────────────────────────────────────────────────────

let sigmaInstance: Sigma | null = null;
let graph: Graph | null = null;
let hoveredNode: string | null = null;
let hoveredNeighbors: Set<string> = new Set();

// ── Color palettes ───────────────────────────────────────────────────────────

const posColors: Record<string, string> = {
  noun: "#3b82f6",
  verb: "#22c55e",
  adjective: "#f59e0b",
  adverb: "#a855f7",
  preposition: "#06b6d4",
  conjunction: "#ec4899",
  interjection: "#ef4444",
  other: "#6b7280",
};

const levelColors: Record<string, string> = {
  A1: "#22c55e",
  A2: "#84cc16",
  B1: "#f59e0b",
  B2: "#f97316",
  C1: "#ef4444",
  C2: "#dc2626",
};

function getNodeColor(node: GraphNode): string {
  if (node.kind === "center") return "#0f172a";
  if (node.kind === "pos-group")
    return posColors[node.pos ?? "other"] ?? "#6b7280";
  if (node.kind === "synonym") return "#8b5cf6"; // violet for synonyms
  if (node.kind === "antonym") return "#ef4444"; // red for antonyms
  // Related: prefer level color, fallback to POS color
  if (node.level && levelColors[node.level]) return levelColors[node.level];
  if (node.pos && posColors[node.pos]) return posColors[node.pos];
  return "#6366f1";
}

function getNodeSize(kind: string): number {
  switch (kind) {
    case "center":
      return 18;
    case "pos-group":
      return 11;
    case "synonym":
      return 6;
    case "antonym":
      return 6;
    case "related":
      return 5;
    default:
      return 5;
  }
}

// ── Read ?word= from URL on load ─────────────────────────────────────────────

const params = new URLSearchParams(window.location.search);
const initialWord = params.get("word");
if (initialWord) {
  wordInput.value = initialWord;
  loadGraph(initialWord);
}

// ── Form handler ─────────────────────────────────────────────────────────────

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const word = wordInput.value.trim();
  if (!word) return;

  const url = new URL(window.location.href);
  url.searchParams.set("word", word);
  history.pushState(null, "", url.toString());

  loadGraph(word);
});

// ── Load graph data and render ───────────────────────────────────────────────

async function loadGraph(word: string) {
  graphBtn.disabled = true;
  graphBtn.textContent = "Loading...";
  statusEl.textContent = "";
  statusEl.className = "text-sm text-gray-400 mb-3";
  nodeInfo.classList.add("hidden");

  try {
    const data = await fetchGraph(word);

    if (!data.nodes.length) {
      statusEl.textContent = "No data found for this word.";
      return;
    }

    placeholder.classList.add("hidden");
    statusEl.textContent = `${data.nodes.length} nodes, ${data.edges.length} edges`;

    renderGraph(data.nodes, data.edges, word);
  } catch (err: any) {
    statusEl.textContent = err.message ?? "Failed to load graph";
    statusEl.className = "text-sm text-red-500 mb-3";
  } finally {
    graphBtn.disabled = false;
    graphBtn.textContent = "Explore";
  }
}

// ── Build & render the Sigma graph ───────────────────────────────────────────

function renderGraph(nodes: GraphNode[], edges: GraphEdge[], _centerWord: string) {
  if (sigmaInstance) {
    sigmaInstance.kill();
    sigmaInstance = null;
  }

  graph = new Graph();

  // ── Seed layout: hierarchical radial ──────────────────────────────────────
  // Center at origin; POS groups in inner ring; leaves in outer ring

  const centerNode = nodes.find((n) => n.kind === "center");
  const posGroups = nodes.filter((n) => n.kind === "pos-group");
  const leafNodes = nodes.filter(
    (n) => n.kind !== "center" && n.kind !== "pos-group"
  );

  // Build adjacency for layout: which leaves belong to which POS group
  const posGroupChildren = new Map<string, string[]>();
  for (const pg of posGroups) posGroupChildren.set(pg.id, []);
  for (const e of edges) {
    if (posGroupChildren.has(e.source) && !posGroups.find((p) => p.id === e.target)) {
      posGroupChildren.get(e.source)!.push(e.target);
    }
  }

  // Also track leaves not in any POS group (synonym-only nodes attached directly)
  const assignedLeaves = new Set<string>();
  for (const children of posGroupChildren.values()) {
    for (const c of children) assignedLeaves.add(c);
  }

  // Add center
  if (centerNode) {
    graph.addNode(centerNode.id, {
      x: 0,
      y: 0,
      size: getNodeSize(centerNode.kind),
      color: getNodeColor(centerNode),
      label: centerNode.label,
      nodeKind: centerNode.kind,
      nodePos: centerNode.pos,
      level: centerNode.level,
      definition: centerNode.definition,
    });
  }

  // POS groups in inner ring
  const innerRadius = 80;
  posGroups.forEach((pg, i) => {
    const angle = (2 * Math.PI * i) / posGroups.length - Math.PI / 2;
    graph!.addNode(pg.id, {
      x: Math.cos(angle) * innerRadius,
      y: Math.sin(angle) * innerRadius,
      size: getNodeSize(pg.kind),
      color: getNodeColor(pg),
      label: pg.label,
      nodeKind: pg.kind,
      nodePos: pg.pos,
      level: null,
      definition: null,
    });
  });

  // Leaf nodes: position near their parent POS group
  const outerRadius = 160;
  const synRadius = 200;

  for (const [pgId, children] of posGroupChildren) {
    const pgNode = graph.hasNode(pgId) ? graph.getNodeAttributes(pgId) : null;
    if (!pgNode) continue;

    const pgAngle = Math.atan2(pgNode.y, pgNode.x);

    children.forEach((childId, ci) => {
      const child = nodes.find((n) => n.id === childId);
      if (!child || graph!.hasNode(childId)) return;

      const arcSpread = 0.25;
      const totalArc = (children.length - 1) * arcSpread;
      const offset = children.length === 1 ? 0 : -totalArc / 2 + ci * arcSpread;
      const a = pgAngle + offset;
      const r = child.kind === "synonym" ? synRadius : outerRadius;

      graph!.addNode(childId, {
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        size: getNodeSize(child.kind),
        color: getNodeColor(child),
        label: child.label,
        nodeKind: child.kind,
        nodePos: child.pos,
        level: child.level,
        definition: child.definition,
        score: child.score,
      });
    });
  }

  // Add remaining unassigned leaf nodes (e.g. synonyms attached to center or to other leaves)
  for (const leaf of leafNodes) {
    if (graph.hasNode(leaf.id)) continue;

    // Find what it connects to
    const parentEdge = edges.find((e) => e.target === leaf.id);
    let px = 0,
      py = 0;
    if (parentEdge && graph.hasNode(parentEdge.source)) {
      const pa = graph.getNodeAttributes(parentEdge.source);
      px = pa.x;
      py = pa.y;
    }

    const jitter = () => (Math.random() - 0.5) * 60;
    const angle = Math.atan2(py, px) + (Math.random() - 0.5) * 0.8;
    const r = Math.sqrt(px * px + py * py) + 40 + Math.random() * 30;

    graph.addNode(leaf.id, {
      x: Math.cos(angle) * r + jitter(),
      y: Math.sin(angle) * r + jitter(),
      size: getNodeSize(leaf.kind),
      color: getNodeColor(leaf),
      label: leaf.label,
      nodeKind: leaf.kind,
      nodePos: leaf.pos,
      level: leaf.level,
      definition: leaf.definition,
      score: leaf.score,
    });
  }

  // ── Add edges ─────────────────────────────────────────────────────────────

  const edgeColorMap: Record<string, string> = {
    "has-pos": "#94a3b8",        // slate — structural
    synonym: "#c4b5fd",          // violet-light — synonym link
    antonym: "#fca5a5",          // red-light — antonym link
    semantic: "#e5e7eb",         // gray — embedding similarity
    "synonym-chain": "#ddd6fe",  // violet-lighter — 2nd-level synonyms
    "shared-synonym": "#a5b4fc", // indigo-light — cross-link
  };

  const edgeSizeMap: Record<string, number> = {
    "has-pos": 1.2,
    synonym: 0.8,
    antonym: 0.8,
    semantic: 0.5,
    "synonym-chain": 0.5,
    "shared-synonym": 0.3,
  };

  for (const e of edges) {
    if (graph.hasNode(e.source) && graph.hasNode(e.target)) {
      try {
        graph.addEdge(e.source, e.target, {
          size: edgeSizeMap[e.edgeKind] ?? 0.5,
          color: edgeColorMap[e.edgeKind] ?? "#e5e7eb",
          edgeKind: e.edgeKind,
        });
      } catch {
        // skip duplicate edges
      }
    }
  }

  // ── Force-directed layout ─────────────────────────────────────────────────

  forceAtlas2.assign(graph, {
    iterations: 600,
    settings: {
      gravity: 0.04,
      scalingRatio: 20,
      barnesHutOptimize: true,
      barnesHutTheta: 0.5,
      strongGravityMode: false,
      adjustSizes: true,
      linLogMode: false,
      outboundAttractionDistribution: true,
      slowDown: 8,
    },
  });

  // ── Sigma renderer ────────────────────────────────────────────────────────

  hoveredNode = null;
  hoveredNeighbors = new Set();

  sigmaInstance = new Sigma(graph, container, {
    renderLabels: true,
    labelFont: "Geist, Inter, system-ui, sans-serif",
    labelSize: 12,
    labelWeight: "400",
    labelColor: { color: "#374151" },
    labelDensity: 0.7,
    labelGridCellSize: 80,
    labelRenderedSizeThreshold: 3,

    defaultNodeColor: "#94a3b8",
    defaultEdgeColor: "#e5e7eb",

    minCameraRatio: 0.08,
    maxCameraRatio: 8,
    stagePadding: 60,

    nodeReducer(node, data) {
      const res: Partial<NodeDisplayData> = { ...data };
      const kind = graph!.getNodeAttribute(node, "nodeKind");

      // Always show labels for center and POS groups
      if (kind === "center" || kind === "pos-group") {
        res.forceLabel = true;
      }

      if (hoveredNode) {
        if (node === hoveredNode) {
          res.highlighted = true;
          res.forceLabel = true;
          res.zIndex = 2;
        } else if (hoveredNeighbors.has(node)) {
          res.forceLabel = true;
          res.zIndex = 1;
        } else {
          res.color = "#e5e7eb";
          res.label = "";
          res.zIndex = 0;
        }
      }

      return res;
    },

    edgeReducer(edge, data) {
      const res: Partial<EdgeDisplayData> = { ...data };

      if (hoveredNode) {
        const [source, target] = graph!.extremities(edge);
        if (source === hoveredNode || target === hoveredNode) {
          res.color = "#6b7280";
          res.size = 1.5;
        } else {
          res.hidden = true;
        }
      }

      return res;
    },
  });

  // ── Interactions ──────────────────────────────────────────────────────────

  sigmaInstance.on("enterNode", ({ node }) => {
    hoveredNode = node;
    hoveredNeighbors = new Set(graph!.neighbors(node));
    document.body.style.cursor = "pointer";
    sigmaInstance!.refresh({ skipIndexation: true });

    const attrs = graph!.getNodeAttributes(node);
    showNodeInfo(attrs);
  });

  sigmaInstance.on("leaveNode", () => {
    hoveredNode = null;
    hoveredNeighbors = new Set();
    document.body.style.cursor = "default";
    sigmaInstance!.refresh({ skipIndexation: true });
    nodeInfo.classList.add("hidden");
    nodeInfo.classList.remove("opacity-100");
    nodeInfo.classList.add("opacity-0");
  });

  sigmaInstance.on("clickNode", ({ node }) => {
    const kind = graph!.getNodeAttribute(node, "nodeKind");
    // Don't navigate to POS group nodes
    if (kind === "pos-group") return;

    const label = graph!.getNodeAttribute(node, "label");
    if (label) {
      wordInput.value = label;
      const url = new URL(window.location.href);
      url.searchParams.set("word", label);
      history.pushState(null, "", url.toString());
      loadGraph(label);
    }
  });
}

// ── Node info panel ──────────────────────────────────────────────────────────

function showNodeInfo(attrs: Record<string, any>) {
  const parts: string[] = [];

  // Word label
  parts.push(
    `<span class="font-semibold text-gray-900 text-base">${esc(attrs.label)}</span>`
  );

  // POS badge
  if (attrs.nodePos && attrs.nodeKind !== "pos-group") {
    parts.push(
      `<span class="text-xs text-gray-400 italic ml-1.5">${esc(attrs.nodePos)}</span>`
    );
  }

  // Level badge
  if (attrs.level) {
    parts.push(
      `<span class="inline-flex items-center rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white ml-1.5">${esc(attrs.level)}</span>`
    );
  }

  // Kind tag
  if (attrs.nodeKind && attrs.nodeKind !== "center" && attrs.nodeKind !== "pos-group") {
    const kindColorMap: Record<string, string> = {
      synonym: "text-violet-400",
      antonym: "text-red-400",
      related: "text-gray-400",
    };
    const kindClass = kindColorMap[attrs.nodeKind] ?? "text-gray-300";
    parts.push(
      `<span class="text-[10px] ${kindClass} ml-1.5">${esc(attrs.nodeKind)}</span>`
    );
  }

  // Distance score
  if (attrs.score != null) {
    parts.push(
      `<span class="text-xs font-mono text-gray-300 ml-2">dist: ${Number(attrs.score).toFixed(4)}</span>`
    );
  }

  // Definition (on a new line)
  if (attrs.definition) {
    parts.push(
      `<div class="text-sm text-gray-500 mt-1 leading-snug">${esc(attrs.definition)}</div>`
    );
  }

  nodeInfo.innerHTML = parts.join("");
  nodeInfo.classList.remove("hidden");
  nodeInfo.classList.remove("opacity-0");
  nodeInfo.classList.add("opacity-100");
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
