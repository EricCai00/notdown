import data from "./emoji-data.json";

export type EmojiEntry = readonly [icon: string, name: string];
export type EmojiGroup = { name: string; entries: EmojiEntry[] };

// emoji-test.txt contains the fully-qualified RGI emoji and standalone
// components in CLDR keyboard order. Keep sequences as Unicode text in files.
export const emojiGroups: EmojiGroup[] = data.groups.map(group => ({
  name: group.name,
  entries: group.entries.map(([icon, name]) => [icon, name] as const),
}));
export const emojiCount = emojiGroups.reduce((count, group) => count + group.entries.length, 0);

const keywords = data.keywords as Record<string, readonly string[]>;
const skinTones = /[\u{1F3FB}-\u{1F3FF}]/gu;
const searchText = new Map(emojiGroups.flatMap(group => group.entries.map(([icon, name]) => {
  const key = icon.replace(/\uFE0F/g, "").replace(skinTones, "") || icon;
  return [icon, `${icon} ${name} ${(keywords[key] ?? []).join(" ")}`.toLocaleLowerCase()] as const;
})));

export function findEmoji(query: string): EmojiEntry[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return emojiGroups.flatMap(group => group.entries.filter(([icon, name]) => {
    const haystack = searchText.get(icon) ?? `${icon} ${name}`.toLocaleLowerCase();
    return terms.every(term => haystack.includes(term));
  }));
}
