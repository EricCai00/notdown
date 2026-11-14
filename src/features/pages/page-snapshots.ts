import { api, type Page } from "../../shared/types";
import { pageSnapshotHeader, type PageSnapshot } from "../../shared/page-snapshot";

/** Private disk snapshots: drafts and mutable workspace pages cannot poison them. */
export class WorkspacePageSnapshots {
  private baseline: { token: string; pages: Map<string, Page> } | undefined;
  private generation = 0;

  constructor(private read = (token: string) => api<Page[] | PageSnapshot>("/pages", {
    headers: { [pageSnapshotHeader]: token },
  })) {}

  async load(): Promise<Page[]> {
    const generation = ++this.generation, baseline = this.baseline;
    const response = await this.read(baseline?.token ?? "initial");
    // Older local servers still return the full list.
    if (Array.isArray(response)) return response;
    const pages = response.pages.map(entry => {
      if (typeof entry !== "string") return entry;
      const page = baseline?.pages.get(entry);
      if (!page) throw new Error("Page snapshot expired; reload the workspace.");
      return page;
    });
    if (generation === this.generation) this.baseline = { token: response.snapshot, pages: new Map(pages.map(page => [page.id, page])) };
    return structuredClone(pages);
  }
}
