type FileExporter = (blob: Blob, name: string) => Promise<boolean>;

let exporter: FileExporter | undefined;

export function setFileExporter(value: FileExporter) { exporter = value; }

/** Platform entry points can provide a system save dialog for generated files. */
export async function exportFile(blob: Blob, name: string): Promise<boolean> {
  if (exporter) return exporter(blob, name);
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return true;
}
