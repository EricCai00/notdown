import test from "node:test";
import assert from "node:assert/strict";
import { WorkspaceTabs, type TabViewState } from "../../src/app/workspace-tabs";
import { routeHash, type PageRoute } from "../../src/features/pages/page-navigation";

const a: PageRoute = { kind: "page", id: "page-a" }, b: PageRoute = { kind: "page", id: "page-b" };
function fixture(initial: PageRoute = a, data = new Map<string, string>(), key = "vault-one") {
  let current = initial, allow = true;
  let position: TabViewState = { mode: "source", scroll: 250, sourceScroll: 90 };
  const loaded: string[] = [], restored: (TabViewState | undefined)[] = [];
  const model = new WorkspaceTabs(initial, {
    key, storage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } },
    navigate: async route => { loaded.push(routeHash(route)); if (allow) current = structuredClone(route); return allow; },
    currentRoute: () => current, capture: () => structuredClone(position), restore: async state => { restored.push(state); },
    changed() {}, report(error) { throw error; },
  });
  return { model, data, loaded, restored, setAllow(value: boolean) { allow = value; }, setPosition(value: TabViewState) { position = value; } };
}

test("opening in the background does not navigate or capture pending editor input", async () => {
  const { model, loaded } = fixture();
  const original = model.activeId;
  assert.equal(await model.open(b, true), true);
  assert.equal(model.tabs.length, 2); assert.equal(model.activeId, original);
  assert.deepEqual(loaded, []); assert.equal(model.active.state, undefined);
  await model.open(b, true); assert.equal(model.tabs.length, 2);
  await model.open({ ...b, fragment: "target-heading" }, true);
  assert.equal(model.tabs.length, 3);
  assert.equal(model.tabs[2].route.kind === "page" && model.tabs[2].route.fragment, "target-heading");
});

test("tab activation captures outgoing view position and restores the target only after saving succeeds", async () => {
  const f = fixture(), original = f.model.activeId;
  await f.model.open(b);
  assert.equal(f.model.tabs[0].state?.mode, "source");
  const active = f.model.activeId;
  f.setAllow(false);
  assert.equal(await f.model.activate(original), false);
  assert.equal(f.model.activeId, active); assert.equal(f.model.tabs.length, 2);
  assert.equal(f.restored.length, 1);
  f.setAllow(true);
  assert.equal(await f.model.activate(original), true);
  assert.deepEqual(f.restored.at(-1), { mode: "source", scroll: 250, sourceScroll: 90 });
});

test("failed switch, new tab and active-tab close retain every route and recoverable tab", async () => {
  const f = fixture(); await f.model.open(b, true);
  const original = f.model.activeId, routes = f.model.tabs.map(tab => routeHash(tab.route));
  f.setAllow(false);
  assert.equal(await f.model.open(), false);
  assert.equal(await f.model.close(original), false);
  assert.deepEqual(f.model.tabs.map(tab => routeHash(tab.route)), routes);
  assert.equal(f.model.activeId, original); assert.equal(f.model.busy, false);
});

test("closing inactive tabs preserves the current editor; closing the last tab returns to Vault", async () => {
  const f = fixture(); await f.model.open(b, true);
  await f.model.close(f.model.tabs[1].id);
  assert.deepEqual(f.loaded, []);
  await f.model.close(f.model.activeId);
  assert.equal(f.model.tabs.length, 1); assert.equal(f.model.active.route.kind, "vault");
  await f.model.reopen(); assert.deepEqual(f.model.active.route, a);
});

test("restoration is isolated by vault and honors an explicit URL without dropping saved tabs", async () => {
  const f = fixture(); await f.model.open(b);
  f.model.capture();
  const restored = fixture(b, f.data);
  assert.equal(restored.model.tabs.length, 2); assert.deepEqual(restored.model.active.route, b);
  assert.equal(restored.model.active.state?.sourceScroll, 90);
  const linked = fixture({ kind: "database", id: "external-link" }, f.data);
  assert.equal(linked.model.tabs.length, 3); assert.equal(linked.model.active.route.kind, "database");
  assert.equal(fixture(a, f.data, "another-vault").model.tabs.length, 1);
});

test("malformed persisted tabs and invalid view states are discarded without navigating", () => {
  const data = new Map([["vault-one", JSON.stringify({ version: 1, activeId: "bad", tabs: [null, { id: "bad", hash: "#page/%ZZ" },
    { id: "ok", hash: "#page/page-a", state: { mode: "source", scroll: -1, sourceScroll: 0 } }] })]]);
  const f = fixture(a, data);
  assert.equal(f.model.tabs.length, 1); assert.equal(f.model.active.state, undefined); assert.deepEqual(f.loaded, []);
});

test("tab reorder and ordinary navigation preserve a coherent active route", async () => {
  const f = fixture(); await f.model.open(b, true);
  const original = f.model.activeId, second = f.model.tabs[1].id;
  f.model.move(second, original);
  assert.equal(f.model.tabs[0].id, second); assert.equal(f.model.activeId, original);
  f.model.sync({ kind: "vault", view: "graph" });
  assert.deepEqual(f.model.active.route, { kind: "vault", view: "graph" });
  assert.equal(f.model.tabs[0].route.kind, "page");
});
