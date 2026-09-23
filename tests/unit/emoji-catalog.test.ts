import assert from "node:assert/strict";
import test from "node:test";
import { emojiCount, emojiGroups, findEmoji } from "../../src/blocks/emoji-catalog";

test("Unicode Emoji 18 catalog contains every fully-qualified emoji and component once", () => {
  const icons = emojiGroups.flatMap(group => group.entries.map(([icon]) => icon));
  assert.equal(emojiCount, 3972);
  assert.equal(new Set(icons).size, emojiCount);
  assert.equal(emojiGroups.length, 10);
  for (const icon of ["😀", "👩🏽‍💻", "🇯🇵", "🛙", "🏿"]) assert.ok(icons.includes(icon), icon);
});

test("catalog search finds names, Unicode sequences and words across a name", () => {
  assert.deepEqual(findEmoji("lighthouse"), [["🛙", "lighthouse"]]);
  assert.ok(findEmoji("woman technologist medium skin tone").some(([icon]) => icon === "👩🏽‍💻"));
  assert.ok(findEmoji("🇯🇵").some(([icon]) => icon === "🇯🇵"));
  assert.deepEqual(findEmoji("not an emoji"), []);
});

test("catalog search includes official CLDR Other Keywords, including skin tone variants", () => {
  assert.ok(findEmoji("cheerful").some(([icon, name]) => icon === "😀" && name === "grinning face"));
  assert.ok(findEmoji("beacon").some(([icon, name]) => icon === "🛙" && name === "lighthouse"));
  assert.ok(findEmoji("coder medium skin tone").some(([icon]) => icon === "👩🏽‍💻"));
});
