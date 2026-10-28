const MAX_BYTES = 5 * 1024 * 1024;
const BLOCKS = "text/_notion-blocks-v3-production";
const SOURCE = "text/_notion-page-source-production";
const CUSTOM = 'electron application/osclipboard;format="Chromium Web Custom MIME Data Format"';
const message = "Copy buttons or their page in Notion with Ctrl+C, then read copied blocks again.";

/** Chromium's legacy custom clipboard map is a bounded, aligned String16 pickle. */
export function notionClipboardMap(bytes: Uint8Array): Map<string, string> {
  const data = Buffer.from(bytes);
  if (data.length < 8 || data.length > MAX_BYTES || data.readUInt32LE(0) !== data.length - 4) throw new Error(message);
  const count = data.readUInt32LE(4), values = new Map<string, string>();
  if (count > 32) throw new Error(message);
  let offset = 8;
  const read = () => {
    if (offset + 4 > data.length) throw new Error(message);
    const length = data.readUInt32LE(offset); offset += 4;
    if (length > MAX_BYTES / 2 || offset + length * 2 > data.length) throw new Error(message);
    const text = data.subarray(offset, offset + length * 2).toString("utf16le");
    offset = Math.ceil((offset + length * 2) / 4) * 4;
    return text;
  };
  for (let index = 0; index < count; index++) {
    const key = read(), value = read();
    if (values.has(key)) throw new Error(message);
    if (key === BLOCKS || key === SOURCE) values.set(key, value);
  }
  if (offset !== data.length) throw new Error(message);
  return values;
}

/** Called only by the explicit import-dialog action; never read text, HTML or credentials. */
export async function readNotionClipboard(items: readonly { types: readonly string[]; getType(type: string): Promise<Blob | unknown> }[]): Promise<string> {
  const values = new Map<string, string>();
  const merge = (entries: Map<string, string>) => {
    for (const [key, value] of entries) {
      if (values.has(key) && values.get(key) !== value) throw new Error(message);
      values.set(key, value);
    }
  };
  let bytes = 0;
  for (const item of items) for (const type of item.types) {
    if (![BLOCKS, SOURCE, CUSTOM].includes(type)) continue;
    const blob = await item.getType(type);
    if (!(blob instanceof Blob) || (bytes += blob.size) > MAX_BYTES) throw new Error(message);
    if (type === CUSTOM) merge(notionClipboardMap(new Uint8Array(await blob.arrayBuffer())));
    else merge(new Map([[type, await blob.text()]]));
  }
  try {
    const data = JSON.parse(values.get(BLOCKS) || ""), source = JSON.parse(values.get(SOURCE) || "");
    const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
    if (data.action !== "copy" || !Array.isArray(data.blocks) || !data.blocks.length || data.blocks.length > 1000 || source.table !== "block" || !uuid.test(source.id) || !uuid.test(source.spaceId)) throw new Error(message);
    const result = JSON.stringify({ version: 1, source, data });
    if (Buffer.byteLength(result) > MAX_BYTES) throw new Error(message);
    return result;
  } catch { throw new Error(message); }
}
