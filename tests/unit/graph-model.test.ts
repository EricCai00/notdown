import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGraph,
  createGraphSimulation,
} from "../../src/features/pages/graph-model";
import type { Page } from "../../src/shared/types";
import { extractLinks } from "../../src/document/document-format";

function page(
  id: string,
  title = id,
  body = "",
  parent: string | null = null,
): Page {
  return {
    id,
    title,
    body,
    parent,
    bodyFormat: "markdown",
    syntax: { version: 1, variant: "obsidian", extensions: {} },
    icon: "",
    properties: {},
    updated: "",
    revision: "1",
  };
}

test("graph resolves IDs and titles, deduplicates links and excludes self/missing/filtered targets", () => {
  const pages = [
    page("a", "A", "[[b]] [[B]] [[a]] [[missing]]", "b"),
    page("b", "B"),
    page("c", "C", "[[a]]"),
  ];
  const snapshot = structuredClone(pages);
  const graph = buildGraph(pages);
  assert.deepEqual(
    graph.edges.map((e) => [e.source.id, e.target.id, e.kind]),
    [
      ["a", "b", "link"],
      ["b", "a", "parent"],
      ["c", "a", "link"],
    ],
  );
  assert.equal(buildGraph([pages[0]], pages).edges.length, 0);
  assert.ok(graph.nodes[0].radius > graph.nodes[1].radius);
  const { simulation } = createGraphSimulation(graph.nodes, graph.edges);
  simulation.tick(250);
  assert.deepEqual(pages, snapshot);
  assert.ok(
    graph.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)),
  );
  simulation.stop();
});

test("dragging a fixed node moves neighbors and releasing lets the graph settle", () => {
  const { nodes, edges } = buildGraph([
    page("a", "A", "[[b]]"),
    page("b", "B"),
    page("c", "C"),
  ]);
  const { simulation } = createGraphSimulation(nodes, edges);
  simulation.tick(300);
  const before = { x: nodes[1].x!, y: nodes[1].y! };
  nodes[0].fx = nodes[0].x! + 180;
  nodes[0].fy = nodes[0].y! + 100;
  simulation.alpha(0.7).tick(70);
  assert.equal(nodes[0].x, nodes[0].fx);
  assert.ok(Math.hypot(nodes[1].x! - before.x, nodes[1].y! - before.y) > 10);
  nodes[0].fx = null;
  nodes[0].fy = null;
  simulation.alpha(0.5).tick(350);
  assert.ok(nodes.every((n) => Math.hypot(n.vx!, n.vy!) < 0.1));
  simulation.stop();
});

test("empty and singleton graphs stay finite", () => {
  for (const pages of [[], [page("a")]]) {
    const { nodes, edges } = buildGraph(pages);
    const { simulation } = createGraphSimulation(nodes, edges);
    simulation.tick(300).stop();
    assert.ok(nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  }
});

test("block page links participate in graph and backlinks without creating hierarchy", () => {
  for (const variant of ["notion-markdown", "notdown"] as const) {
    const source = page("source");
    source.bodyFormat = "notion-markdown";
    source.syntax = { version: 1, variant, extensions: {} };
    source.body =
      '<page url="#page/target">Target</page>\n\n<page url="#page/target">Repeated</page>\n\n<page url="https://example.com/external">External</page>\n\n```xml\n<page url="#page/code">Not a link</page>\n```';
    assert.deepEqual(
      extractLinks(source.body, source.bodyFormat, source.syntax),
      ["target"],
    );
    assert.deepEqual(
      buildGraph([source, page("target")]).edges.map((e) => [
        e.source.id,
        e.target.id,
        e.kind,
      ]),
      [["source", "target", "link"]],
    );
  }
});

test("body references and metadata hierarchy retain independent directions and kinds", () => {
  const parent = page("parent");
  parent.bodyFormat = "notion-markdown";
  parent.syntax = { version: 1, variant: "notdown", extensions: {} };
  parent.body = '<page role="child" url="#page/child">Child</page>';
  const child = page("child", "Child", "[[parent]]", "parent");
  assert.deepEqual(
    buildGraph([parent, child]).edges.map((e) => [
      e.source.id,
      e.target.id,
      e.kind,
    ]),
    [
      ["parent", "child", "link"],
      ["child", "parent", "link"],
      ["parent", "child", "parent"],
    ],
  );
  child.parent = null;
  assert.ok(
    buildGraph([parent, child]).edges.every((e) => e.kind === "link"),
    "body role alone must not invent hierarchy",
  );
});
