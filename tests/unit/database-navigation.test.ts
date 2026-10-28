import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute, routeHash } from "../../src/features/pages/page-navigation";

test("database routes retain distinct collection and database identities", () => {
  assert.deepEqual(parseRoute("#databases"), { kind: "database" });
  assert.deepEqual(parseRoute("#database/abc%2Fdef"), { kind: "database", id: "abc/def" });
  assert.equal(routeHash({ kind: "database" }), "#databases");
  assert.equal(routeHash({ kind: "database", id: "abc/def" }), "#database/abc%2Fdef");
  assert.equal(parseRoute("#database/"), null);
  assert.equal(parseRoute("#database/%zz"), null);
  const viewRoute = { kind: "database", id: "abc/def", viewId: "view/? a" } as const;
  assert.deepEqual(parseRoute(routeHash(viewRoute)), viewRoute);
  assert.deepEqual(parseRoute("#page/example#anchor"), { kind: "page", id: "example", fragment: "anchor" });
  assert.deepEqual(parseRoute("#vault/list"), { kind: "vault", view: "list" });
});
