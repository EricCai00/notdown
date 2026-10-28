import assert from "node:assert/strict";
import test from "node:test";
import { parseBookmarkMetadata } from "../../server/bookmarks";

const image = (html: string, url = "https://example.com/articles/post") => parseBookmarkMetadata(html, url).image;

test("bookmark images prefer declared preview metadata and skip unsafe or empty candidates", () => {
  assert.equal(image('<meta name="twitter:image" content="/twitter.jpg"><meta property="og:image" content="/og.jpg">'), "https://example.com/og.jpg");
  assert.equal(image('<meta property="og:image" content="javascript:alert(1)"><meta property="og:image" content="/second.jpg"><meta name="twitter:image" content="/twitter.jpg">'), "https://example.com/second.jpg");
  assert.equal(image('<meta property="og:image" content="data:image/png;base64,abc"><meta name="twitter:image:src" content="//cdn.example.com/twitter.jpg">'), "https://cdn.example.com/twitter.jpg");
  for (const property of ["og:image:url", "og:image:secure_url"]) assert.equal(image(`<meta property="${property}" content="/cover.jpg">`), "https://example.com/cover.jpg");
  assert.equal(image('<meta property="og:image" content="https://user:password@example.com/private.jpg"><meta name="twitter:image" content="  ">'), "");
});

test("bookmark image URLs respect base URLs and explicit link/microdata declarations", () => {
  assert.equal(image('<base href="https://cdn.example.com/images/"><link rel="image_src" href="cover.jpg">'), "https://cdn.example.com/images/cover.jpg");
  assert.equal(image('<base href="javascript:alert(1)"><link rel="image_src" href="./cover.jpg">'), "https://example.com/articles/cover.jpg");
  for (const html of ['<meta itemprop="image" content="/cover.jpg">', '<link itemprop="image" href="/cover.jpg">', '<img itemprop="image" src="/cover.jpg">']) assert.equal(image(html), "https://example.com/cover.jpg");
  assert.equal(image('<img src="/ad.jpg"><img class="avatar" src="/user.jpg">'), "");
});

test("JSON-LD selects main images without executing script or choosing author/organization images", () => {
  const json = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
  assert.equal(image(json({ "@graph": [{ "@type": "Organization", image: "/logo.jpg" }, { "@type": "Article", image: { contentUrl: "/article.jpg" }, author: { image: "/avatar.jpg" } }, { "@type": "WebPage", primaryImageOfPage: { url: "/primary.jpg" } }] })), "https://example.com/primary.jpg");
  assert.equal(image(json({ "@type": "WebPage", mainEntity: { "@type": "Product", image: ["javascript:alert(1)", "/product.jpg"] }, image: "/page.jpg" })), "https://example.com/product.jpg");
  assert.equal(image(json({ "@type": "Article", author: { image: "/avatar.jpg" } })), "");
  assert.equal(image(json({ "@type": "WebPage", primaryImageOfPage: { "@id": "#cover" } })), "");
  assert.equal(image('<script type="application/ld+json">throw new Error("never run")</script><img itemprop="image" src="/valid.jpg">'), "https://example.com/valid.jpg");
  let nested: unknown = { image: "/too-deep.jpg" };
  for (let i = 0; i < 30; i++) nested = { mainEntity: nested };
  assert.equal(image(json(nested)), "");
});

test("Bangumi subject fallback selects the actual cover, not avatars or unrelated images", () => {
  const html = '<img src="/banner.jpg"><div id="bangumiInfo"><img class="avatarCover" src="/user.jpg"><div class="infobox"><a class="thickbox cover"><img src="//lain.bgm.tv/r/400/pic/cover/l/fb/c2/236020_6wt6b.jpg" class="cover"></a></div></div>';
  for (const host of ["bgm.tv", "bangumi.tv", "chii.in"]) assert.equal(image(html, `https://${host}/subject/236020`), "https://lain.bgm.tv/r/400/pic/cover/l/fb/c2/236020_6wt6b.jpg");
  for (const url of ["https://example.com/subject/236020", "https://bgm.tv.evil.test/subject/236020", "https://bgm.tv/subject/236020/reviews"]) assert.equal(image(html, url), "");
  assert.equal(image('<img class="cover" src="/unrelated.jpg"><div id="bangumiInfo"><img class="avatarCover" src="/avatar.jpg"></div>', "https://bgm.tv/subject/236020"), "");
  assert.equal(image('<meta property="og:image" content="/declared.jpg">' + html, "https://bgm.tv/subject/236020"), "https://bgm.tv/declared.jpg");
});
