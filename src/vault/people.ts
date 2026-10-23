import type { Buffer } from "buffer";
import { hashBytes, randomUUID } from "./crypto.js";
import type { VaultPlatform, StorageError } from "./platform.js";
import { Document, isMap, parseDocument } from "yaml";
import { VaultError, assertId } from "./vault.js";
import { personFields, type Person, type PersonInput } from "../features/people/person.js";

type Storage = {
  platform: VaultPlatform;
  root: string;
  init(): Promise<void>;
  safeDirectory(directory: string): Promise<void>;
  atomicWrite(file: string, source: string): Promise<void>;
  serialize<T>(operation: () => Promise<T>): Promise<T>;
};
type Stored = { person: Person; source: string; document: Document; file: string };
const hash = (source: string) => hashBytes(source);
function validate(input: PersonInput) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new VaultError(400, "A person object is required");
  for (const field of personFields) {
    if (!(field in input)) continue;
    const value = input[field];
    if (typeof value !== "string" || value.length > (field === "notes" ? 20000 : 500) || field === "name" && !value.trim())
      throw new VaultError(400, `Invalid person ${field}`);
  }
  if ("deleted" in input && typeof input.deleted !== "boolean") throw new VaultError(400, "deleted must be a boolean");
}

/** Called only by createVault; shares its mutation queue and atomic file writer. */
export function createPeople(storage: Storage) {
  const { fs, path } = storage.platform;
  const directory = path.join(storage.root, "people");
  const history = path.join(storage.root, ".history", "people");
  async function ready() {
    await storage.init();
    await storage.safeDirectory(storage.root);
    await storage.safeDirectory(directory);
    await storage.safeDirectory(path.dirname(history));
    await storage.safeDirectory(history);
  }
  function decode(source: string, file: string): Stored {
    try {
      const document = parseDocument(source, { uniqueKeys: true });
      if (document.errors.length || !isMap(document.contents)) throw new Error();
      const data = document.toJS({ maxAliasCount: 50 });
      assertId(data.id);
      validate(data);
      if (typeof data.name !== "string" || typeof data.created !== "string" || typeof data.updated !== "string") throw new Error();
      const person: Person = { id: data.id, name: data.name, email: data.email ?? "", phone: data.phone ?? "", organization: data.organization ?? "", notes: data.notes ?? "", deleted: data.deleted ?? false, created: data.created, updated: data.updated, revision: hash(source) };
      return { person, source, document, file };
    } catch { throw new VaultError(422, `Invalid person YAML: ${path.basename(file)}`); }
  }
  async function scan() {
    await ready();
    const people = new Map<string, Stored>();
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
      const file = path.join(directory, entry.name);
      const stat = await fs.lstat(file);
      if (stat.isSymbolicLink() || !stat.isFile()) continue;
      const stored = decode(await fs.readFile(file, "utf8"), file);
      if (people.has(stored.person.id)) throw new VaultError(422, `Duplicate person ID: ${stored.person.id}`);
      people.set(stored.person.id, stored);
    }
    return people;
  }
  function encode(previous: Stored | undefined, id: string, input: PersonInput) {
    const document = previous?.document.clone() ?? new Document();
    const now = new Date().toISOString();
    if (!previous) {
      document.set("id", id);
      document.set("created", now);
      document.set("deleted", false);
      for (const field of personFields) document.set(field, "");
    }
    for (const field of [...personFields, "deleted"] as const) {
      if (Object.prototype.hasOwnProperty.call(input, field)) document.set(field, field === "name" ? input.name!.trim() : input[field]);
    }
    document.set("updated", now);
    return document.toString({ lineWidth: 0 });
  }
  async function preserveConflict(current: Stored, proposed: string, baseRevision: string): Promise<never> {
    const conflictId = randomUUID();
    const folder = path.join(history, "conflicts");
    await storage.safeDirectory(folder);
    await storage.atomicWrite(path.join(folder, `${conflictId}.current.yaml`), current.source);
    await storage.atomicWrite(path.join(folder, `${conflictId}.proposed.yaml`), proposed);
    await storage.atomicWrite(path.join(folder, `${conflictId}.json`), JSON.stringify({ personId: current.person.id, conflictId, baseRevision, currentRevision: current.person.revision, createdAt: new Date().toISOString() }, null, 2));
    throw new VaultError(409, "This person changed in another window or file. Both versions were preserved; review the latest contact before saving again.", { conflictId, current: current.person, proposed: decode(proposed, current.file).person });
  }
  return {
    async list(includeDeleted = false): Promise<Person[]> {
      return [...(await scan()).values()].map(item => item.person).filter(person => includeDeleted || !person.deleted).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    },
    async get(id: string): Promise<Person> {
      assertId(id);
      const found = (await scan()).get(id);
      if (!found) throw new VaultError(404, "Person not found");
      return found.person;
    },
    create(input: PersonInput): Promise<Person> {
      return storage.serialize(async () => {
        validate(input);
        if (!input.name?.trim()) throw new VaultError(400, "Name is required");
        await ready();
        const id = randomUUID(), file = path.join(directory, `${id}.yaml`);
        const source = encode(undefined, id, input);
        // Creation must never replace an existing file, including an unknown one.
        await fs.writeFile(file, source, { flag: "wx", mode: 0o600 });
        return decode(source, file).person;
      });
    },
    update(id: string, input: PersonInput, baseRevision: string): Promise<Person> {
      return storage.serialize(async () => {
        assertId(id);
        validate(input);
        if (typeof baseRevision !== "string" || !/^[a-f0-9]{64}$/.test(baseRevision)) throw new VaultError(400, "Saving a person requires a valid baseRevision");
        const current = (await scan()).get(id);
        if (!current) throw new VaultError(404, "Person not found");
        const source = encode(current, id, input);
        if (current.person.revision !== baseRevision) return preserveConflict(current, source, baseRevision);
        const folder = path.join(history, id);
        await storage.safeDirectory(folder);
        await storage.atomicWrite(path.join(folder, `${baseRevision}.yaml`), current.source);
        const stat = await fs.lstat(current.file);
        if (stat.isSymbolicLink() || !stat.isFile()) throw new VaultError(422, "Invalid person file");
        const latest = decode(await fs.readFile(current.file, "utf8"), current.file);
        if (latest.person.revision !== baseRevision) return preserveConflict(latest, source, baseRevision);
        await storage.atomicWrite(current.file, source);
        return decode(source, current.file).person;
      });
    },
  };
}
