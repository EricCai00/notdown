import "./emoji-style.css";

export type EmojiStyle = "system" | "noto" | "openmoji";

export const emojiStyleOptions: readonly { value: EmojiStyle; label: string }[] = [
  { value: "system", label: "System" },
  { value: "noto", label: "Google Noto" },
  { value: "openmoji", label: "OpenMoji" },
];

const storageKey = "notdown-emoji-style";

export function emojiStyle(): EmojiStyle {
  const active = document.documentElement.dataset.emojiStyle;
  if (active === "system" || active === "noto" || active === "openmoji") return active;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "noto" || stored === "openmoji") return stored;
  } catch { /* A blocked storage API should not block emoji rendering. */ }
  return "system";
}

export function setEmojiStyle(style: EmojiStyle): void {
  document.documentElement.dataset.emojiStyle = style;
  try { localStorage.setItem(storageKey, style); } catch { /* Keep the live choice. */ }
}

export function initializeEmojiStyle(): void {
  document.documentElement.dataset.emojiStyle = emojiStyle();
}
