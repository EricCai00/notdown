import { escape as e, type Page } from "../../shared/types";
import {
  buildGraph,
  createGraphSimulation,
  type GraphNode,
} from "./graph-model";
import "./graph-view.css";

export function graphHTML(list: Page[]) {
  if (!list.length) return `<p class="empty-state" data-i18n="No matching pages.">No matching pages.</p>`;
  return `<div class="graph-view">
    <div class="graph-toolbar"><span class="graph-count"></span><button type="button" data-graph-fit data-i18n="Fit graph">Fit graph</button>
    <details class="graph-settings"><summary data-i18n="Graph settings">Graph settings</summary><div>
      <label><span data-i18n="Repel force">Repel force</span><input aria-label="Repel force" data-force="repel" type="range" min="20" max="900" value="280"  data-i18n-aria-label="Repel force"/></label>
      <label><span data-i18n="Link distance">Link distance</span><input aria-label="Link distance" data-force="distance" type="range" min="40" max="260" value="115"  data-i18n-aria-label="Link distance"/></label>
      <label><span data-i18n="Link force">Link force</span><input aria-label="Link force" data-force="link" type="range" min="0.02" max="0.6" step="0.01" value="0.18"  data-i18n-aria-label="Link force"/></label>
      <label><span data-i18n="Center force">Center force</span><input aria-label="Center force" data-force="center" type="range" min="0.005" max="0.1" step="0.005" value="0.025"  data-i18n-aria-label="Center force"/></label>
      <label><input type="checkbox" data-graph-labels checked /> <span data-i18n="Show labels">Show labels</span></label>
      <label><input type="checkbox" data-graph-arrows checked /> <span data-i18n="Show arrows">Show arrows</span></label>
    </div></details></div>
    <svg class="graph-canvas" role="group" aria-label="Vault page graph" tabindex="0" aria-describedby="graph-help">
      <defs><marker id="graph-arrow" viewBox="0 -4 8 8" refX="8" refY="0" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,-4L8,0L0,4" /></marker></defs>
      <g class="graph-camera"><g class="graph-edges"></g><g class="graph-nodes"></g></g>
    </svg>
    <div class="graph-footer"><span><i></i><span data-i18n="Page links → target">Page links → target</span> <i class="dashed"></i><span data-i18n="Parent → child">Parent → child</span></span><span id="graph-help" data-i18n="Drag nodes · Drag background to pan · Scroll to zoom · Click to open">Drag nodes · Drag background to pan · Scroll to zoom · Click to open</span></div>
  </div>`;
}

