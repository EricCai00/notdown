import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveLanguage, setUILanguage, t } from "../../src/shared/i18n";

test("interface language defaults to English and preserves explicit preferences", () => {
  assert.equal(resolveLanguage("en"), "en");
  assert.equal(resolveLanguage("zh-CN"), "zh-CN");
  assert.equal(resolveLanguage(null), "en");
  assert.equal(resolveLanguage("invalid"), "en");
});

test("messages fall back safely and interpolate values without translating them", () => {
  setUILanguage("zh-CN");
  assert.equal(t("Search"), "搜索");
  assert.equal(t("Page actions for {title}", { title: "Search" }), "Search 的页面操作");
  assert.equal(t("A new untranslated message"), "A new untranslated message");
  assert.equal(t("constructor"), "constructor");
  setUILanguage("en");
  assert.equal(t("Search"), "Search");
});
