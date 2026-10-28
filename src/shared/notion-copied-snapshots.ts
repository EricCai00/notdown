const MAX_BYTES = 5 * 1024 * 1024;
type Json = Record<string, any>;
const bytes = (value: string) => new TextEncoder().encode(value).length;

/** Keep explicit reads in order, so a newer copy supersedes the same selection. */
export function appendCopiedNotionBlocks(previous: string | undefined, incoming: string) {
  const read = (value: string): Json[] => {
    if (bytes(value) > MAX_BYTES) throw new Error("Copied Notion snapshots exceed 5 MiB.");
    const parsed = JSON.parse(value);
    const items = parsed.version === 2 ? parsed.snapshots : [parsed];
    if (!Array.isArray(items) || !items.length || items.length > 1000 || items.some(item => item?.version !== 1 || item.source?.table !== "block" || typeof item.source.id !== "string" || typeof item.source.spaceId !== "string" || item.data?.action !== "copy" || !Array.isArray(item.data.blocks) || !item.data.blocks.length || item.data.blocks.some((block: Json) => typeof block?.blockId !== "string"))) throw new Error("Invalid copied Notion snapshots.");
    return items;
  };
  const selection = (item: Json) => JSON.stringify([item.source.spaceId, item.source.id, item.data.blocks.map((block: Json) => block.blockId).sort()]);
  let snapshots = previous ? read(previous) : [];
  const additions = read(incoming);
  for (const item of additions) snapshots = [...snapshots.filter(old => selection(old) !== selection(item)), item];
  if (snapshots.length > 1000) throw new Error("Too many copied Notion snapshots.");
  const data = JSON.stringify({ version: 2, snapshots });
  if (bytes(data) > MAX_BYTES) throw new Error("Copied Notion snapshots exceed 5 MiB.");
  return { data, sourceId: additions.at(-1)!.source.id as string, copies: snapshots.length, pages: new Set(snapshots.map(item => `${item.source.spaceId}/${item.source.id}`)).size };
}
