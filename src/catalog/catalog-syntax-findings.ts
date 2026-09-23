/** Reproduced against the native codec, 2026-09-22. These are limitations, not fixes. */
export const syntaxFindings: Record<string, string> = {
  tex_math_single_backslash: "目录能力映射缺漏：仅开启本扩展、关闭 tex_math_dollars 时，公式已能解析，但 getContentCapabilities 的行内/块公式仍返回 unavailable。插入命令也只检查美元/display_math 路径。本次补了语法关联，尚未修改这些运行时门控。",
  tex_math_gfm: "目录能力映射缺漏：GFM 仅开启 tex_math_gfm 时，行内及 math 围栏可解析，但内容能力仍返回 unavailable；插入命令未覆盖此独立编码。",
  tex_math_double_backslash: "目录能力映射缺漏：双反斜杠行内公式可解析，但 inline.inline_math 的适配器仅登记 tex_math_dollars；关闭美元语法时能力表错误显示不可用。块公式已登记双反斜杠编码。",
  short_subsuperscripts: "目录能力映射缺漏：单独开启简写规则可产生上下标，但内容对象只登记成对 subscript/superscript 开关，可能错误显示不可用。",
  mark: "目录能力映射缺漏：单独开启 Pandoc mark 能产生 highlight，但能力表只登记产品 highlight/CriticMarkup 路径，可能错误显示不可用。",
  literate_haskell: "已复现不完整实现：Bird-track 能解析，但 \\begin{code}…\\end{code} 被归为 Raw TeX，= 标题仍是普通段落；Pandoc 3.11 分别产生 Haskell CodeBlock 和 Heading。本地还未实现这些规则。",
  raw_html: "与 GFM 输出有差异：本地通用 HTML 清理器会移除部分标签/属性，并保留只读 textarea；不是 GFM tagfilter 的字面转义语义。HTML 自定义锚点的 name/id 被移除。",
};
