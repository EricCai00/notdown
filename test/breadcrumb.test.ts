import test from "node:test";
import assert from "node:assert/strict";
import { breadcrumbItems } from "../src/breadcrumb-view";

const pages = [
  { id: "root", title: "Systematic", icon: "👤", parent: null },
  { id: "notes", title: "On note apps", icon: "📒", parent: "root" },
  { id: "play", title: "Playground", icon: "🛝", parent: "notes" },
];
test("breadcrumb follows the current hierarchy with current title and icons", () => {
  const result = breadcrumbItems(pages, { ...pages[2], title: "Renamed" });
  assert.deepEqual(result.map(p => p.id), ["root", "notes", "play"]);
  assert.equal(result[2].title, "Renamed");
  assert.equal(result[1].icon, "📒");
  assert.deepEqual(breadcrumbItems(pages, pages[0]), [pages[0]]);
  assert.deepEqual(breadcrumbItems(pages, { ...pages[2], parent: "root" }).map(p => p.id), ["root", "play"]);
});
test("unavailable ancestors are omitted and cycles terminate without duplicating the current page", () => {
  assert.deepEqual(breadcrumbItems(pages.slice(1), pages[2]).map(p => p.id), ["notes", "play"]);
  assert.deepEqual(breadcrumbItems([{ ...pages[0], trashed: true }, ...pages.slice(1)], pages[2]).map(p => p.id), ["notes", "play"]);
  assert.deepEqual(breadcrumbItems(pages, { ...pages[2], trashed: true }), []);
  const cycle = [{ ...pages[0], parent: "notes" }, pages[1]];
  assert.deepEqual(breadcrumbItems(cycle, cycle[1]).map(p => p.id), ["root", "notes"]);
  assert.deepEqual(breadcrumbItems([], { ...pages[0], parent: "root" }).map(p => p.id), ["root"]);
  assert.deepEqual(breadcrumbItems([]), []);
});
