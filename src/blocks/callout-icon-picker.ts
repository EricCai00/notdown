import { emojiStyle, emojiStyleOptions, setEmojiStyle, type EmojiStyle } from "./emoji-style";
import type { EmojiEntry } from "./emoji-catalog";

// Keep the shortcut search terms separate from the official English names
// shown on hover. The complete catalog is loaded only when a picker opens.
const featured: readonly (readonly [icon: string, name: string, searchTerms: string])[] = [
  ["💡", "light bulb", "Light bulb 提示"], ["❗", "red exclamation mark", "Exclamation 重要"], ["❓", "red question mark", "Question 问题"],
  ["⚠️", "warning", "Warning 警告"], ["ℹ️", "information", "Information 信息"], ["✅", "check mark button", "Check 完成"],
  ["❌", "cross mark", "Cross 错误"], ["⭐", "star", "Star 星星"], ["🔥", "fire", "Fire 火"],
  ["📌", "pushpin", "Pin 固定"], ["📎", "paperclip", "Paperclip 附件"], ["📝", "memo", "Note 笔记"],
  ["📖", "open book", "Book 书"], ["📚", "books", "Books 阅读"], ["🔗", "link", "Link 链接"],
  ["🔒", "locked", "Lock 锁"], ["🔑", "key", "Key 钥匙"], ["🚫", "prohibited", "Prohibited 禁止"],
  ["🛠️", "hammer and wrench", "Tools 工具"], ["⚙️", "gear", "Settings 设置"], ["🐛", "bug", "Bug 错误"],
  ["🎯", "bullseye", "Target 目标"], ["🚀", "rocket", "Rocket 火箭"], ["🎉", "party popper", "Celebration 庆祝"],
  ["💬", "speech balloon", "Speech 评论"], ["📢", "loudspeaker", "Announcement 通知"], ["🔔", "bell", "Bell 提醒"],
  ["📅", "calendar", "Calendar 日历"], ["⏰", "alarm clock", "Alarm 时间"], ["⏳", "hourglass not done", "Hourglass 等待"],
  ["➡️", "right arrow", "Arrow 箭头"], ["👉", "backhand index pointing right", "Point 指向"], ["👍", "thumbs up", "Thumbs up 赞"],
  ["👋", "waving hand", "Wave 挥手"], ["😊", "smiling face with smiling eyes", "Smile 微笑"], ["🤔", "thinking face", "Thinking 思考"],
  ["😅", "grinning face with sweat", "Sweat smile 汗"], ["❤️", "red heart", "Heart 爱心"], ["💪", "flexed biceps", "Strength 力量"],
  ["🌱", "seedling", "Seedling 成长"], ["🌍", "globe showing Europe-Africa", "Earth 地球"], ["☀️", "sun", "Sun 太阳"],
  ["🌈", "rainbow", "Rainbow 彩虹"], ["🎵", "musical note", "Music 音乐"], ["🎬", "clapper board", "Movie 电影"],
  ["💻", "laptop", "Computer 电脑"], ["📁", "file folder", "Folder 文件夹"], ["💾", "floppy disk", "Save 保存"],
];
const featuredEntries: EmojiEntry[] = featured.map(([icon, name]) => [icon, name]);
const featuredNames = new Map(featuredEntries);
const recentKey = "notdown-callout-recent-icons";
const pageSize = 160;

