import type { DOMOutputSpec } from "prosemirror-model";
import { dateLabel, dateReminderState, type DateAttributes } from "./date-mention";

/** Editor and serialized HTML share the same date text, colors and reminder icon. */
export function dateMentionDOM(attrs: DateAttributes, supplemental = true, originalLabel = "", now = new Date()): DOMOutputSpec {
  const visible = supplemental ? attrs : Object.fromEntries(Object.entries(attrs).filter(([key]) => !["reminder", "reminder-offset", "date-format", "time-format", "time-zone"].includes(key)));
  const state = dateReminderState(visible, now);
  return ["span", {
    class: ["pm-mention", "pm-date-mention", !attrs.start && "pm-date-empty", state !== "none" && "pm-date-reminder", state === "overdue" && "pm-date-overdue"].filter(Boolean).join(" "),
    contenteditable: "false",
    "data-mention-kind": "date",
    title: [originalLabel, attrs.start, attrs.startTime, attrs.end, attrs.endTime, attrs.timeZone || attrs["time-zone"], state !== "none" && "Reminder: " + attrs.reminder].filter(Boolean).join("\n"),
  }, "@" + dateLabel(visible, now), ...(state === "none" ? [] : [
    ["http://www.w3.org/2000/svg svg", { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.5, "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
      ["circle", { cx: 12, cy: 13, r: 8 }], ["path", { d: "M12 9v4l2 2M5 3 2 6m20 0-3-3M6.38 18.7 4 21m13.64-2.33L20 21" }],
    ] as DOMOutputSpec,
  ])];
}
