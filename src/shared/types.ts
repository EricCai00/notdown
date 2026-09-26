export interface Page {
  pageEntryEvidence?: import("../document/page-entry-projection").PageEntryEvidence;
  id: string;
  title: string;
  parent: string | null;
  icon: string;
  properties: Record<string, unknown>;
  body: string;
  bodyFormat?: import("../document/notion-syntax").BodyFormat;
  syntax?: import("../markdown-engine/config").SyntaxConfig;
  revision: string;
  updated: string;
  favorite?: boolean;
  trashed?: boolean;
  sidebarOrder?: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: any,
  ) {
    super(data.error || data.message || `Request failed (${status})`);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(response.status, result);
  return result;
}

export function escape(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