export function mountGraph(root: HTMLElement, pages: Page[], all: Page[]) {
  const { nodes, edges } = buildGraph(pages, all);
  const { simulation, links, charge, x, y } = createGraphSimulation(
    nodes,
    edges,
  );
  const svg = root.querySelector<SVGSVGElement>(".graph-canvas")!;
  const camera = root.querySelector<SVGGElement>(".graph-camera")!;
  root.querySelector(".graph-count")!.textContent =
    `${nodes.length} pages · ${edges.length} connections`;
  root.querySelector(".graph-edges")!.innerHTML = edges
    .map(
      (edge) =>
        `<line class="graph-edge ${edge.kind}-edge" data-source="${e(edge.source.id)}" data-target="${e(edge.target.id)}" marker-end="url(#graph-arrow)" />`,
    )
    .join("");
  root.querySelector(".graph-nodes")!.innerHTML = nodes
    .map(
      (node) =>
        `<a class="graph-node" data-graph-node="${e(node.id)}" href="#page/${encodeURIComponent(node.id)}" aria-label="${e(node.title)}"><title>${e(node.title)}</title><circle class="graph-hit" r="${node.radius + 9}" /><circle class="graph-dot" r="${node.radius}" /><text text-anchor="middle" y="${node.radius + 18}">${e(node.title.length > 32 ? node.title.slice(0, 31) + "…" : node.title)}</text></a>`,
    )
    .join("");
  const nodeElements = [...root.querySelectorAll<SVGAElement>(".graph-node")];
  const edgeElements = [
    ...root.querySelectorAll<SVGLineElement>(".graph-edge"),
  ];
  // Keep reciprocal links and a body link alongside a hierarchy edge visible.
  // Use a canonical direction so opposing edges occupy different lanes too.
  const edgeGroups = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const key = JSON.stringify([edge.source.id, edge.target.id].sort());
    const group = edgeGroups.get(key) ?? [];
    group.push(index);
    edgeGroups.set(key, group);
  });
  const edgeOffsets = new Array<number>(edges.length).fill(0);
  for (const group of edgeGroups.values())
    group.forEach((index, lane) => {
      const edge = edges[index];
      edgeOffsets[index] =
        (lane - (group.length - 1) / 2) *
        5 *
        (edge.source.id < edge.target.id ? 1 : -1);
    });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map(nodes.map((node) => [node.id, new Set([node.id])]));
  for (const edge of edges) {
    adjacency.get(edge.source.id)!.add(edge.target.id);
    adjacency.get(edge.target.id)!.add(edge.source.id);
  }
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let width = svg.clientWidth,
    height = svg.clientHeight;
  let scale = 1,
    panX = width / 2,
    panY = height / 2;
  let interacted = false;
  let hovered: string | undefined, focused: string | undefined;
  let gesture:
    | {
        pointer: number;
        startX: number;
        startY: number;
        panX: number;
        panY: number;
        offsetX: number;
        offsetY: number;
        node?: GraphNode;
        moved: boolean;
      }
    | undefined;
  let suppressClick = false;

  function paintCamera() {
    camera.setAttribute(
      "transform",
      `translate(${panX},${panY}) scale(${scale})`,
    );
  }
  function paint() {
    nodes.forEach((node, i) =>
      nodeElements[i].setAttribute(
        "transform",
        `translate(${node.x},${node.y})`,
      ),
    );
    edges.forEach((edge, i) => {
      const { source, target } = edge;
      const dx = target.x! - source.x!,
        dy = target.y! - source.y!;
      const distance = Math.hypot(dx, dy) || 1;
      const offset = edgeOffsets[i];
      const ox = (-dy / distance) * offset,
        oy = (dx / distance) * offset;
      const start = Math.min(
        Math.sqrt(Math.max(0, (source.radius + 2) ** 2 - offset ** 2)),
        distance / 2,
      );
      const end = Math.min(
        Math.sqrt(Math.max(0, (target.radius + 3) ** 2 - offset ** 2)),
        distance / 2,
      );
      const line = edgeElements[i];
      line.setAttribute("x1", String(source.x! + (dx / distance) * start + ox));
      line.setAttribute("y1", String(source.y! + (dy / distance) * start + oy));
      line.setAttribute("x2", String(target.x! - (dx / distance) * end + ox));
      line.setAttribute("y2", String(target.y! - (dy / distance) * end + oy));
    });
  }
  function fit() {
    if (!width || !height || !nodes.length) return;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const node of nodes) {
      const labelPadding = Math.min(130, node.title.length * 6);
      minX = Math.min(minX, node.x! - labelPadding - 20);
      maxX = Math.max(maxX, node.x! + labelPadding + 20);
      minY = Math.min(minY, node.y! - 30);
      maxY = Math.max(maxY, node.y! + 45);
    }
    scale = Math.max(
      0.05,
      Math.min(
        1.5,
        (width - 50) / (maxX - minX),
        (height - 60) / (maxY - minY),
      ),
    );
    panX = width / 2 - ((minX + maxX) / 2) * scale;
    panY = height / 2 - ((minY + maxY) / 2) * scale;
    paintCamera();
  }
  function highlight() {
    const id = gesture?.node?.id ?? hovered ?? focused;
    const neighbors = id ? adjacency.get(id) : undefined;
    nodeElements.forEach((element, i) => {
      element.classList.toggle(
        "is-muted",
        !!neighbors && !neighbors.has(nodes[i].id),
      );
      element.classList.toggle("is-active", nodes[i].id === id);
    });
    edgeElements.forEach((element, i) => {
      const active = edges[i].source.id === id || edges[i].target.id === id;
      element.classList.toggle("is-active", active);
      element.classList.toggle("is-muted", !!id && !active);
    });
  }
  function reheat() {
    simulation.alpha(Math.max(simulation.alpha(), 0.5));
    if (reducedMotion.matches) {
      simulation.stop().tick(gesture ? 1 : 220);
      paint();
    } else simulation.restart();
  }
  function point(event: { clientX: number; clientY: number }) {
    const rect = svg.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function zoom(next: number, px: number, py: number) {
    next = Math.max(0.05, Math.min(5, next));
    panX = px - ((px - panX) * next) / scale;
    panY = py - ((py - panY) * next) / scale;
    scale = next;
    interacted = true;
    paintCamera();
  }
  simulation.tick(reducedMotion.matches ? 260 : 70);
  paint();
  fit();
  simulation.on("tick", paint).on("end", () => {
    if (!interacted) fit();
  });
  if (!reducedMotion.matches) simulation.restart();

  nodeElements.forEach((element, i) => {
    const dot = element.querySelector<SVGCircleElement>(".graph-dot")!;
    dot.addEventListener(
      "pointerenter",
      () => {
        hovered = nodes[i].id;
        highlight();
      },
      options,
    );
    dot.addEventListener(
      "pointerleave",
      () => {
        hovered = undefined;
        highlight();
      },
      options,
    );
    element.addEventListener(
      "focus",
      () => {
        focused = element.matches(":focus-visible") ? nodes[i].id : undefined;
        highlight();
      },
      options,
    );
    element.addEventListener(
      "blur",
      () => {
        focused = undefined;
        highlight();
      },
      options,
    );
  });
  svg.addEventListener("dragstart", (event) => event.preventDefault(), options);
  svg.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || gesture) return;
      const element = (event.target as Element).closest<SVGAElement>(
        "[data-graph-node]",
      );
      const node = element ? byId.get(element.dataset.graphNode!) : undefined;
      const p = point(event);
      suppressClick = false;
      interacted = true;
      gesture = {
        pointer: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX,
        panY,
        offsetX: node ? node.x! - (p.x - panX) / scale : 0,
        offsetY: node ? node.y! - (p.y - panY) / scale : 0,
        node,
        moved: false,
      };
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
      }
      // Capture on the original link so a short click retains normal navigation.
      (element ?? svg).setPointerCapture(event.pointerId);
    },
    options,
  );
  svg.addEventListener(
    "pointermove",
    (event) => {
      if (!gesture || gesture.pointer !== event.pointerId) return;
      const dx = event.clientX - gesture.startX,
        dy = event.clientY - gesture.startY;
      if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
      gesture.moved = true;
      suppressClick = true;
      root.classList.add("is-dragging");
      if (gesture.node) {
        const p = point(event),
          node = gesture.node;
        node.x = node.fx = (p.x - panX) / scale + gesture.offsetX;
        node.y = node.fy = (p.y - panY) / scale + gesture.offsetY;
        simulation.alphaTarget(reducedMotion.matches ? 0 : 0.15);
        reheat();
        paint();
      } else {
        panX = gesture.panX + dx;
        panY = gesture.panY + dy;
        paintCamera();
      }
      highlight();
    },
    options,
  );
  function release(event?: PointerEvent) {
    if (!gesture || (event && event.pointerId !== gesture.pointer)) return;
    const previous = gesture;
    gesture = undefined;
    if (previous.node) {
      previous.node.fx = null;
      previous.node.fy = null;
    }
    simulation.alphaTarget(0);
    if (previous.moved && previous.node) reheat();
    const captured =
      nodeElements.find((el) => el.hasPointerCapture(previous.pointer)) ?? svg;
    if (captured.hasPointerCapture(previous.pointer))
      captured.releasePointerCapture(previous.pointer);
    root.classList.remove("is-dragging");
    hovered = undefined;
    highlight();
  }
  svg.addEventListener("pointerup", release, options);
  svg.addEventListener("pointercancel", release, options);
  svg.addEventListener("lostpointercapture", release, options);
  window.addEventListener("blur", () => release(), options);
  svg.addEventListener(
    "click",
    (event) => {
      if (suppressClick && event.detail !== 0) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick = false;
      }
    },
    { ...options, capture: true },
  );
  svg.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      if (gesture) return;
      const p = point(event);
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      zoom(
        scale * Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.002),
        p.x,
        p.y,
      );
    },
    { ...options, passive: false },
  );
  svg.addEventListener(
    "keydown",
    (event) => {
      if (event.target !== svg) return;
      if (
        [
          "+",
          "=",
          "-",
          "0",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
        ].includes(event.key)
      ) {
        event.preventDefault();
        interacted = true;
        if (event.key === "0") fit();
        else if (["+", "=", "-"].includes(event.key))
          zoom(scale * (event.key === "-" ? 0.8 : 1.25), width / 2, height / 2);
        else {
          panX +=
            event.key === "ArrowLeft"
              ? 40
              : event.key === "ArrowRight"
                ? -40
                : 0;
          panY +=
            event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0;
          paintCamera();
        }
      }
    },
    options,
  );
  root.querySelector("[data-graph-fit]")!.addEventListener(
    "click",
    () => {
      interacted = true;
      fit();
    },
    options,
  );
  root.querySelectorAll<HTMLInputElement>("[data-force]").forEach((input) =>
    input.addEventListener(
      "input",
      () => {
        const value = Number(input.value);
        if (input.dataset.force === "repel") charge.strength(-value);
        if (input.dataset.force === "distance") links.distance(value);
        if (input.dataset.force === "link") links.strength(value);
        if (input.dataset.force === "center") {
          x.strength(value);
          y.strength(value);
        }
        reheat();
      },
      options,
    ),
  );
  root.querySelector<HTMLInputElement>("[data-graph-labels]")!.addEventListener(
    "change",
    (event) => {
      root.classList.toggle(
        "hide-labels",
        !(event.target as HTMLInputElement).checked,
      );
    },
    options,
  );
  root.querySelector<HTMLInputElement>("[data-graph-arrows]")!.addEventListener(
    "change",
    (event) => {
      for (const line of edgeElements)
        line.setAttribute(
          "marker-end",
          (event.target as HTMLInputElement).checked
            ? "url(#graph-arrow)"
            : "none",
        );
    },
    options,
  );
  const observer = new ResizeObserver(() => {
    const nextWidth = svg.clientWidth,
      nextHeight = svg.clientHeight;
    panX += (nextWidth - width) / 2;
    panY += (nextHeight - height) / 2;
    width = nextWidth;
    height = nextHeight;
    if (!interacted) fit();
    else paintCamera();
  });
  observer.observe(svg);
  return () => {
    abort.abort();
    observer.disconnect();
    simulation.stop().on("tick", null).on("end", null);
  };
}
