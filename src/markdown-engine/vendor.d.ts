declare module "markdown-it-deflist" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}
declare module "markdown-it-sub" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}
declare module "markdown-it-sup" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}
declare module "markdown-it-abbr" {
  import type { PluginSimple } from "markdown-it";
  const plugin: PluginSimple;
  export default plugin;
}
declare module "markdown-it-emoji" {
  import type { PluginWithOptions } from "markdown-it";
  export const full: PluginWithOptions<{ shortcuts?: Record<string, string> }>;
}
declare module "markdown-it-emoji/lib/data/full.mjs" {
  const definitions: Record<string, string>;
  export default definitions;
}
declare module "markdown-it/lib/rules_block/fence.mjs" {
  import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
  export default function rule(
    state: StateBlock,
    start: number,
    end: number,
    silent: boolean,
  ): boolean;
}
declare module "markdown-it/lib/rules_block/blockquote.mjs" {
  import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
  export default function rule(
    state: StateBlock,
    start: number,
    end: number,
    silent: boolean,
  ): boolean;
}
declare module "markdown-it/lib/rules_block/list.mjs" {
  import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
  export default function rule(
    state: StateBlock,
    start: number,
    end: number,
    silent: boolean,
  ): boolean;
}
declare module "markdown-it/lib/rules_inline/text.mjs" {
  import type { RuleInline } from "markdown-it/lib/parser_inline.mjs";
  const rule: RuleInline;
  export default rule;
}
declare module "markdown-it/lib/rules_inline/html_inline.mjs" {
  import type { RuleInline } from "markdown-it/lib/parser_inline.mjs";
  const rule: RuleInline;
  export default rule;
}
declare module "markdown-it/lib/rules_inline/escape.mjs" {
  import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
  export default function rule(state: StateInline, silent: boolean): boolean;
}
declare module "markdown-it/lib/rules_inline/link.mjs" {
  import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
  export default function rule(state: StateInline, silent: boolean): boolean;
}
declare module "markdown-it/lib/rules_inline/image.mjs" {
  import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
  export default function rule(state: StateInline, silent: boolean): boolean;
}
declare module "markdown-it/lib/rules_inline/backticks.mjs" {
  import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
  export default function backticks(state: StateInline, silent: boolean): boolean;
}
