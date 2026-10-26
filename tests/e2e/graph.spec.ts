import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("notdown-sidebar-hidden", "[]"));
});

test("graph animates, drags without navigation, highlights neighbors, pans and zooms", async ({
  page,
  request,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const prefix = `Graph-${Date.now()}`;
  const create = async (title: string, body = "", parent?: string) =>
    (
      await request.post("/api/pages", {
        data: {
          title,
          body,
          parent,
          bodyFormat: "notion-markdown",
          syntax: { version: 1, variant: "notdown", extensions: {} },
        },
      })
    ).json();
  const neighbor = await create(`${prefix} Neighbor`);
  const hub = await create(
    `${prefix} Hub`,
    `<page url="#page/${neighbor.id}">Neighbor</page>`,
  );
  const child = await create(
    `${prefix} Child`,
    `<page url="#page/${hub.id}">Link back to parent</page>`,
    hub.id,
  );
  const isolated = await create(`${prefix} Isolated`);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/#vault/graph");
  await page.getByRole("textbox", { name: "Filter pages" }).fill(prefix);
  const graph = page.locator(".graph-view");
  const node = page.locator(`[data-graph-node="${hub.id}"]`);
  const neighborNode = page.locator(`[data-graph-node="${neighbor.id}"]`);
  const isolatedNode = page.locator(`[data-graph-node="${isolated.id}"]`);
  await expect(graph.locator(".graph-node")).toHaveCount(4);
  await expect(graph.locator(".parent-edge")).toHaveCount(1);
  await expect(graph.locator(".parent-edge")).toHaveAttribute(
    "data-source",
    hub.id,
  );
  await expect(graph.locator(".parent-edge")).toHaveAttribute(
    "data-target",
    child.id,
  );
  await expect(
    graph.locator(
      `.link-edge[data-source="${hub.id}"][data-target="${neighbor.id}"]`,
    ),
  ).toHaveCount(1);
  const backLink = graph.locator(
    `.link-edge[data-source="${child.id}"][data-target="${hub.id}"]`,
  );
  await expect(backLink).toHaveCount(1);
  const initial = await node.getAttribute("transform");
  await expect.poll(() => node.getAttribute("transform")).not.toBe(initial);
  // Wait for natural cooling before measuring a user-driven displacement.
  await page.waitForTimeout(5000);
  expect(await graph.evaluate((root) => {
    const edge = root.querySelector<SVGLineElement>(".parent-edge")!;
    const child = root.querySelector<SVGAElement>(`[data-graph-node="${edge.dataset.target}"]`)!;
    const position = child.transform.baseVal.getItem(0).matrix;
    const headDistance = Math.hypot(edge.x2.baseVal.value - position.e, edge.y2.baseVal.value - position.f);
    const tailDistance = Math.hypot(edge.x1.baseVal.value - position.e, edge.y1.baseVal.value - position.f);
    return edge.getAttribute("marker-end") === "url(#graph-arrow)" && headDistance < 25 && headDistance < tailDistance;
  })).toBe(true);
  await node.locator(".graph-dot").hover();
  await expect(node).toHaveClass(/is-active/);
  await expect(isolatedNode).toHaveClass(/is-muted/);
  await expect(neighborNode).not.toHaveClass(/is-muted/);
  const beforeNeighbor = await neighborNode.getAttribute("transform");
  const dot = await node.locator(".graph-dot").boundingBox();
  const before = await node.getAttribute("transform");
  await page.mouse.move(dot!.x + dot!.width / 2, dot!.y + dot!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    dot!.x + dot!.width / 2 + 100,
    dot!.y + dot!.height / 2 + 50,
    { steps: 12 },
  );
  await expect(node).not.toHaveAttribute("transform", before!);
  await expect
    .poll(() => neighborNode.getAttribute("transform"))
    .not.toBe(beforeNeighbor);
  await page.mouse.up();
  await expect(page).toHaveURL(/#vault\/graph$/);
  const released = await node.getAttribute("transform");
  await expect.poll(() => node.getAttribute("transform")).not.toBe(released);

  const canvas = graph.locator(".graph-canvas");
  const camera = graph.locator(".graph-camera");
  const rect = await canvas.boundingBox();
  const cameraBefore = await camera.getAttribute("transform");
  await page.mouse.move(rect!.x + 10, rect!.y + 10);
  await page.mouse.down();
  await page.mouse.move(rect!.x + 70, rect!.y + 50, { steps: 5 });
  await page.mouse.up();
  await expect(camera).not.toHaveAttribute("transform", cameraBefore!);
  await graph.getByRole("button", { name: "Fit graph" }).click();
  const zoomAnchor = await node.locator(".graph-dot").boundingBox();
  await page.mouse.move(
    zoomAnchor!.x + zoomAnchor!.width / 2,
    zoomAnchor!.y + zoomAnchor!.height / 2,
  );
  const pan = await camera.getAttribute("transform");
  await page.mouse.wheel(0, -200);
  await expect.poll(() => camera.getAttribute("transform")).not.toBe(pan);
  const zoomedDot = await node.locator(".graph-dot").boundingBox();
  const fromX = zoomedDot!.x + zoomedDot!.width / 2,
    fromY = zoomedDot!.y + zoomedDot!.height / 2;
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  // Pointer-down pins the node; measure after that so an in-flight physics tick
  // between the initial measurement and the press isn't mistaken for drag drift.
  const heldDot = await node.locator(".graph-dot").boundingBox();
  await page.mouse.move(fromX - 60, fromY - 40, { steps: 5 });
  const movedDot = await node.locator(".graph-dot").boundingBox();
  expect(movedDot!.x - heldDot!.x).toBeCloseTo(-60, 0);
  expect(movedDot!.y - heldDot!.y).toBeCloseTo(-40, 0);
  await page.mouse.up();
  await graph.getByRole("button", { name: "Fit graph" }).click();
  await graph.getByText("Graph settings", { exact: true }).click();
  const forceBefore = await neighborNode.getAttribute("transform");
  await graph.getByRole("slider", { name: "Repel force" }).fill("800");
  await expect
    .poll(() => neighborNode.getAttribute("transform"))
    .not.toBe(forceBefore);
  await graph.getByLabel("Show arrows").uncheck();
  await expect(graph.locator(".graph-edge").first()).toHaveAttribute(
    "marker-end",
    "none",
  );
  await graph.getByText("Graph settings", { exact: true }).click();
  await page.waitForTimeout(5000);
  await graph.getByRole("button", { name: "Fit graph" }).click();
  await node.locator(".graph-dot").hover();
  await page.screenshot({ path: "test-results/graph-interaction.png" });
  const detachedNode = await node.elementHandle();
  await node.locator(".graph-dot").click();
  await expect(page).toHaveURL(new RegExp(`#page/${hub.id}$`));
  await expect(graph).toHaveCount(0);
  const detachedPosition = await detachedNode!.getAttribute("transform");
  await page.waitForTimeout(100);
  expect(await detachedNode!.getAttribute("transform")).toBe(detachedPosition);
  expect(errors).toEqual([]);
  // The interaction has no storage side effects.
  for (const original of [hub, neighbor, child, isolated]) {
    const saved = await (await request.get(`/api/pages/${original.id}`)).json();
    expect(saved.revision).toBe(original.revision);
  }
});

test("graph handles reduced motion, keyboard opening, empty filters and remounting", async ({
  page,
  request,
}) => {
  const note = await (
    await request.post("/api/pages", {
      data: { title: `Graph keyboard ${Date.now()}`, body: "Keep pending" },
    })
  ).json();
  await page.goto(`/#page/${note.id}`);
  const paragraph = page
    .locator(".pm-document > p")
    .filter({ hasText: "Keep pending" });
  await paragraph.click();
  await page.keyboard.press("End");
  await page.keyboard.insertText(" graph input");
  await page.locator('[data-action="graph"]').click();
  await expect(page.locator(".graph-view")).toBeVisible();
  expect(
    (await (await request.get(`/api/pages/${note.id}`)).json()).body,
  ).toContain("graph input");
  await page
    .getByRole("textbox", { name: "Filter pages" })
    .fill("no-such-graph-xyz");
  await expect(page.locator("#library-results")).toHaveText(
    "No matching pages.",
  );
  await page.getByRole("textbox", { name: "Filter pages" }).fill(note.title);
  const node = page.locator(`[data-graph-node="${note.id}"]`);
  await expect(node).toBeVisible();
  const position = await node.getAttribute("transform");
  await page.waitForTimeout(150);
  await expect(node).toHaveAttribute("transform", position!);
  await page.setViewportSize({ width: 700, height: 800 });
  await expect(node).toBeVisible();
  expect(
    await page
      .locator(".graph-canvas")
      .evaluate((el) => el.getBoundingClientRect().right),
  ).toBeLessThanOrEqual(700);
  await page.locator(".graph-canvas").focus();
  const before = await page.locator(".graph-camera").getAttribute("transform");
  await page.keyboard.press("+");
  await expect(page.locator(".graph-camera")).not.toHaveAttribute(
    "transform",
    before!,
  );
  await node.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`#page/${note.id}$`));
});
