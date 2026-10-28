import type { Buffer } from "buffer";
import type { VaultPlatform } from "./platform";
import { hashBytes, randomUUID } from "./crypto";
import { VaultError, type Page } from "./vault";
import type { ImportPlan } from "../../server/markdown-import";
import { documentMetadata } from "../features/metadata/document-metadata";
import { trashedPageIds } from "../features/pages/page-hierarchy";
import { pageExternalReferences } from "../features/references/external-source";
import { externalKey, notionId, type ExternalLibrary, type ExternalEntity, type ExternalObservation } from "../features/references/external-entity";
import type { Person } from "../features/people/person";

type Stored = { page: Page; source: string; metadata: Record<string, unknown> };
type RecordValue = ExternalObservation & { importIds?: string[]; binding?: string | null; [key: string]: unknown };
type Host = {
  root: string; platform: VaultPlatform;
  serialize<T>(operation: () => Promise<T>): Promise<T>;
  scan(): Promise<Map<string, Stored>>;
  people(): Promise<Person[]>;
  readMetadata(): Promise<Record<string, unknown>>;
  readOptional(path: string): Promise<string | null>;
  safeDirectory(path: string): Promise<void>;
  atomicWrite(path: string, data: string | Buffer, expected?: string | null): Promise<void>;
};
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
function records(metadata: Record<string, unknown>): Record<string, RecordValue> {
  if (metadata.externalEntities === undefined) return {};
  if (!object(metadata.externalEntities) || Object.entries(metadata.externalEntities).some(([key, value]) =>
    !object(value) || value.provider !== "notion" || !["page", "user", "database", "data-source", "block"].includes(value.kind) || typeof value.id !== "string" || externalKey(value as ExternalObservation) !== key ||
    (value.binding !== undefined && value.binding !== null && typeof value.binding !== "string") ||
    (value.importIds !== undefined && (!Array.isArray(value.importIds) || value.importIds.some((id: unknown) => typeof id !== "string")))))
    throw new VaultError(422, "Invalid external entity library; original metadata.json was preserved");
  return metadata.externalEntities as Record<string, RecordValue>;
}