/** Text-only icons: neither pasted markup nor URLs are interpreted as HTML. */
export function openCalloutIconPicker(anchor: HTMLElement, choose: (icon: string) => void, label = "Callout icon") {
  const dialog = document.createElement("dialog");
  dialog.className = "pm-callout-icon-picker";
  dialog.setAttribute("aria-label", "Choose " + label.toLowerCase());
  const heading = document.createElement("strong");
  heading.textContent = label;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  const header = document.createElement("header");
  header.append(heading, remove);

  const search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search emoji…";
  search.setAttribute("aria-label", "Search icons");

  const appearance = document.createElement("label");
  appearance.className = "pm-emoji-appearance";
  appearance.textContent = "Emoji style";
  const style = document.createElement("select");
  style.setAttribute("aria-label", "Emoji style");
  for (const { value, label } of emojiStyleOptions) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    style.append(option);
  }
  style.value = emojiStyle();
  style.addEventListener("change", () => setEmojiStyle(style.value as EmojiStyle));
  appearance.append(style);

  const categories = document.createElement("nav");
  categories.className = "pm-emoji-categories";
  categories.setAttribute("aria-label", "Emoji categories");
  const results = document.createElement("div");
  results.className = "pm-callout-icon-results";
  const status = document.createElement("div");
  status.className = "pm-emoji-result-status";
  status.setAttribute("aria-live", "polite");

  const custom = document.createElement("form");
  const input = document.createElement("input");
  input.placeholder = "Paste an emoji or symbol";
  input.setAttribute("aria-label", "Custom icon");
  input.maxLength = 32;
  const apply = document.createElement("button");
  apply.textContent = "Use icon";
  custom.append(input, apply);
  dialog.append(header, search, appearance, categories, results, status, custom);

  let recent: string[] = [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(recentKey) || "[]");
    if (Array.isArray(stored)) recent = stored.filter((s): s is string => typeof s === "string" && s.length > 0 && s.length <= 32).slice(0, 12);
  } catch { /* Storage may be unavailable; choosing an icon still works. */ }

  let catalog: typeof import("./emoji-catalog") | undefined;
  let category = "Popular";
  let visibleCount = pageSize;
  let chosen = false;
  const close = () => { if (dialog.open) dialog.close(); dialog.remove(); };
  const select = (icon: string) => {
    chosen = true;
    if (icon) {
      try { localStorage.setItem(recentKey, JSON.stringify([icon, ...recent.filter(s => s !== icon)].slice(0, 12))); } catch { /* Optional history. */ }
    }
    close();
    choose(icon);
  };
  remove.addEventListener("click", () => select(""));
  custom.addEventListener("submit", event => {
    event.preventDefault();
    const value = input.value.trim();
    if (value) select(value);
  });

  const group = (title: string, entries: readonly EmojiEntry[]) => {
    if (!entries.length) return;
    const heading = document.createElement("p");
    heading.textContent = title;
    const grid = document.createElement("div");
    grid.className = "pm-callout-icon-grid";
    for (const [icon, name] of entries) {
      const button = document.createElement("button");
      const displayName = catalog?.emojiName(icon) ?? name;
      button.type = "button";
      button.textContent = icon;
      button.title = displayName;
      button.setAttribute("aria-label", displayName);
      button.addEventListener("click", () => select(icon));
      grid.append(button);
    }
    results.append(heading, grid);
  };

  const renderCategories = () => {
    categories.replaceChildren();
    for (const name of ["Popular", ...(catalog?.emojiGroups.map(group => group.name) ?? [])]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = name;
      button.setAttribute("aria-pressed", String(category === name));
      button.addEventListener("click", () => {
        category = name;
        visibleCount = pageSize;
        search.value = "";
        renderCategories();
        render();
        results.scrollTop = 0;
      });
      categories.append(button);
    }
  };

  const render = () => {
    results.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    if (!query && category === "Popular") {
      group("Recent", recent.flatMap(icon => {
        const name = catalog?.emojiName(icon) ?? featuredNames.get(icon) ?? (catalog ? `Custom icon: ${icon}` : undefined);
        return name ? [[icon, name] as const] : [];
      }));
      group("Emoji & symbols", featuredEntries);
      status.textContent = catalog ? `${catalog.emojiCount} emoji in ${catalog.emojiGroups.length} categories` : "Loading emoji catalog…";
      return;
    }

    let entries: EmojiEntry[];
    if (query) {
      const matches: EmojiEntry[] = featured
        .filter(([icon, name, searchTerms]) => `${icon} ${name} ${searchTerms}`.toLocaleLowerCase().includes(query))
        .map(([icon, name]) => [icon, name]);
      const seen = new Set(matches.map(([icon]) => icon));
      entries = [...matches, ...(catalog?.findEmoji(query).filter(([icon]) => !seen.has(icon)) ?? [])];
    } else {
      entries = catalog?.emojiGroups.find(group => group.name === category)?.entries ?? [];
    }
    group(query ? "Search results" : category, entries.slice(0, visibleCount));
    if (!entries.length && catalog) {
      const empty = document.createElement("p");
      empty.textContent = "No matching emoji. Paste a custom symbol below.";
      results.append(empty);
    }
    if (entries.length > visibleCount) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "pm-emoji-more";
      more.textContent = `Show more (${entries.length - visibleCount} remaining)`;
      more.addEventListener("click", () => {
        const scrollTop = results.scrollTop;
        visibleCount += pageSize;
        render();
        results.scrollTop = scrollTop;
      });
      results.append(more);
    }
    status.textContent = entries.length
      ? `${Math.min(entries.length, visibleCount)} of ${entries.length} emoji`
      : catalog ? "" : "Loading emoji catalog…";
  };

  search.addEventListener("input", () => { visibleCount = pageSize; render(); results.scrollTop = 0; });
  results.addEventListener("scroll", () => {
    if (results.scrollTop + results.clientHeight < results.scrollHeight - 60) return;
    results.querySelector<HTMLButtonElement>(".pm-emoji-more")?.click();
  });
  dialog.addEventListener("close", () => { dialog.remove(); if (!chosen && anchor.isConnected) anchor.focus(); });
  dialog.addEventListener("click", event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) close();
  });

  document.body.append(dialog);
  renderCategories();
  render();
  dialog.showModal();
  const rect = anchor.getBoundingClientRect(), bounds = dialog.getBoundingClientRect();
  dialog.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - bounds.width - 8))}px`;
  dialog.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - bounds.height - 8))}px`;
  search.focus();
  void import("./emoji-catalog").then(module => {
    if (!dialog.isConnected) return;
    catalog = module;
    renderCategories();
    render();
  }).catch(() => { if (dialog.isConnected) status.textContent = "Emoji catalog could not load. You can still paste a symbol."; });
  return close;
}
