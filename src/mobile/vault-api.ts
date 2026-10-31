import { ApiError, type ApiTransport } from "../shared/types";
import { VaultError, type createVault } from "../vault/vault";

export type MobileVault = ReturnType<typeof createVault>;
/** Shared editor requests call the same local vault, without an HTTP server. */
export function mobileVaultApi(current: () => MobileVault): ApiTransport {
  return async (path, options) => {
    const url = new URL(path, "https://notdown.local"), method = options.method ?? "GET";
    const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent), [resource, id, operation, child] = parts;
    const input = typeof options.body === "string" ? JSON.parse(options.body) : {};
    const vault = current();
    try {
      if (resource === "status" && method === "GET") return { vaultPath: vault.vaultPath };
      if (resource === "database-storage" && id === "migration") {
        if (method === "GET") return await vault.databaseStorage.plan();
        if (method === "POST") return await vault.databaseStorage.migrate(input.baseRevision);
      }
      if (resource === "sync" && id) {
        if (method === "POST" && id === "connect" && !input.vaultId)
          throw new ApiError(400, { error: "Choose an existing cloud notebook created on your computer." });
        return await vault.sync.handle(id, method, input);
      }
      if (resource === "conflicts") {
        if (method === "GET" && !id) return await vault.listConflicts();
        if (method === "POST" && operation === "resolve") { const { baseRevision, schemaRevision, ...patch } = input; return await vault.resolveConflict(id, patch, baseRevision, schemaRevision); }
      }
      if (resource === "pages") {
        if (method === "POST" && operation === "wiki") return await vault.databases.turnIntoWiki(id, input.baseRevision);
        if (method === "POST" && operation === "insert-into-parent") return await vault.insertChildPage(id, input);
        if (method === "GET") return await (id ? vault.get(id) : vault.list({ includeTrashed: url.searchParams.get("includeTrashed") === "true" }));
        if (method === "POST" && !id) return await vault.create(input);
        if (method === "PUT" && id) { const { baseRevision, schemaRevision, ...patch } = input; return await vault.update(id, patch, baseRevision, schemaRevision); }
      }
      if (resource === "child-pages" && id === "settings") {
        if (method === "GET") return await vault.childPageSettings.get();
        if (method === "PUT") return await vault.childPageSettings.configure(input);
      }
      if (resource === "assets" && method === "POST") return await vault.uploadAsset(input.name, input.contentType, input.data);
      if (resource === "assets" && method === "GET" && id === "info") return await vault.assetInfo(url.searchParams.get("path"));
      if (resource === "assets" && method === "GET") return await vault.listAssets();
      if (resource === "people") {
        if (method === "GET") return await (id ? vault.people.get(id) : vault.people.list(url.searchParams.get("includeDeleted") === "true"));
        if (method === "POST" && !id) return await vault.people.create(input);
        if (method === "PUT" && id) { const { baseRevision, ...patch } = input; return await vault.people.update(id, patch, baseRevision); }
      }
      if (resource === "external-entities") {
        if (method === "GET") return await vault.externalEntities.list();
        if (method === "PUT" && id === "binding") return await vault.externalEntities.bind(input.key, input.localId, input.baseRevision);
      }
      if (resource === "databases") {
        if (method === "POST" && operation === "undo-wiki") return await vault.databases.undoWiki(id, input);
        if (method === "POST" && operation === "data-sources" && (!child || child === "link")) { const { baseRevision, ...patch } = input; return child === "link" ? await vault.databases.linkSource(id, patch, baseRevision) : await vault.databases.createSource(id, patch, baseRevision); }
        if (method === "GET") return await (id ? vault.databases.get(id) : vault.databases.list());
        if (method === "POST" && !id) return await vault.databases.create(input);
        if (method === "POST" && operation === "views") { const { baseRevision, ...patch } = input; return await vault.databases.createView(id, patch, baseRevision); }
        if (method === "PUT" && id) return await (operation === "icon" ? vault.databases.updateIcon(id, input) : vault.databases.updatePresentation(id, input));
      }
      if (resource === "data-sources") {
        if (method === "GET" && !id) return await vault.databases.listSources();
        if (method === "GET" && id) return await vault.databases.getSource(id);
        if (method === "PUT" && id && !operation) { const { baseRevision, ...patch } = input; return await vault.databases.updateSource(id, patch, baseRevision); }
        if (method === "PUT" && operation === "records" && child) return await vault.databases.updateCell(id, child, input);
        if (method === "POST" && operation === "records" && !child) return await vault.databases.createRecord(id, input, input.baseRevision);
      }
      if (resource === "database-views" && method === "PUT") { const { baseRevision, ...patch } = input; return await vault.databases.updateView(id, patch, baseRevision); }
      throw new ApiError(501, { error: "This feature needs the desktop app. Its source remains preserved on this device." });
    } catch (error) {
      if (error instanceof VaultError) throw new ApiError(error.status, { error: error.message, ...error.details });
      throw error;
    }
  };
}
