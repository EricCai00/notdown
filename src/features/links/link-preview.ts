/** Provider classification is shared by the paste UI and the fixed-host resolver. */
export type LinkTarget = {
  provider: "github" | "onedrive";
  url: string;
  label: string;
  owner?: string;
  repo?: string;
  kind?: "issue" | "pull" | "code" | "repository";
  number?: string;
  ref?: string;
  file?: string;
  start?: number;
  end?: number;
};
export interface LinkPreviewData {
  provider: LinkTarget["provider"];
  url: string;
  title: string;
  kind: string;
  description?: string;
  state?: string;
  author?: string;
  avatar?: string;
  repository?: string;
  number?: string;
  updated?: string;
  image?: string;
  size?: number;
  mime?: string;
  code?: string;
  start?: number;
  truncated?: boolean;
}
export function httpsUrl(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length > 8192 ||
    /[\s\u0000-\u001f]/.test(value)
  )
    return "";
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password && !u.port
      ? u.href
      : "";
  } catch {
    return "";
  }
}
export function linkTarget(value: string): LinkTarget | undefined {
  const url = httpsUrl(value);
  if (!url) return;
  const u = new URL(url),
    host = u.hostname;
  if (
    ["1drv.ms", "onedrive.live.com"].includes(host) ||
    /^[a-z0-9-]+\.sharepoint\.com$/.test(host)
  )
    return { provider: "onedrive", url, label: "OneDrive file" };
  if (host !== "github.com") return;
  let parts: string[];
  try {
    parts = u.pathname.split("/").slice(1).map(decodeURIComponent);
  } catch {
    return;
  }
  const [owner, repo, type, id, ...rest] = parts;
  if (
    !/^[\w-]+$/.test(owner || "") ||
    !/^[\w.-]+$/.test(repo || "") ||
    [".", ".."].includes(repo)
  )
    return;
  const base = { provider: "github" as const, url, owner, repo };
  if ((!type || (!id && type === "")) && !rest.length)
    return { ...base, kind: "repository", label: `${owner}/${repo}` };
  if (
    ["issues", "pull"].includes(type) &&
    /^\d+$/.test(id) &&
    (!rest.length || (rest.length === 1 && !rest[0]))
  )
    return {
      ...base,
      kind: type === "pull" ? "pull" : "issue",
      number: id,
      label: `${type === "pull" ? "Pull Request" : "Issue"} #${id}`,
    };
  if (
    type === "blob" &&
    id &&
    rest.length &&
    rest.every(
      (s) =>
        s && s !== "." && s !== ".." && !s.includes("/") && !s.includes("\\"),
    )
  ) {
    const lines = /^#L(\d+)(?:-L(\d+))?$/.exec(u.hash);
    const start = lines ? Number(lines[1]) : 1,
      end = lines ? Number(lines[2] || lines[1]) : undefined;
    if (
      !Number.isSafeInteger(start) ||
      start < 1 ||
      (end !== undefined && (!Number.isSafeInteger(end) || end < start))
    )
      return;
    return {
      ...base,
      kind: "code",
      ref: id,
      file: rest.join("/"),
      start,
      end,
      label: rest.at(-1)!,
    };
  }
}
