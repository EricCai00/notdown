import test from "node:test";
import assert from "node:assert/strict";
import { vaultPrefix } from "../../src/shared/vault-url";
import viteConfig from "../../vite.config";

test("vault URL prefixes accept short path hashes and complete legacy hashes only", () => {
  for (const id of ["53695d58a55e54aa", "53695d58a55e54aa27ff888f15b24f6ed3548bd05eac8582526ccb419456496d"]) {
    assert.equal(vaultPrefix(`/v/${id}`), `/v/${id}`);
    assert.equal(vaultPrefix(`/v/${id}/`), `/v/${id}`);
    assert.equal(vaultPrefix(`/v/${id}/assets/example.png`), `/v/${id}`);
    assert.equal(vaultPrefix(`/v/${id}extra/`), "");
  }
  for (const path of ["/", "/v/", "/v/../../", `/v/${"a".repeat(15)}/`, `/v/${"a".repeat(17)}/`, `/v/${"a".repeat(32)}/`, `/v/${"g".repeat(16)}/`])
    assert.equal(vaultPrefix(path), "");
});

test("the development proxy forwards short and legacy vault APIs and attachments", async () => {
  assert.equal(typeof viteConfig, "function");
  const config = await (viteConfig as import("vite").UserConfigFn)({ command: "serve", mode: "development" });
  const routes = Object.keys(config.server?.proxy ?? {}).filter(key => key.startsWith("^/v/"));
  assert.equal(routes.length, 1);
  const route = new RegExp(routes[0]);
  for (const id of ["a".repeat(16), "a".repeat(64)]) {
    assert(route.test(`/v/${id}/api/status`));
    assert(route.test(`/v/${id}/assets/example.png`));
    assert(!route.test(`/v/${id}/api-other`));
  }
  assert(!route.test(`/v/${"a".repeat(32)}/api/status`));
});
