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
  if (zone !== "local" && !/^(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(zone)) {
    // Resolve a wall-clock time against IANA rules for that date. Enumerating
    // nearby offsets rejects spring gaps and chooses the first fall occurrence.
    try {
      const formatter = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
      const wall = (epoch: number) => {
        const parts = formatter.formatToParts(epoch);
        const n = (type: string) => Number(parts.find(part => part.type === type)!.value);
        return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
      };
      const [year, month, date] = day.split("-").map(Number), [hour, minute] = time.split(":").map(Number);
      const target = Date.UTC(year, month - 1, date, hour, minute);
      const offsets = new Set([-86400000, 0, 86400000].map(delta => wall(target + delta) - target - delta));
      const candidates = [...offsets].map(offset => target - offset).filter(epoch => wall(epoch) === target).sort((a, b) => a - b);
      if (!candidates.length) return null;
      const minutes = (target - candidates[0]) / 60000;
      return `${day}T${time}:00${minutes < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
    } catch { return null; }
  }
  return `${day}T${time}:00${zone === "local" ? offsetFor(local) : zone}`;
}

export function dateZone(attrs: DateAttributes): string {
  return attrs.timeZone || attrs["time-zone"] || /([+-]\d\d:\d\d|Z)$/.exec(attrs.start || "")?.[1] || "local";
}
export function dateTimePart(attrs: DateAttributes, field = "start"): string {
  return attrs[field + "Time"] || /T(\d\d:\d\d)/.exec(attrs[field] || "")?.[1] || "";
}
/** Keep the existing official split fields or the legacy ISO carrier. */
export function dateFieldChanges(field: string, day: string, time: string, includeTime: boolean, zone: string, separate: boolean): DateAttributes | null {
  if (!civilDate(day) || includeTime && !dateTime(day, time, zone)) return null;
  return separate ? { [field]: day, [field + "Time"]: includeTime ? time : "", ...(includeTime ? { timeZone: zone === "local" ? Intl.DateTimeFormat().resolvedOptions().timeZone : zone === "Z" ? "UTC" : zone } : {}) }
    : { [field]: includeTime ? dateTime(day, time, zone)! : day, ...(includeTime ? { "time-zone": zone } : {}) };
}
export function relativeDay(day: string, now = new Date()) {
  const date = civilDate(day);
  if (!date) return day;
  const today = civilDate(dateKey(now))!;
  const delta = Math.round((date.getTime() - today.getTime()) / 86400000);
  if (Math.abs(delta) > 1 && Math.abs(delta) < 7)
    return `${delta < 0 ? "Last" : "Next"} ${date.toLocaleDateString("en-US", { weekday: "long" })}`;
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
/** Compare dates in their declared zone without changing the stored civil date/time. */
export function dateToday(attrs: DateAttributes, now = new Date()): string {
  const zone = attrs.timeZone || attrs["time-zone"] || /([+-]\d\d:\d\d|Z)$/.exec(attrs.start || "")?.[1];
  if (!zone || zone === "local") return dateKey(now);
  if (/^(Z|[+-]\d\d:\d\d)$/.test(zone)) {
    const minutes = zone === "Z" ? 0 : (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4))) * (zone[0] === "-" ? -1 : 1);
    return new Date(now.getTime() + minutes * 60000).toISOString().slice(0, 10);
  }
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const part = (type: string) => parts.find(p => p.type === type)!.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch { return dateKey(now); }
}

export function dateReminderState(attrs: DateAttributes, now = new Date()): "none" | "future" | "overdue" {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(attrs.reminder || "")) return "none";
  const at = Date.parse(attrs.reminder);
  if (!Number.isFinite(at)) return "none";
  return at <= now.getTime() || attrs.start?.slice(0, 10) === dateToday(attrs, now) ? "overdue" : "future";
}

export function dateLabel(attrs: DateAttributes, now = new Date()): string {
  const today = civilDate(dateToday(attrs, now)) || now;
  const format = (value: string, separateTime?: string) => {
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
        label = relativeDay(day, today);
    }
    const time = /^(\d\d):(\d\d)$/.exec(separateTime || "") || /T(\d\d):(\d\d)/.exec(value);
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
    ? format(attrs.start, attrs.startTime) + (attrs.end ? " → " + format(attrs.end, attrs.endTime) : "")
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
    const base = dateTime(attrs.start?.slice(0, 10) || "", dateTimePart(attrs) || "09:00", dateZone(attrs));
    const timestamp = base ? Date.parse(base) - offset * 60000 : NaN;
    if (
      Number.isFinite(timestamp) &&
      Number.isFinite(new Date(timestamp).getTime())
    )
      attrs.reminder = new Date(timestamp).toISOString();
  }
  return attrs;
}
