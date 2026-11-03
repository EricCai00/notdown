import { setUIText, setUIAttribute } from "../../shared/i18n";
import { DOMSerializer, type Node as PMNode } from "prosemirror-model";
import { hasOfficialDateTime } from "../../document/notdown-boundary";
import { dateMentionDOM } from "./date-presentation";
import { TextSelection } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import { closeHistory } from "prosemirror-history";
import {
  createElement,
  Clock3,
  AlarmClock,
  ChevronLeft,
  ChevronRight,
} from "lucide";
import {
  civilDate,
  dateKey,
  dateLabel,
  dateSuggestions,
  dateTime,
  dateZone,
  dateTimePart,
  dateFieldChanges,
  dateToday,
  updateDateAttributes,
  type DateAttributes,
  type DateSuggestion,
} from "./date-mention";

export function placeDatePanel(
  panel: HTMLElement,
  rect: { left: number; top: number; bottom: number },
) {
  const below = Math.max(0, innerHeight - rect.bottom - 14);
  const above = Math.max(0, rect.top - 14);
  const useBelow = panel.scrollHeight + 2 <= below || below >= above;
  // Keep the trigger visible when expanding settings; scroll the panel instead
  // of clamping a too-tall popup across the date it belongs to.
  panel.style.maxHeight = `${Math.max(80, Math.min(innerHeight - 16, useBelow ? below : above))}px`;
  panel.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - panel.offsetWidth - 8))}px`;
  panel.style.top = `${Math.max(8, Math.min(useBelow ? rect.bottom + 6 : rect.top - panel.offsetHeight - 6, innerHeight - panel.offsetHeight - 8))}px`;
}
export function renderDateSuggestions(
  panel: HTMLElement,
  query: string,
  active: number,
  choose: (choice: DateSuggestion) => void,
  supplemental = true,
) {
  panel.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "pm-date-heading";
  setUIText(heading, "Date");
  panel.append(heading);
  const choices = dateSuggestions(query).filter(choice => supplemental || !choice.reminder);
  choices.forEach((choice, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "pm-date-choice";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(index === active));
    button.append(
      createElement(choice.reminder ? AlarmClock : Clock3, {
        width: 18,
        height: 18,
        "stroke-width": 1.5,
      }),
      document.createTextNode(choice.label),
    );
    if (choice.detail) {
      const detail = document.createElement("small");
      detail.textContent = "— " + choice.detail;
      button.append(detail);
    }
    button.onpointerdown = (event) => event.preventDefault();
    button.onclick = () => choose(choice);
    panel.append(button);
  });
  if (!choices.length) {
    const hint = document.createElement("div");
    hint.className = "pm-date-hint";
    setUIText(hint, "Try tomorrow, 明天, or YYYY-MM-DD");
    panel.append(hint);
  }
  return choices;
}

/** Bind the same mention UI to a date stored in a container title. */
export interface DateMentionBinding {
  supplemental: () => boolean;
  write: (original: PMNode, attrs: DateAttributes, firstWrite: boolean) => boolean;
  clear: (original: PMNode) => void;
  finish: () => void;
}

export class DateMentionView implements NodeView {
  dom = document.createElement("span");
  private panel?: HTMLDivElement;
  private events?: AbortController;
  private observer?: ResizeObserver;
  private writing = false;
  private firstWrite = true;
  private month = new Date();
  private target: "start" | "end" = "start";
  private displayFormats: DateAttributes = {};
  private timer: ReturnType<typeof setInterval>;

  constructor(
    private node: PMNode,
    private view: EditorView,
    private getPos: () => number | undefined,
    private binding?: DateMentionBinding,
    private allowSupplemental: () => boolean = () => true,
  ) {
    this.dom.contentEditable = "false";
    this.dom.tabIndex = 0;
    this.dom.setAttribute("role", "button");
    this.dom.setAttribute("aria-haspopup", "dialog");
    this.dom.addEventListener("click", () => {
      if (!this.panel) this.open();
    });
    this.dom.addEventListener("notdown-edit-date", () => this.open());
    this.dom.addEventListener("keydown", (event) => {
      if (event.target !== this.dom) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.open();
      }
    });
    this.render();
    this.timer = setInterval(() => {
      if (!this.panel) this.render();
    }, 60000);
  }
  private supplemental() {
    return this.binding?.supplemental() ?? this.allowSupplemental();
  }
  private render() {
    const stored = this.supplemental() ? this.node.attrs.nfmAttrs : Object.fromEntries(Object.entries(this.node.attrs.nfmAttrs).filter(([key]) => !["reminder", "reminder-offset", "date-format", "time-format", "time-zone"].includes(key)));
    const attrs = { ...stored, ...this.displayFormats } as DateAttributes;
    const rendered = DOMSerializer.renderSpec(document, dateMentionDOM(attrs, true, this.node.attrs.label)).dom as HTMLElement;
    this.dom.className = rendered.className;
    this.dom.dataset.mentionKind = "date";
    this.dom.title = rendered.title;
    this.dom.replaceChildren(...rendered.childNodes);
    this.dom.setAttribute(
      "aria-label",
      attrs.start ? "Edit date: " + dateLabel(attrs) : "Mention a date",
    );
    this.dom.setAttribute("aria-expanded", String(!!this.panel));
    this.position();
  }
  private position = () => {
    if (this.panel)
      placeDatePanel(this.panel, this.dom.getBoundingClientRect());
  };
  private mount(quick: boolean) {
    const panel = (this.panel = document.createElement("div"));
    panel.className = "pm-date-panel" + (quick ? " pm-date-quick" : "");
    panel.setAttribute("role", quick ? "listbox" : "dialog");
    panel.setAttribute("aria-label", quick ? "Date suggestions" : "Edit date");
    document.body.append(panel);
    this.dom.setAttribute("aria-expanded", "true");
    this.events = new AbortController();
    const signal = this.events.signal;
    const outside = (event: Event) => {
      if (
        !panel.contains(event.target as Node) &&
        !this.dom.contains(event.target as Node)
      )
        this.close();
    };
    document.addEventListener("pointerdown", outside, {
      signal,
      capture: true,
    });
    document.addEventListener("focusin", outside, { signal });
    document.addEventListener("scroll", this.position, {
      signal,
      capture: true,
    });
    window.addEventListener("resize", this.position, { signal });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.finish();
      }
    });
    this.observer = new ResizeObserver(this.position);
    this.observer.observe(panel);
    this.observer.observe(this.dom);
    this.firstWrite = true;
    return panel;
  }
  private open() {
    if (!this.view.editable || this.panel) return;
    if (!this.node.attrs.nfmAttrs.start) {
      this.openQuick();
      return;
    }
    this.month =
      civilDate(this.node.attrs.nfmAttrs.start.slice(0, 10)) || new Date();
    this.month.setDate(1);
    this.target = "start";
    const panel = this.mount(false);
    this.buildCalendar();
    panel.querySelector<HTMLInputElement>("input")?.focus();
  }
  private openQuick() {
    const panel = this.mount(true),
      input = document.createElement("input");
    input.className = "pm-date-query";
    input.placeholder = "Mention a date…";
    setUIAttribute(input, "aria-label", "Mention a date");
    this.dom.replaceChildren(document.createTextNode("@"), input);
    let active = -1,
      choices: DateSuggestion[] = [];
    const choose = (choice: DateSuggestion) => {
      this.set(choice.attrs);
      this.finish();
    };
    const paint = () => {
      choices = renderDateSuggestions(panel, input.value, active, choose, this.supplemental());
      this.position();
    };
    input.oninput = () => {
      active = -1;
      paint();
    };
    input.onkeydown = (event) => {
      if (event.isComposing) return;
      if (
        (event.key === "ArrowDown" || event.key === "ArrowUp") &&
        choices.length
      ) {
        event.preventDefault();
        active =
          active < 0
            ? event.key === "ArrowDown"
              ? 0
              : choices.length - 1
            : (active + (event.key === "ArrowDown" ? 1 : choices.length - 1)) %
              choices.length;
        paint();
      }
      if (event.key === "Enter" && choices.length) {
        event.preventDefault();
        choose(choices[Math.max(active, 0)]);
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this.finish();
      }
    };
    paint();
    input.focus();
  }
  private set(changes: DateAttributes) {
    if (this.binding) {
      if (!this.view.editable) { this.close(); return; }
      this.writing = true;
      try {
        const attrs = updateDateAttributes(this.node.attrs.nfmAttrs, changes);
        if (!this.binding.write(this.node, attrs, this.firstWrite)) this.close();
        else this.firstWrite = false;
      } finally { this.writing = false; }
      return;
    }
    const pos = this.getPos();
    if (
      pos === undefined ||
      !this.view.editable ||
      this.view.state.doc.nodeAt(pos) !== this.node
    ) {
      this.close();
      return;
    }
    const nfmAttrs = updateDateAttributes(this.node.attrs.nfmAttrs, changes);
    if (JSON.stringify(nfmAttrs) === JSON.stringify(this.node.attrs.nfmAttrs))
      return;
    let tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
      ...this.node.attrs,
      nfmAttrs,
    });
    if (this.firstWrite) tr = closeHistory(tr);
    this.firstWrite = false;
    this.writing = true;
    try {
      this.view.dispatch(tr);
    } finally {
      this.writing = false;
    }
  }
  private buildCalendar() {
    const panel = this.panel;
    if (!panel) return;
    const focused = panel.contains(document.activeElement)
      ? document.activeElement?.getAttribute("aria-label")
      : null;
    panel.replaceChildren();
    const attrs = { ...this.node.attrs.nfmAttrs, ...this.displayFormats } as DateAttributes;
    const includeTime = !!dateTimePart(attrs);
    const separateTime = hasOfficialDateTime(this.node) || !this.supplemental();
    const zone = dateZone(attrs);
    const endpoint = (values: DateAttributes, field: string) => (values[field] || "").slice(0, 10) + "T" + (dateTimePart(values, field) || "00:00");
    const formatChange = (key: string, value: string) => {
      if (this.supplemental()) this.set({ [key]: value });
      else { this.displayFormats[key] = value; this.render(); }
    };
    const error = document.createElement("output");
    error.className = "pm-date-error";
    error.setAttribute("aria-live", "polite");
    const inputs = document.createElement("div");
    inputs.className = "pm-date-inputs";
    for (const field of ["start", ...(attrs.end ? ["end"] : [])] as (
      "start" | "end"
    )[]) {
      const row = document.createElement("div");
      row.className = "pm-date-input-row";
      const input = document.createElement("input");
      input.type = "text";
      input.value = attrs[field].slice(0, 10);
      input.placeholder = "YYYY-MM-DD";
      input.setAttribute(
        "aria-label",
        field === "start" ? "Start date" : "End date",
      );
      input.onfocus = () => {
        this.target = field;
      };
      const time = document.createElement("input");
      time.type = "time";
      time.value = dateTimePart(attrs, field) || "09:00";
      time.setAttribute(
        "aria-label",
        field === "start" ? "Start time" : "End time",
      );
      const change = () => {
        const changes = dateFieldChanges(field, input.value, time.value, includeTime, zone, separateTime);
        const current = this.node.attrs.nfmAttrs;
        if (!changes) {
          setUIText(error, "Enter a valid date and time.");
          return;
        }
        if (
          current.end &&
          (field === "start" ? endpoint({ ...current, ...changes }, "start") > endpoint(current, "end") : endpoint({ ...current, ...changes }, "end") < endpoint(current, "start"))
        ) {
          setUIText(error, "End date must be on or after start date.");
          return;
        }
        error.textContent = "";
        this.set(changes);
        this.month = civilDate(input.value)!;
        this.month.setDate(1);
        drawDays();
      };
      input.oninput = change;
      time.oninput = change;
      row.append(input);
      if (includeTime) row.append(time);
      inputs.append(row);
    }
    panel.append(inputs);
    const nav = document.createElement("div");
    nav.className = "pm-date-nav";
    const monthLabel = document.createElement("span");
    const previous = this.button("Previous month", () => {
      this.month.setMonth(this.month.getMonth() - 1);
      drawDays();
    });
    const next = this.button("Next month", () => {
      this.month.setMonth(this.month.getMonth() + 1);
      drawDays();
    });
    previous.replaceChildren(
      createElement(ChevronLeft, { width: 16, height: 16 }),
    );
    next.replaceChildren(
      createElement(ChevronRight, { width: 16, height: 16 }),
    );
    nav.append(monthLabel, previous, next);
    panel.append(nav);
    const weekdays = document.createElement("div");
    weekdays.className = "pm-date-weekdays";
    for (const day of ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]) {
      const label = document.createElement("span");
      label.textContent = day;
      weekdays.append(label);
    }
    panel.append(weekdays);
    const grid = document.createElement("div");
    grid.className = "pm-date-grid";
    grid.setAttribute("role", "group");
    setUIAttribute(grid, "aria-label", "Calendar");
    panel.append(grid);
    const drawDays = () => {
      monthLabel.textContent = this.month.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      grid.replaceChildren();
      const first = new Date(this.month);
      first.setDate(1 - first.getDay());
      const current = this.node.attrs.nfmAttrs;
      for (let i = 0; i < 42; i++) {
        const day = new Date(first);
        day.setDate(first.getDate() + i);
        const key = dateKey(day);
        const button = this.button(key, () => {
          const old = this.node.attrs.nfmAttrs,
            field = this.target;
          const changes = dateFieldChanges(field, key, dateTimePart(old, field) || dateTimePart(old) || "09:00", includeTime, zone, separateTime);
          if (!changes) {
            setUIText(error, "This local time does not exist. Choose another time.");
            return;
          }
          if (field === "end" && endpoint({ ...old, ...changes }, "end") < endpoint(old, "start")) {
            this.set({ ...dateFieldChanges("start", key, dateTimePart(old, "end") || dateTimePart(old) || "09:00", includeTime, zone, separateTime)!, ...dateFieldChanges("end", old.start.slice(0, 10), dateTimePart(old) || "09:00", includeTime, zone, separateTime)! });
          } else this.set({ ...changes, ...(field === "start" && old.end && endpoint({ ...old, ...changes }, "start") > endpoint(old, "end") ? dateFieldChanges("end", key, dateTimePart({ ...old, ...changes }) || "09:00", includeTime, zone, separateTime)! : {}) });
          this.month = new Date(day);
          this.month.setDate(1);
          if (old.end && field === "start") this.target = "end";
          this.buildCalendar();
          this.panel
            ?.querySelector<HTMLButtonElement>(`[aria-label="${key}"]`)
            ?.focus();
        });
        button.textContent = String(day.getDate());
        button.className = "pm-date-day";
        button.tabIndex = key === current.start.slice(0, 10) ? 0 : -1;
        button.classList.toggle(
          "outside",
          day.getMonth() !== this.month.getMonth(),
        );
        button.classList.toggle("today", key === dateToday(current));
        const selected =
          key === current.start.slice(0, 10) ||
          key === current.end?.slice(0, 10);
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
        button.classList.toggle(
          "in-range",
          !!current.end &&
            key > current.start.slice(0, 10) &&
            key < current.end.slice(0, 10),
        );
        if (key === dateToday(current))
          button.setAttribute("aria-current", "date");
        grid.append(button);
      }
      if (!grid.querySelector('[tabindex="0"]'))
        grid.querySelector<HTMLButtonElement>(
          ".pm-date-day:not(.outside)",
        )!.tabIndex = 0;
    };
    grid.addEventListener("keydown", (event) => {
      const target = event.target as HTMLElement,
        value = target.getAttribute("aria-label"),
        day = value && civilDate(value);
      if (
        !day ||
        ![
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "Home",
          "End",
          "PageUp",
          "PageDown",
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      if (event.key === "PageUp" || event.key === "PageDown") {
        const oldDay = day.getDate();
        day.setDate(1);
        day.setMonth(day.getMonth() + (event.key === "PageUp" ? -1 : 1));
        day.setDate(
          Math.min(
            oldDay,
            new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate(),
          ),
        );
      } else
        day.setDate(
          day.getDate() +
            (
              {
                ArrowLeft: -1,
                ArrowRight: 1,
                ArrowUp: -7,
                ArrowDown: 7,
                Home: -day.getDay(),
                End: 6 - day.getDay(),
              } as Record<string, number>
            )[event.key],
        );
      this.month = new Date(day);
      this.month.setDate(1);
      drawDays();
      const nextDay = grid.querySelector<HTMLButtonElement>(
        `[aria-label="${dateKey(day)}"]`,
      );
      grid.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        button.tabIndex = button === nextDay ? 0 : -1;
      });
      nextDay?.focus();
    });
    drawDays();
    panel.append(error);
    if (this.supplemental()) this.selectRow(
      "Remind",
      attrs["reminder-offset"] || (attrs.reminder ? "custom" : "none"),
      [
        ["none", "None"],
        ["0", includeTime ? "At time of event" : "On the day (9:00 AM)"],
        ...(includeTime
          ? [
              ["5", "5 minutes before"],
              ["10", "10 minutes before"],
              ["15", "15 minutes before"],
              ["30", "30 minutes before"],
              ["60", "1 hour before"],
              ["120", "2 hours before"],
            ]
          : []),
        ["1440", "1 day before"],
        ["2880", "2 days before"],
        ["10080", "1 week before"],
        ...(attrs.reminder && !attrs["reminder-offset"]
          ? [["custom", "Custom reminder (saved)"]]
          : []),
      ],
      (value) => {
        this.set(
          value === "none"
            ? { reminder: "", "reminder-offset": "" }
            : { "reminder-offset": value },
        );
        this.buildCalendar();
      },
    );
    this.toggle("End date", !!attrs.end, (checked) => {
      const current = this.node.attrs.nfmAttrs;
      const next = checked ? dateFieldChanges("end", current.start.slice(0, 10), dateTimePart(current) || "09:00", includeTime, zone, separateTime) : { end: "", endTime: "" };
      if (!next) { setUIText(error, "Enter a valid date and time."); return; }
      this.set(next);
      this.target = checked ? "end" : "start";
      this.buildCalendar();
    });
    this.toggle("Include time", includeTime, (checked) => {
      const current = this.node.attrs.nfmAttrs,
        changes: DateAttributes = {};
      for (const field of ["start", "end"])
        if (current[field])
          {
            const next = dateFieldChanges(field, current[field].slice(0, 10), dateTimePart(current, field) || "09:00", checked, zone, separateTime);
            if (!next) { setUIText(error, "Correct the date before including time."); return; }
            Object.assign(changes, next);
          }
      if (!checked && Number(current["reminder-offset"]) < 1440)
        changes["reminder-offset"] = "0";
      this.set(changes);
      this.buildCalendar();
    });
    this.selectRow(
      "Date format",
      attrs["date-format"] || "relative",
      [
        ["relative", "Relative"],
        ["full", "Full date"],
        ["iso", "YYYY-MM-DD"],
        ["us", "MM/DD/YYYY"],
        ["eu", "DD/MM/YYYY"],
      ],
      (value) => formatChange("date-format", value),
    );
    if (includeTime) {
      this.selectRow(
        "Time format",
        attrs["time-format"] || "12",
        [
          ["12", "12 hour"],
          ["24", "24 hour"],
        ],
        (value) => formatChange("time-format", value),
      );
      const zones = [
        ["local", "Local time"],
        ["Z", "UTC"],
        ...Intl.supportedValuesOf("timeZone").map(value => [value, value]),
        ...(!separateTime ? Array.from({ length: 105 }, (_, i) => {
          const minutes = (i - 48) * 15,
            sign = minutes < 0 ? "-" : "+";
          const offset = `${sign}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, "0")}:${String(Math.abs(minutes) % 60).padStart(2, "0")}`;
          return [offset, "UTC" + offset];
        }) : []),
      ];
      this.selectRow(
        "Timezone",
        zone,
        zones,
        (value) => {
          const current = this.node.attrs.nfmAttrs,
            changes: DateAttributes = {};
          for (const field of ["start", "end"])
            if (current[field]) {
              const next = dateFieldChanges(field, current[field].slice(0, 10), dateTimePart(current, field) || "09:00", true, value, separateTime);
              if (!next) {
                setUIText(error, "This local time does not exist. Choose another time.");
                return;
              }
              Object.assign(changes, next);
            }
          this.set(changes);
          this.buildCalendar();
        },
      );
    }
    const footer = document.createElement("div");
    footer.className = "pm-date-footer";
    footer.append(
      this.button("Clear date", () => {
        if (this.binding) {
          this.close();
          if (this.view.editable) this.binding.clear(this.node);
          return;
        }
        const pos = this.getPos();
        if (pos === undefined || this.view.state.doc.nodeAt(pos) !== this.node)
          return;
        this.close();
        this.view.dispatch(
          closeHistory(
            this.view.state.tr.delete(pos, pos + this.node.nodeSize),
          ),
        );
        this.view.focus();
      }),
      this.button("Done", () => this.finish()),
    );
    panel.append(footer);
    this.position();
    if (focused)
      [...panel.querySelectorAll<HTMLElement>("[aria-label]")]
        .find((element) => element.getAttribute("aria-label") === focused)
        ?.focus();
  }
  private button(label: string, click: () => void) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.setAttribute("aria-label", label);
    button.onclick = click;
    return button;
  }
  private toggle(
    label: string,
    value: boolean,
    change: (value: boolean) => void,
  ) {
    const row = document.createElement("label");
    row.className = "pm-date-setting";
    row.append(document.createTextNode(label));
    const control = document.createElement("input");
    control.type = "checkbox";
    control.checked = value;
    control.setAttribute("role", "switch");
    control.setAttribute("aria-label", label);
    control.onchange = () => change(control.checked);
    row.append(control);
    this.panel!.append(row);
  }
  private selectRow(
    label: string,
    value: string,
    options: string[][],
    change: (value: string) => void,
    parent: HTMLElement = this.panel!,
  ) {
    const row = document.createElement("label");
    row.className = "pm-date-setting";
    row.append(document.createTextNode(label));
    const select = document.createElement("select");
    select.setAttribute("aria-label", label);
    if (!options.some(([key]) => key === value))
      options = [...options, [value, value]];
    for (const [key, text] of options) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = text;
      select.append(option);
    }
    select.value = value;
    select.onchange = () => change(select.value);
    row.append(select);
    parent.append(row);
  }
  private finish() {
    this.close();
    if (this.binding) { this.binding.finish(); return; }
    const pos = this.getPos();
    if (pos !== undefined && this.view.state.doc.nodeAt(pos) === this.node)
      this.view.dispatch(
        closeHistory(this.view.state.tr).setSelection(
          TextSelection.create(this.view.state.doc, pos + this.node.nodeSize),
        ),
      );
    this.view.focus();
  }
  private close() {
    this.events?.abort();
    this.observer?.disconnect();
    this.panel?.remove();
    this.panel = undefined;
    this.render();
  }
  update(node: PMNode) {
    if (node.type !== this.node.type || node.attrs.kind !== "date")
      return false;
    if (!this.writing && !node.eq(this.node)) this.close();
    this.node = node;
    this.render();
    return true;
  }
  stopEvent() {
    return true;
  }
  ignoreMutation() {
    return true;
  }
  destroy() {
    clearInterval(this.timer);
    this.events?.abort();
    this.observer?.disconnect();
    this.panel?.remove();
  }
}
