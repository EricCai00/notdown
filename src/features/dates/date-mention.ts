/** Calendar values are civil dates; never parse a date-only value as UTC. */
export type DateAttributes = Record<string, string>;
export const pad = (n: number) => String(n).padStart(2, "0");
export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function civilDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  return dateKey(date) === value ? date : null;
}
export function offsetFor(date: Date) {
  const n = -date.getTimezoneOffset();
  return `${n < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(n) / 60))}:${pad(Math.abs(n) % 60)}`;
}
export function dateTime(
  day: string,
  time: string,
  zone = "local",
): string | null {
  if (!civilDate(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const local = new Date(`${day}T${time}:00`);
  // A missing local hour during the spring DST transition must not silently move.
  if (
    zone === "local" &&
    (dateKey(local) !== day ||
      `${pad(local.getHours())}:${pad(local.getMinutes())}` !== time)
  )
    return null;
  if (zone !== "local" && !/^(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(zone))
    return null;
  return `${day}T${time}:00${zone === "local" ? offsetFor(local) : zone}`;
}
export function relativeDay(day: string, now = new Date()) {
  const date = civilDate(day);
  if (!date) return day;
  const today = civilDate(dateKey(now))!;
  const delta = Math.round((date.getTime() - today.getTime()) / 86400000);
  return (
    (
      { [-1]: "Yesterday", 0: "Today", 1: "Tomorrow" } as Record<number, string>
    )[delta] ||
    date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    })
  );
}
export function dateLabel(attrs: DateAttributes, now = new Date()): string {
  const format = (value: string) => {
    const day = value.slice(0, 10),
      date = civilDate(day);
    if (!date) return value;
    let label: string;
    switch (attrs["date-format"]) {
      case "iso":
        label = day;
        break;
      case "us":
        label = `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()}`;
        break;
      case "eu":
        label = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
        break;
      case "full":
        label = date.toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
        });
        break;
      default:
        label = relativeDay(day, now);
    }
    const time = /T(\d\d):(\d\d)/.exec(value);
    if (time) {
      const hour = Number(time[1]);
      label +=
        attrs["time-format"] === "24"
          ? ` ${time[1]}:${time[2]}`
          : ` ${hour % 12 || 12}:${time[2]} ${hour < 12 ? "AM" : "PM"}`;
    }
    return label;
  };
  return attrs.start
    ? format(attrs.start) + (attrs.end ? " → " + format(attrs.end) : "")
    : "Mention a date…";
}
export type DateSuggestion = {
  label: string;
  detail?: string;
  attrs: DateAttributes;
  reminder: boolean;
};
export function dateSuggestions(
  query: string,
  now = new Date(),
): DateSuggestion[] {
  let text = query.trim().toLowerCase();
  const remind = /^(remind(?:\s+me)?|提醒)(?:\s|$)/.test(text);
  text = text.replace(/^(remind(?:\s+me)?|提醒)\s*/, "");
  const day = new Date(now);
  day.setHours(12, 0, 0, 0);
  let time = "";
  const match = /(?:\s+(?:at\s+)?)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(
    text,
  );
  if (match && (match[3] || match[2]) && !/^\d{4}-/.test(match[0])) {
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    if (minute > 59 || hour > (match[3] ? 12 : 23) || (match[3] && hour < 1))
      return [];
    if (match[3]) hour = (hour % 12) + (match[3] === "pm" ? 12 : 0);
    time = `${pad(hour)}:${pad(minute)}`;
    text = text.slice(0, match.index).trim();
  }
  if (!text || text === "today" || text === "今天") {
    /* today */
  } else if (text === "tomorrow" || text === "明天")
    day.setDate(day.getDate() + 1);
  else if (text === "yesterday" || text === "昨天")
    day.setDate(day.getDate() - 1);
  else if (civilDate(text)) day.setTime(civilDate(text)!.getTime());
  else {
    const weekdays = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const weekday = weekdays.indexOf(text.replace(/^next\s+/, ""));
    if (weekday < 0) return [];
    day.setDate(day.getDate() + ((weekday - day.getDay() + 7) % 7 || 7));
  }
  const key = dateKey(day),
    start = time ? dateTime(key, time) : key;
  if (!start) return [];
  const normal: DateAttributes = {
    start,
    ...(time ? { "time-zone": "local" } : {}),
  };
  const reminderDay = new Date(day);
  if (!text && !time) reminderDay.setDate(reminderDay.getDate() + 1);
  const reminderStart = dateTime(dateKey(reminderDay), time || "09:00");
  if (!reminderStart) return [];
  const reminderAttrs = {
    start: reminderStart,
    reminder: reminderStart,
    "reminder-offset": "0",
    "time-zone": "local",
  };
  return [
    ...(!remind
      ? [{ label: dateLabel(normal, now), attrs: normal, reminder: false }]
      : []),
    {
      label: "Remind me",
      detail: dateLabel(reminderAttrs, now),
      attrs: reminderAttrs,
      reminder: true,
    },
  ];
}

/** Apply controlled fields while retaining every unrelated imported attribute. */
export function updateDateAttributes(
  original: DateAttributes,
  changes: DateAttributes,
): DateAttributes {
  const attrs = { ...original, ...changes };
  for (const [key, value] of Object.entries(attrs))
    if (value === "" && key in changes) delete attrs[key];
  if (
    attrs["reminder-offset"] !== undefined &&
    attrs["reminder-offset"] !== "custom"
  ) {
    const offset = Number(attrs["reminder-offset"]);
    const base = attrs.start?.includes("T")
      ? attrs.start
      : dateTime(attrs.start || "", "09:00", attrs["time-zone"] || "local");
    const timestamp = base ? Date.parse(base) - offset * 60000 : NaN;
    if (
      Number.isFinite(timestamp) &&
      Number.isFinite(new Date(timestamp).getTime())
    )
      attrs.reminder = new Date(timestamp).toISOString();
  }
  return attrs;
}
