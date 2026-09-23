import type { Page } from "../../shared/types";
import { parseNative } from "../../markdown-engine/codec";
import { defaultSyntax } from "../../markdown-engine/config";

export type Reminder = { key: string; pageId: string; title: string; text: string; at: number };
export function pageReminders(page: Page): Reminder[] {
  const result: Reminder[] = [];
  if (page.syntax?.variant !== "notdown") return result;
  parseNative(page.body, page.syntax || defaultSyntax(page.bodyFormat)).descendants((node, pos) => {
    if (node.type.name !== "mention" || node.attrs.kind !== "date") return;
    const value = node.attrs.nfmAttrs.reminder;
    if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(value)) return;
    const at = Date.parse(value); if (!Number.isFinite(at)) return;
    result.push({ key: `${page.id}:${pos}:${value}`, pageId: page.id, title: page.title, text: node.attrs.label || node.attrs.nfmAttrs.start || value, at });
  });
  return result;
}
/** Local reminders run while this app is open, with missed reminders on reopening. */
export function startReminders(pages: () => Page[], vault: string, notify: (text: string) => void) {
  const cache = new Map<string, { revision: string; reminders: Reminder[] }>();
  const key = "notdown-reminders:" + vault;
  const tick = () => {
    let delivered: Record<string, number> = {};
    try { const saved = JSON.parse(localStorage.getItem(key) || "{}"); if (saved && typeof saved === "object" && !Array.isArray(saved)) delivered = saved; } catch { /* Recover damaged local acknowledgement state. */ }
    const pending: Reminder[] = [];
    for (const page of pages()) {
      let entry = cache.get(page.id);
      if (!entry || entry.revision !== page.revision) { entry = { revision: page.revision, reminders: pageReminders(page) }; cache.set(page.id, entry); }
      for (const reminder of entry.reminders) if (reminder.at <= Date.now() && !delivered[reminder.key]) pending.push(reminder);
    }
    for (const reminder of pending) {
      delivered[reminder.key] = Date.now();
      const text = `${reminder.title}: ${reminder.text}`; notify("Reminder — " + text);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const notification = new Notification(reminder.title, { body: reminder.text, tag: reminder.key });
        notification.onclick = () => { window.focus(); location.hash = "#page/" + encodeURIComponent(reminder.pageId); notification.close(); };
      }
    }
    if (pending.length) localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(delivered).sort((a,b) => b[1]-a[1]).slice(0, 2000))));
  };
  tick(); const timer = setInterval(tick, 15000); return () => clearInterval(timer);
}
