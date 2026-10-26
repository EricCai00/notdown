export function mobileAssetKey(raw: string) {
  try { raw = decodeURIComponent(raw); } catch { return undefined; }
  return /^\/?assets\//.test(raw) ? raw.replace(/^\//, "") : undefined;
}

const mimeTypes: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", avif: "image/avif", pdf: "application/pdf", mp3: "audio/mpeg", mp4: "video/mp4", webm: "video/webm" };

/** Display cache only. Loads never hold up navigation or write a document. */
export class MobileAssetLoader {
  private urls = new Map<string, string>();
  private pending = new Map<string, Promise<void>>();
  private queue: (() => void)[] = [];
  private active = 0;
  private generation = 0;
  constructor(private read: (key: string) => Promise<Uint8Array>, private ready: (key: string, url: string) => void) {}

  resolve(raw: string) {
    const key = mobileAssetKey(raw);
    if (!key) return raw;
    const url = this.urls.get(key);
    if (!url) void this.load(raw).catch(() => { /* Missing attachments retain their source paths. */ });
    return url ?? raw;
  }
  load(raw: string): Promise<void> {
    const key = mobileAssetKey(raw);
    if (!key || this.urls.has(key)) return Promise.resolve();
    const pending = this.pending.get(key);
    if (pending) return pending;
    const generation = this.generation;
    const task = new Promise<void>((resolve, reject) => {
      this.queue.push(() => {
        if (generation !== this.generation) { resolve(); return; }
        this.active++;
        void this.read(key).then(bytes => {
          if (generation !== this.generation) return;
          const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], {
            type: mimeTypes[key.split(".").pop()!.toLowerCase()] ?? "application/octet-stream",
          }));
          this.urls.set(key, url); this.ready(key, url);
        }).then(resolve, reject).finally(() => { this.active--; this.drain(); });
      });
    }).finally(() => { if (this.pending.get(key) === task) this.pending.delete(key); });
    this.pending.set(key, task); this.drain(); return task;
  }
  private drain() { while (this.active < 4 && this.queue.length) this.queue.shift()!(); }
  clear() {
    this.generation++;
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear(); this.pending.clear(); this.drain();
  }
}

/** Node-view media ignore display mutations; editable link marks must retain their real href. */
export function refreshMobileAssetDisplays(root: HTMLElement, key: string, url: string) {
  for (const element of root.querySelectorAll("[src], [href], [data], [poster]")) {
    if (element.closest(".pm-document") && !element.closest('[contenteditable="false"]')) continue;
    for (const attribute of ["src", "href", "data", "poster"]) {
      const value = element.getAttribute(attribute);
      if (value && mobileAssetKey(value) === key) element.setAttribute(attribute, url);
    }
  }
}
