/** Product counterparts, independently of the dialect's documented source syntax.
 * Reviewed 2026-09-22. Former local_* identifiers remain configuration aliases. */
export interface FeatureOrigin {
  label: string;
  url: string;
  note: string;
}
const api = "https://developers.notion.com/reference/block#";
export const notionFeatureOrigins: Record<string, FeatureOrigin> = {
  notion_bookmark: { label: "Notion Bookmark block", url: api + "bookmark", note: "Notdown stores <bookmark> with cached preview fields." },
  notion_link_preview: { label: "Notion Link Preview", url: api + "link-preview", note: "Includes inline link mentions. Notdown uses <link-preview>/<link-mention>; Notion's general block API returns previews but cannot append them." },
  notion_breadcrumb: { label: "Notion Breadcrumb block", url: api + "breadcrumb", note: "Notdown's <breadcrumb> navigates the local page hierarchy." },
  notion_button: { label: "Notion Buttons", url: "https://www.notion.com/help/buttons", note: "Notdown's <button> runs local actions; Notion database and cloud automation actions are not implemented." },
  notion_ai_block: { label: "Notion Custom AI blocks", url: "https://www.notion.com/help/guides/organize-your-everyday-life-with-notion-ai", note: "Notdown's <ai-block> uses the configured provider, without Notion workspace context or service integration." },
  notion_web_embed: { label: "Notion Embed block", url: api + "embed", note: "Notdown's <web-embed> references a remote URL or an uploaded HTML asset. Local HTML scripts are disabled; remote destinations may refuse embedding." },
};
export const localEncodingNote = "Supplemental Notion capability · Notdown variant only. Official enhanced Markdown does not define these local fields or structures; Meeting notes has a documented tag but its local properties remain supplemental. This category does not imply API interoperability.";
export const notionMcpSyntax = {
  notion_tabs: "Title-first <tabs>/<tab> containers; legacy title/active attributes remain Notdown-only.",
  notion_meeting_notes: "Title-first <meeting-notes> with summary, notes and transcript sections; local transcription properties remain Notdown-only.",
} as Record<string, string>;
export const notionMcpSpecUrl = "notion://docs/enhanced-markdown-spec";
