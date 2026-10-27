import { api } from "../../shared/types";
import { externalIdentity, externalKey, type ExternalKind, type ExternalLibrary } from "./external-entity";

let library: ExternalLibrary = { revision: "", entities: [], warnings: [] };
let loading: Promise<void> | undefined;
let epoch = 0;
let byKey = new Map<string, ExternalLibrary["entities"][number]>();
export const externalEntitiesChanged = "notdown-external-entities-changed";
export const externalLibrary = () => library;
export function setExternalLibrary(next: ExternalLibrary) {
  epoch++;
  if (JSON.stringify(next) === JSON.stringify(library)) return;
  library = next;
  byKey = new Map(next.entities.map(entity => [entity.key, entity]));
  document.dispatchEvent(new Event(externalEntitiesChanged));
}
export function refreshExternalEntities() {
  if (loading) return loading;
  const started = epoch;
  loading = api<ExternalLibrary>("/external-entities").then(next => { if (started === epoch) setExternalLibrary(next); }).finally(() => { loading = undefined; });
  return loading;
}
export function resolveExternal(value: unknown, kind?: ExternalKind) {
  const identity = externalIdentity(value, kind);
  return identity ? byKey.get(externalKey(identity)) : undefined;
}
