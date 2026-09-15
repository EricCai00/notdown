import type { Page } from "./types";

/** Literal CJK-aware matching, with exact quoted phrases and title priority. */
export function searchPages(
  pages: Page[],
  query: string,
  recent: string[] = [],
): Page[] {
  const raw = query.trim().toLocaleLowerCase();
  if (!raw) {
    const byId = new Map(pages.map((page) => [page.id, page]));
    const visited = recent
      .map((id) => byId.get(id))
      .filter((page): page is Page => !!page);
    return visited.length
      ? visited
      : [...pages].sort((a, b) => b.updated.localeCompare(a.updated));
  }
  const phrases = [...raw.matchAll(/"([^"]+)"|(\S+)/g)].map(
    (match) => match[1] ?? match[2],
  );
  const rank = (page: Page): number => {
    const title = page.title.toLocaleLowerCase();
    const body =
      `${page.body} ${JSON.stringify(page.properties)}`.toLocaleLowerCase();
    if (!phrases.every((term) => title.includes(term) || body.includes(term)))
      return -1;
    const titleHits = phrases.filter((term) => title.includes(term)).length;
    return (
      titleHits * 10 +
      (title === phrases.join(" ") ? 20 : title.startsWith(phrases[0]) ? 5 : 0)
    );
  };
  return pages
    .map((page) => ({ page, score: rank(page) }))
    .filter((item) => item.score >= 0)
    .sort(
      (a, b) =>
        b.score - a.score || b.page.updated.localeCompare(a.page.updated),
    )
    .map((item) => item.page);
}