/** The vault owns all writes. Reading recomputes availability; it never changes a note. */
export function createExternalEntities(host: Host) {
  const { path } = host.platform, filename = path.join(host.root, "metadata.json");
  const referenceCache = new Map<string, { revision: string; found: ReturnType<typeof pageExternalReferences> }>();
  async function persist(metadata: Record<string, unknown>, before: string | null, context: unknown) {
    const proposed = JSON.stringify(metadata, null, 2) + "\n";
    try { await host.atomicWrite(filename, proposed, before); }
    catch (error) {
      const directory = path.join(host.root, ".history", "external-entity-conflicts");
      await host.safeDirectory(directory);
      await host.atomicWrite(path.join(directory, `${randomUUID()}.json`), JSON.stringify({ before, proposed, context }, null, 2), null);
      throw new VaultError(409, "External references changed. Both metadata versions were preserved; refresh before saving again.");
    }
  }
  async function snapshot() {
    const before = await host.readOptional(filename), metadata = await host.readMetadata();
    if (before !== null && JSON.stringify(JSON.parse(before)) !== JSON.stringify(metadata)) throw new VaultError(409, "Metadata changed while reading external references; refresh before saving.");
    return { before, metadata };
  }
  async function library(metadata: Record<string, unknown>): Promise<ExternalLibrary> {
    const stored = [...(await host.scan()).values()], people = await host.people();
    const hidden = trashedPageIds(stored.map(item => item.page));
    const saved = records(metadata), pagesById = new Map(stored.map(item => [item.page.id, item.page])), peopleById = new Map(people.map(person => [person.id, person]));
    for (const id of referenceCache.keys()) if (!pagesById.has(id)) referenceCache.delete(id);
    const entities = new Map<string, ExternalEntity>(), warnings: string[] = [];
    const add = (observation: ExternalObservation, importIds: string[] = []) => {
      const key = externalKey(observation);
      let entity = entities.get(key);
      if (!entity) { entity = { ...observation, key, candidates: [], references: [], importIds, status: "unresolved" }; entities.set(key, entity); }
      else {
        if (!entity.label && observation.label) entity.label = observation.label;
        if (!entity.url && observation.url) entity.url = observation.url;
        if (!entity.data && observation.data) entity.data = observation.data;
      }
      return entity;
    };
    for (const value of Object.values(saved)) add(value, value.importIds);
    for (const item of stored) {
      const origin = { ...item.metadata, ...documentMetadata(item.source).values }.notionImport as Record<string, unknown> | undefined;
      const id = notionId(origin?.pageId);
      if (id) {
        const kind = item.page.databaseId ? "database" : "page";
        const entity = add({ provider: "notion", kind, id, label: item.page.title });
        if (!hidden.has(item.page.id)) entity.candidates.push(item.page.id);
        // Page mentions to a database host retain page semantics as well.
        if (kind === "database" && !hidden.has(item.page.id)) add({ provider: "notion", kind: "page", id, label: item.page.title }).candidates.push(item.page.id);
      }
      if (hidden.has(item.page.id)) continue;
      let cached = referenceCache.get(item.page.id);
      if (!cached || cached.revision !== item.page.revision) { cached = { revision: item.page.revision, found: pageExternalReferences(item.page) }; referenceCache.set(item.page.id, cached); }
      const found = cached.found;
      if (found.uncertain) warnings.push(`Some references in “${item.page.title}” could not be checked.`);
      for (const observation of found.observations) {
        const entity = add(observation);
        if (!entity.references.some(ref => ref.pageId === item.page.id && ref.location === observation.location && ref.occurrence === observation.occurrence))
          entity.references.push({ pageId: item.page.id, location: observation.location, ...(observation.occurrence !== undefined ? { occurrence: observation.occurrence } : {}) });
      }
    }
    for (const person of people) if (!person.deleted && person.notionUserId) add({ provider: "notion", kind: "user", id: person.notionUserId, label: person.name }).candidates.push(person.id);
    if (object(metadata.dataSources) && object(metadata.databases)) for (const source of Object.values(metadata.dataSources)) {
      if (!object(source)) continue;
      const id = notionId(source.notion?.id);
      if (!id) continue;
      const entity = add({ provider: "notion", kind: "data-source", id, label: source.title });
      for (const database of Object.values(metadata.databases)) if (object(database) && database.dataSourceIds?.includes(source.id)) {
        const hostId = database.pageId || database.id;
        if (pagesById.has(hostId) && !hidden.has(hostId)) entity.candidates.push(hostId);
      }
    }
    for (const entity of entities.values()) {
      entity.references.sort((a, b) => a.pageId.localeCompare(b.pageId) || a.location.localeCompare(b.location));
      entity.candidates = [...new Set(entity.candidates)].sort();
      const binding = saved[entity.key]?.binding;
      const valid = entity.kind === "user" ? !!binding && peopleById.has(binding) && !peopleById.get(binding)!.deleted
        : entity.kind === "page" || entity.kind === "database" ? !!binding && pagesById.has(binding) && !hidden.has(binding) && (entity.kind !== "database" || !!pagesById.get(binding)!.databaseId) : false;
      const localId = binding ? valid ? binding : undefined : entity.candidates.length === 1 ? entity.candidates[0] : undefined;
      entity.status = localId ? "resolved" : entity.candidates.length > 1 ? "ambiguous" : "unresolved";
      if (localId) {
        entity.localId = localId;
        entity.label = entity.kind === "user" ? peopleById.get(localId)?.name : pagesById.get(localId)?.title;
      }
    }
    const result = [...entities.values()].sort((a, b) => a.key.localeCompare(b.key));
    return { revision: hashBytes(JSON.stringify([records(metadata), result])), entities: result, warnings };
  }
  return {
    list: () => host.serialize(async () => library(await host.readMetadata())),
    /** Import observations survive even if their original note is later removed. */
    async registerImportedLocked(plan: ImportPlan) {
      const observations: ExternalObservation[] = [];
      for (const item of plan.pages) {
        const origin = item.metadata.notionImport as Record<string, unknown> | undefined, id = notionId(origin?.pageId);
        if (!id) continue;
        observations.push({ provider: "notion", kind: item.metadata.databaseId ? "database" : "page", id, label: String(item.metadata.title ?? ""), url: `https://www.notion.so/${id}` });
        const page = { ...item.metadata, id: item.id, body: item.source, properties: item.metadata.properties ?? {} } as Page;
        observations.push(...pageExternalReferences(page).observations);
        const original = plan.originals.find(file => file.path === `pages/${id}.md`);
        if (original) observations.push(...pageExternalReferences({ ...page, body: original.data.toString("utf8") }).observations);
      }
      if (plan.databaseResources) for (const group of ["databases", "dataSources"] as const) {
        for (const resource of Object.values(plan.databaseResources[group])) {
          const raw = resource.notion;
          const id = object(raw) ? notionId(raw.id) : undefined;
          if (id) observations.push({ provider: "notion", kind: group === "databases" ? "database" : "data-source", id, label: resource.title,
            url: group === "databases" ? `https://www.notion.so/${id}` : `collection://${id}` });
        }
      }
      // Full users are sometimes embedded in page/People responses; partial users
      // remain unresolved. Raw data stays available without inventing a profile.
      const visit = (value: unknown) => {
        if (Array.isArray(value)) { value.forEach(visit); return; }
        if (!object(value)) return;
        if (value.object === "user" && notionId(value.id)) observations.push({ provider: "notion", kind: "user", id: notionId(value.id)!, label: typeof value.name === "string" ? value.name : undefined, data: value });
        Object.values(value).forEach(visit);
      };
      for (const original of plan.originals) if (original.path.endsWith(".json")) {
        try { visit(JSON.parse(original.data.toString("utf8"))); } catch { /* Original archive remains authoritative. */ }
      }
      if (!observations.length) return [];
      const { before, metadata } = await snapshot(), next = { ...records(metadata) };
      for (const observation of observations) {
        const key = externalKey(observation), prior = next[key];
        next[key] = { ...prior, provider: observation.provider, kind: observation.kind, id: observation.id,
          ...(observation.url ? { url: observation.url } : {}), label: prior?.label || observation.label,
          ...(prior?.data || observation.data ? { data: { ...prior?.data, ...observation.data,
            ...(prior?.data?.name && !observation.data?.name ? { name: prior.data.name } : {}) } } : {}),
          importIds: [...new Set([...(prior?.importIds ?? []), plan.id])].sort() };
      }
      if (JSON.stringify(next) !== JSON.stringify(records(metadata))) {
        metadata.externalEntities = next;
        await persist(metadata, before, { importId: plan.id });
      }
      return observations;
    },
    bind(key: string, localId: string | null, baseRevision: string) {
      return host.serialize(async () => {
        if (typeof key !== "string" || !(localId === null || typeof localId === "string") || typeof baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(baseRevision)) throw new VaultError(400, "An external identity, target and valid baseRevision are required");
        const { before, metadata } = await snapshot(), current = await library(metadata);
        const entity = current.entities.find(entity => entity.key === key);
        if (!entity) throw new VaultError(404, "External entity not found");
        const proposed = { ...records(metadata), [key]: { ...records(metadata)[key], provider: entity.provider, kind: entity.kind, id: entity.id, label: entity.label, url: entity.url, data: entity.data, importIds: entity.importIds, binding: localId } };
        if (current.revision !== baseRevision) {
          const directory = path.join(host.root, ".history", "external-entity-conflicts");
          await host.safeDirectory(directory);
          await host.atomicWrite(path.join(directory, `${randomUUID()}.json`), JSON.stringify({ current: metadata, proposed: { ...metadata, externalEntities: proposed }, baseRevision }, null, 2), null);
          throw new VaultError(409, "External references changed. Both versions were preserved; review the current library before saving.");
        }
        if (localId !== null) {
          const stored = [...(await host.scan()).values()], hidden = trashedPageIds(stored.map(item => item.page));
          const valid = entity.kind === "user" ? (await host.people()).some(person => person.id === localId && !person.deleted)
            : ["page", "database"].includes(entity.kind) && stored.some(item => item.page.id === localId && !hidden.has(localId) && (entity.kind !== "database" || !!item.page.databaseId));
          if (!valid) throw new VaultError(422, "Choose an available local object of the same kind");
        }
        metadata.externalEntities = proposed;
        await persist(metadata, before, { key, localId, baseRevision });
        return library(metadata);
      });
    },
  };
}
