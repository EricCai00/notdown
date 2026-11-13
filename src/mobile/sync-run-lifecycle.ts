import { registerPlugin, type PluginListenerHandle } from "@capacitor/core";
import type { SyncRunLifecycle } from "../sync/service";

interface SyncExecution {
  start(): Promise<{ token: string }>;
  update(input: { token: string; completed: number; total: number }): Promise<void>;
  finish(input: { token: string }): Promise<void>;
  addListener(event: "expired", callback: (event: { token: string }) => void): Promise<PluginListenerHandle>;
}
const execution = registerPlugin<SyncExecution>("NotdownSyncExecution");

/** Only an active shared-engine run owns the native service and CPU wake lock. */
export const nativeSyncRunLifecycle: SyncRunLifecycle = {
  async start() {
    let token: string | undefined, stopped = false, lastUpdate = 0;
    const expired = new Set<string>();
    const listener = await execution.addListener("expired", event => { expired.add(event.token); });
    try { token = (await execution.start()).token; }
    catch (error) { await listener.remove(); throw error; }
    return {
      update(progress) {
        if (stopped || expired.has(token!)) throw new Error("Android stopped this sync session. Open Notdown to resume safely.");
        if (Date.now() - lastUpdate < 500 && progress.phase !== "complete") return;
        lastUpdate = Date.now();
        void execution.update({ token: token!, completed: progress.completed ?? 0, total: progress.total ?? 0 })
          .catch(() => { expired.add(token!); });
      },
      async finish() {
        stopped = true;
        try { await execution.finish({ token: token! }); } finally { await listener.remove(); }
      },
    };
  },
};
