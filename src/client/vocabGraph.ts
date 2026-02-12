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

// ── Color palette for levels ─────────────────────────────────────────────────

const levelColors: Record<string, string> = {
  A1: "#22c55e",
  A2: "#84cc16",
  B1: "#f59e0b",
  B2: "#f97316",
  C1: "#ef4444",
  C2: "#dc2626",
};

const kindColors: Record<string, string> = {
  center: "#0f172a",
  related: "#6366f1",
  synonym: "#ec4899",
};

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

  // Update URL without reload
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
  nodeInfo.classList.add("hidden");

  try {
    const data = await fetchGraph(word);

    if (!data.nodes.length) {
      statusEl.textContent = "No data found for this word.";
      return;
    }

    placeholder.classList.add("hidden");
    statusEl.textContent = `Showing ${data.nodes.length} nodes, ${data.edges.length} edges`;

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

function renderGraph(nodes: GraphNode[], edges: GraphEdge[], centerWord: string) {
  // Clean up previous instance
  if (sigmaInstance) {
    sigmaInstance.kill();
    sigmaInstance = null;
  }

  graph = new Graph();

  // Seed radial layout
  const centerNode = nodes.find((n) => n.kind === "center");
  const others = nodes.filter((n) => n.kind !== "center");
  const radius = 100;

  // Add center node
  if (centerNode) {
    graph.addNode(centerNode.id, {
      x: 0,
      y: 0,
      size: 14,
      color: kindColors.center,
      label: centerNode.label,
      nodeKind: centerNode.kind,
      level: centerNode.level,
    });
  }

  // Add surrounding nodes in a circle
  others.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / others.length - Math.PI / 2;
    const dist = n.kind === "synonym" ? radius * 0.6 : radius;
    const color = n.level ? (levelColors[n.level] ?? kindColors[n.kind]) : kindColors[n.kind];

    graph!.addNode(n.id, {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      size: n.kind === "synonym" ? 5 : 6,
      color,
      label: n.label,
      nodeKind: n.kind,
      level: n.level,
      score: n.score,
    });
  });

  // Add edges
  edges.forEach((e) => {
    if (graph!.hasNode(e.source) && graph!.hasNode(e.target)) {
      const isSynonym = e.type === "synonym";
      try {
        graph!.addEdge(e.source, e.target, {
          size: isSynonym ? 0.8 : 0.5,
          color: isSynonym ? "#f9a8d4" : "#e5e7eb",
          edgeKind: e.type, // custom attr — don't use "type" (reserved by Sigma)
        });
      } catch {
        // Skip duplicate edges
      }
    }
  });

  // Force-directed layout
  forceAtlas2.assign(graph, {
    iterations: 400,
    settings: {
      gravity: 0.08,
      scalingRatio: 15,
      barnesHutOptimize: true,
      barnesHutTheta: 0.5,
      strongGravityMode: false,
      adjustSizes: true,
      linLogMode: false,
      outboundAttractionDistribution: true,
      slowDown: 5,
    },
  });

  // Hover state
  hoveredNode = null;
  hoveredNeighbors = new Set();

  sigmaInstance = new Sigma(graph, container, {
    renderLabels: true,
    labelFont: "Geist, Inter, system-ui, sans-serif",
    labelSize: 12,
    labelWeight: "400",
    labelColor: { color: "#374151" },
    labelDensity: 0.8,
    labelGridCellSize: 80,
    labelRenderedSizeThreshold: 3,

    defaultNodeColor: "#94a3b8",
    defaultEdgeColor: "#e5e7eb",

    minCameraRatio: 0.1,
    maxCameraRatio: 6,
    stagePadding: 60,

    nodeReducer(node, data) {
      const res: Partial<NodeDisplayData> = { ...data };
      const kind = graph!.getNodeAttribute(node, "nodeKind");

      if (kind === "center") {
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
          res.color = "#9ca3af";
          res.size = 1.2;
        } else {
          res.hidden = true;
        }
      }

      return res;
    },
  });

  sigmaInstance.on("enterNode", ({ node }) => {
    hoveredNode = node;
    hoveredNeighbors = new Set(graph!.neighbors(node));
    document.body.style.cursor = "pointer";
    sigmaInstance!.refresh({ skipIndexation: true });

    // Show node info
    const attrs = graph!.getNodeAttributes(node);
    showNodeInfo(attrs);
  });

  sigmaInstance.on("leaveNode", () => {
    hoveredNode = null;
    hoveredNeighbors = new Set();
    document.body.style.cursor = "default";
    sigmaInstance!.refresh({ skipIndexation: true });
    nodeInfo.classList.add("hidden");
  });

  // Click node to explore it
  sigmaInstance.on("clickNode", ({ node }) => {
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

// ── Show node info panel ─────────────────────────────────────────────────────

function showNodeInfo(attrs: Record<string, any>) {
  const parts: string[] = [];
  parts.push(`<span class="font-semibold text-gray-900">${esc(attrs.label)}</span>`);
  if (attrs.level)
    parts.push(
      `<span class="inline-flex items-center rounded-md bg-gray-900 px-1.5 py-0.5 text-[10px] font-medium text-white ml-1">${esc(attrs.level)}</span>`
    );
  if (attrs.nodeKind && attrs.nodeKind !== "center")
    parts.push(`<span class="text-xs text-gray-400 ml-1">${esc(attrs.nodeKind)}</span>`);
  if (attrs.score != null)
    parts.push(
      `<span class="text-xs font-mono text-gray-300 ml-2">distance: ${Number(attrs.score).toFixed(4)}</span>`
    );

  nodeInfo.innerHTML = parts.join("");
  nodeInfo.classList.remove("hidden");
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
