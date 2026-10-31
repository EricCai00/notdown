import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { createVault } from "../../server/vault.js";

/** Build the historical on-disk format in a temporary test vault, without a production format switch. */
export async function createLegacyDatabase(root: string, vault: ReturnType<typeof createVault>, input: Parameters<ReturnType<typeof createVault>["databases"]["create"]>[0]) {
  const created = await vault.databases.create(input), { database, hostPage } = created;
  const metadataFile = path.join(root, "metadata.json"), index = JSON.parse(await fs.readFile(metadataFile, "utf8"));
  const { storage: _storage, ...legacy } = database;
  for (const key of ["ownedDataSourceIds", "pageMetadata", "icon", "parent", "properties", "updated", "trashed", "favorite", "fullWidth", "sidebarOrder"]) delete legacy[key];
  (index.databases ??= {})[database.id] = legacy;
  for (const source of created.dataSources) (index.dataSources ??= {})[source.id] = source;
  for (const view of created.views) {
    const { sourceDatabaseId: _owner, linked: _linked, ...legacyView } = view;
    (index.views ??= {})[view.id] = legacyView;
  }
  index.pages[hostPage!.id] = { ...index.pages[hostPage!.id], id: hostPage!.id, title: hostPage!.title, parent: hostPage!.parent,
    icon: hostPage!.icon, properties: hostPage!.properties, databaseId: database.id, updated: hostPage!.updated,
    bodyFormat: hostPage!.bodyFormat, ...(hostPage!.wiki ? { wiki: true } : {}),
    file: hostPage!.id + ".md", sourceHash: createHash("sha256").update(hostPage!.body).digest("hex") };
  await fs.writeFile(path.join(root, "pages", hostPage!.id + ".md"), hostPage!.body);
  await fs.writeFile(metadataFile, JSON.stringify(index, null, 2) + "\n");
  await fs.unlink(path.join(root, "databases", database.id + ".json"));
  return vault.databases.get(database.id);
}
