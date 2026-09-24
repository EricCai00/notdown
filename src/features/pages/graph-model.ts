import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationNodeDatum,
} from "d3-force";
import { extractLinks } from "../../document/document-format";
import type { Page } from "../../shared/types";

export interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
  radius: number;
}
export interface GraphEdge {
  source: GraphNode;
  target: GraphNode;
  kind: "parent" | "link";
}

/** Simulation objects are separate from pages: moving a node never edits vault data. */
export function buildGraph(visible: Page[], all: Page[] = visible) {
  const nodes: GraphNode[] = visible.map((p) => ({
    id: p.id,
    title: p.title,
    radius: 6,
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pagesById = new Map(all.map((p) => [p.id, p]));
  const pagesByTitle = new Map<string, Page>();
  for (const p of all)
    if (!pagesByTitle.has(p.title)) pagesByTitle.set(p.title, p);
  const edges: GraphEdge[] = [];
  for (const page of visible) {
    const source = byId.get(page.id)!;
    const targets = new Set(
      extractLinks(page.body, page.bodyFormat, page.syntax, all, page.id).map(
        (t) => (pagesById.get(t) ?? pagesByTitle.get(t))?.id,
      ),
    );
    for (const id of targets) {
      const target = id ? byId.get(id) : undefined;
      if (!target || target === source) continue;
      edges.push({
        source,
        target,
        kind: "link",
      });
    }
    // Metadata expresses containment, from the parent to this child. It is
    // independent of body references (including a child's link to its parent).
    const parent = page.parent ? byId.get(page.parent) : undefined;
    if (parent && parent !== source) {
      edges.push({ source: parent, target: source, kind: "parent" });
    }
  }
  const degrees = new Map<GraphNode, number>();
  for (const edge of edges)
    for (const node of [edge.source, edge.target])
      degrees.set(node, (degrees.get(node) ?? 0) + 1);
  for (const node of nodes)
    node.radius = 6 + Math.min(7, Math.sqrt(degrees.get(node) ?? 0) * 1.5);
  return { nodes, edges };
}

export function createGraphSimulation(nodes: GraphNode[], edges: GraphEdge[]) {
  const links = forceLink<GraphNode, GraphEdge>(edges)
    .distance(115)
    .strength(0.18);
  const charge = forceManyBody<GraphNode>().strength(-280);
  const x = forceX<GraphNode>(0).strength(0.025);
  const y = forceY<GraphNode>(0).strength(0.025);
  const simulation = forceSimulation(nodes)
    .stop()
    .force("links", links)
    .force("charge", charge)
    .force(
      "collision",
      forceCollide<GraphNode>().radius((n) => n.radius + 16),
    )
    .force("x", x)
    .force("y", y)
    .velocityDecay(0.35)
    .alphaDecay(0.025);
  return { simulation, links, charge, x, y };
}
