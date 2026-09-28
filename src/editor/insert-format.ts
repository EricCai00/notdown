/** Formatting insertion operates on the selection or on the next typed text. */
export const insertFormats: Record<string, { mark: string; attrs?: Record<string, unknown>; before: string; after: string }> = {
  bold: { mark: "strong", before: "**", after: "**" },
  italic: { mark: "em", before: "*", after: "*" },
  inline: { mark: "code", before: "`", after: "`" },
  underline: { mark: "underline", before: '<span underline="true">', after: "</span>" },
  strike: { mark: "strike", before: "~~", after: "~~" },
  color: { mark: "color", attrs: { color: "blue" }, before: '<span color="blue">', after: "</span>" },
  background: { mark: "color", attrs: { color: "yellow_bg" }, before: '<span color="yellow_bg">', after: "</span>" },
  subscript: { mark: "subscript", before: "~", after: "~" },
  superscript: { mark: "superscript", before: "^", after: "^" },
  highlight: { mark: "highlight", before: "==", after: "==" },
  native_span: { mark: "native_span", before: "[", after: "]{}" },
  small_caps: { mark: "small_caps", before: "[", after: "]{.smallcaps}" },
};
