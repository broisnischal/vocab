import Graph from "graphology";
import Sigma from "sigma";
import { EdgeDisplayData, NodeDisplayData } from "sigma/types";


interface VocabData {
    root: string;
    categories: Record<string, { color: string; items: string[] }>;
}

const data: VocabData = {
    root: "Tech & Engineering",
    categories: {
        // ── Networking ──
        "Network Protocols": {
            color: "#8b5cf6",
            items: ["TCP", "UDP", "ICMP", "ARP", "BGP", "OSPF", "MPLS"],
        },
        "Application Protocols": {
            color: "#ec4899",
            items: ["HTTP", "HTTPS", "FTP", "SMTP", "POP3", "IMAP", "SNMP", "WebSocket", "gRPC"],
        },
        "Network Services": {
            color: "#f59e0b",
            items: ["DNS", "DHCP", "CDN", "Proxy", "Load Balancer", "Firewall", "VPN", "NAT"],
        },

        // ── Infrastructure ──
        Virtualization: {
            color: "#3b82f6",
            items: ["KVM", "Hyper-V", "VMware", "QEMU", "Xen", "Proxmox"],
        },
        Containers: {
            color: "#06b6d4",
            items: ["Docker", "Podman", "Kubernetes", "Helm", "Swarm", "Containerd", "CRI-O"],
        },
        Storage: {
            color: "#6366f1",
            items: ["NAS", "SAN", "RAID", "ZFS", "Btrfs", "Ceph", "MinIO", "S3"],
        },

        // ── Cloud & DevOps ──
        "Cloud Providers": {
            color: "#0ea5e9",
            items: ["AWS", "GCP", "Azure", "DigitalOcean", "Cloudflare", "Hetzner", "Vercel"],
        },
        "CI / CD": {
            color: "#14b8a6",
            items: ["GitHub Actions", "GitLab CI", "Jenkins", "ArgoCD", "Tekton", "Drone"],
        },
        IaC: {
            color: "#a78bfa",
            items: ["Terraform", "Pulumi", "Ansible", "CloudFormation", "Crossplane"],
        },

        // ── Security ──
        Security: {
            color: "#ef4444",
            items: ["TLS", "SSH", "OAuth", "JWT", "SAML", "mTLS", "RBAC", "Zero Trust"],
        },
        "Remote Access": {
            color: "#10b981",
            items: ["SSH", "RDP", "VNC", "Telnet", "WireGuard", "Tailscale"],
        },

        // ── Observability ──
        Observability: {
            color: "#f97316",
            items: ["Prometheus", "Grafana", "Loki", "Jaeger", "OpenTelemetry", "Datadog", "ELK"],
        },

        // ── Databases ──
        Databases: {
            color: "#d946ef",
            items: ["PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis", "CockroachDB", "ClickHouse"],
        },
        "Message Queues": {
            color: "#f472b6",
            items: ["Kafka", "RabbitMQ", "NATS", "Redis Pub/Sub", "SQS", "Pulsar"],
        },

        // ── Languages & Runtimes ──
        Languages: {
            color: "#84cc16",
            items: ["TypeScript", "Rust", "Go", "Python", "C", "Zig", "Lua"],
        },
        Runtimes: {
            color: "#22c55e",
            items: ["Node.js", "Deno", "Bun", "V8", "WASM", "JVM"],
        },

        // ── Web ──
        "Web Frameworks": {
            color: "#e11d48",
            items: ["React", "Next.js", "Hono", "Astro", "SvelteKit", "Remix", "Nuxt"],
        },
    },
};

// ─── Build graph ─────────────────────────────────────────────────────────────

const graph = new Graph();

// Root node
graph.addNode("root", {
    x: 0,
    y: 0,
    size: 12,
    color: "#0f172a",
    label: data.root,
    nodeKind: "center",
});

const catEntries = Object.entries(data.categories);
const catCount = catEntries.length;
const catRadius = 22;
const itemDist = 10;

catEntries.forEach(([category, { color, items }], ci) => {
    const catAngle = (2 * Math.PI * ci) / catCount - Math.PI / 2;
    const cx = Math.cos(catAngle) * catRadius;
    const cy = Math.sin(catAngle) * catRadius;

    graph.addNode(category, {
        x: cx,
        y: cy,
        size: 7,
        color,
        label: category,
        nodeKind: "category",
    });

    graph.addEdge("root", category, { size: 0.6, color: "#d1d5db" });

    // Fan items outward from category
    const arcPerItem = 0.20;
    const totalArc = (items.length - 1) * arcPerItem;

    items.forEach((item, ii) => {
        const off = items.length === 1 ? 0 : -totalArc / 2 + ii * arcPerItem;
        const a = catAngle + off;
        const id = `${category}::${item}`;

        graph.addNode(id, {
            x: cx + Math.cos(a) * itemDist,
            y: cy + Math.sin(a) * itemDist,
            size: 4,
            color,
            label: item,
            nodeKind: "item",
        });

        graph.addEdge(category, id, { size: 0.4, color: "#e5e7eb" });
    });
});

// ─── Interaction state ───────────────────────────────────────────────────────

let hoveredNode: string | null = null;
let hoveredNeighbors: Set<string> = new Set();

// ─── Render ──────────────────────────────────────────────────────────────────

const container = document.getElementById("sigma-container");

if (container) {
    const renderer = new Sigma(graph, container, {
        renderLabels: true,
        labelFont: "Geist, Inter, system-ui, sans-serif",
        labelSize: 12,
        labelWeight: "400",
        labelColor: { color: "#374151" },
        labelDensity: 0.7,
        labelGridCellSize: 100,
        labelRenderedSizeThreshold: 3,

        defaultNodeColor: "#94a3b8",
        defaultEdgeColor: "#e5e7eb",

        minCameraRatio: 0.1,
        maxCameraRatio: 6,
        stagePadding: 60,

        nodeReducer(node, data) {
            const res: Partial<NodeDisplayData> = { ...data };
            const kind = graph.getNodeAttribute(node, "nodeKind");

            if (kind === "center" || kind === "category") {
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
                const [source, target] = graph.extremities(edge);
                if (source === hoveredNode || target === hoveredNode) {
                    res.color = "#9ca3af";
                    res.size = 1;
                } else {
                    res.hidden = true;
                }
            }

            return res;
        },
    });

    renderer.on("enterNode", ({ node }) => {
        hoveredNode = node;
        hoveredNeighbors = new Set(graph.neighbors(node));
        document.body.style.cursor = "pointer";
        renderer.refresh({ skipIndexation: true });
    });

    renderer.on("leaveNode", () => {
        hoveredNode = null;
        hoveredNeighbors = new Set();
        document.body.style.cursor = "default";
        renderer.refresh({ skipIndexation: true });
    });
}
