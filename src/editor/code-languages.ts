export interface CodeLanguage {
  id: string;
  label: string;
  /** null is intentional plain text, rather than a missing grammar. */
  grammar: string | null;
  engine?: "prism" | "shiki";
  aliases?: readonly string[];
}

/** Notion's language menu, excluding Mermaid (a diagram). Preserve existing fence IDs. */
const notionCodeLanguages: readonly CodeLanguage[] = [
  { id: "abap", label: "ABAP", grammar: "abap" },
  { id: "agda", label: "Agda", grammar: "agda" },
  { id: "arduino", label: "Arduino", grammar: "arduino" },
  { id: "ascii-art", label: "ASCII Art", grammar: null, aliases: ["ascii", "ascii art"] },
  { id: "assembly", label: "Assembly", grammar: "nasm", aliases: ["asm", "nasm"] },
  { id: "bash", label: "Bash", grammar: "bash", aliases: ["sh"] },
  { id: "basic", label: "BASIC", grammar: "basic" },
  { id: "bnf", label: "BNF", grammar: "bnf" },
  { id: "c", label: "C", grammar: "c", aliases: ["h"] },
  { id: "c#", label: "C#", grammar: "csharp", aliases: ["csharp", "cs"] },
  { id: "c++", label: "C++", grammar: "cpp", aliases: ["cpp", "cc", "cxx", "h++", "hpp", "hxx"] },
  { id: "clojure", label: "Clojure", grammar: "clojure", aliases: ["clj"] },
  { id: "coffeescript", label: "CoffeeScript", grammar: "coffeescript", aliases: ["coffee"] },
  { id: "css", label: "CSS", grammar: "css" },
  { id: "dart", label: "Dart", grammar: "dart" },
  { id: "dhall", label: "Dhall", grammar: "dhall" },
  { id: "diff", label: "Diff", grammar: "diff", aliases: ["patch"] },
  { id: "docker", label: "Docker", grammar: "docker", aliases: ["dockerfile"] },
  { id: "ebnf", label: "EBNF", grammar: "ebnf" },
  { id: "elixir", label: "Elixir", grammar: "elixir", aliases: ["ex", "exs"] },
  { id: "elm", label: "Elm", grammar: "elm" },
  { id: "erlang", label: "Erlang", grammar: "erlang", aliases: ["erl"] },
  { id: "f#", label: "F#", grammar: "fsharp", aliases: ["fsharp", "fs"] },
  { id: "flow", label: "Flow", grammar: "flow" },
  { id: "fortran", label: "Fortran", grammar: "fortran" },
  { id: "gherkin", label: "Gherkin", grammar: "gherkin" },
  { id: "glsl", label: "GLSL", grammar: "glsl" },
  { id: "go", label: "Go", grammar: "go", aliases: ["golang"] },
  { id: "graphql", label: "GraphQL", grammar: "graphql", aliases: ["gql"] },
  { id: "groovy", label: "Groovy", grammar: "groovy" },
  { id: "haskell", label: "Haskell", grammar: "haskell", aliases: ["hs"] },
  { id: "hcl", label: "HCL", grammar: "hcl", aliases: ["terraform", "tf"] },
  { id: "html", label: "HTML", grammar: "markup" },
  { id: "idris", label: "Idris", grammar: "idris", aliases: ["idr"] },
  { id: "java", label: "Java", grammar: "java" },
  { id: "javascript", label: "JavaScript", grammar: "javascript", aliases: ["js", "jsx", "mjs", "cjs"] },
  { id: "json", label: "JSON", grammar: "json" },
  { id: "julia", label: "Julia", grammar: "julia", aliases: ["jl"] },
  { id: "kotlin", label: "Kotlin", grammar: "kotlin", aliases: ["kt", "kts"] },
  { id: "latex", label: "LaTeX", grammar: "latex", aliases: ["tex"] },
  { id: "less", label: "Less", grammar: "less" },
  { id: "lisp", label: "Lisp", grammar: "lisp" },
  { id: "livescript", label: "LiveScript", grammar: "livescript" },
  { id: "llvm", label: "LLVM IR", grammar: "llvm", aliases: ["llvm ir", "llvm-ir"] },
  { id: "lua", label: "Lua", grammar: "lua" },
  { id: "makefile", label: "Makefile", grammar: "makefile", aliases: ["make", "mk", "mak"] },
  { id: "markdown", label: "Markdown", grammar: "markdown", aliases: ["md", "mkdown", "mkd"] },
  { id: "markup", label: "Markup", grammar: "markup" },
  { id: "matlab", label: "MATLAB", grammar: "matlab" },
  { id: "nix", label: "Nix", grammar: "nix" },
  { id: "notion-formula", label: "Notion Formula", grammar: "notion-formula", aliases: ["notion formula", "notion_formula"] },
  { id: "objective-c", label: "Objective-C", grammar: "objectivec", aliases: ["objectivec", "objc", "obj-c"] },
  { id: "ocaml", label: "OCaml", grammar: "ocaml" },
  { id: "pascal", label: "Pascal", grammar: "pascal", aliases: ["delphi"] },
  { id: "perl", label: "Perl", grammar: "perl", aliases: ["pl", "pm"] },
  { id: "php", label: "PHP", grammar: "php" },
  { id: "plain text", label: "Plain Text", grammar: null, aliases: ["", "text", "txt", "plaintext", "plain"] },
  { id: "powershell", label: "PowerShell", grammar: "powershell", aliases: ["ps", "ps1"] },
  { id: "prolog", label: "Prolog", grammar: "prolog" },
  { id: "protobuf", label: "Protobuf", grammar: "protobuf", aliases: ["proto"] },
  { id: "purescript", label: "PureScript", grammar: "purescript", aliases: ["purs"] },
  { id: "python", label: "Python", grammar: "python", aliases: ["py", "gyp"] },
  { id: "r", label: "R", grammar: "r" },
  { id: "racket", label: "Racket", grammar: "racket", aliases: ["rkt"] },
  { id: "reason", label: "Reason", grammar: "reason", aliases: ["re"] },
  { id: "rocq", label: "Rocq", grammar: "coq", aliases: ["coq"] },
  { id: "ruby", label: "Ruby", grammar: "ruby", aliases: ["rb", "gemspec", "podspec", "thor", "irb"] },
  { id: "rust", label: "Rust", grammar: "rust", aliases: ["rs"] },
  { id: "sass", label: "Sass", grammar: "sass" },
  { id: "scala", label: "Scala", grammar: "scala" },
  { id: "scheme", label: "Scheme", grammar: "scheme" },
  { id: "scss", label: "SCSS", grammar: "scss" },
  { id: "shell", label: "Shell", grammar: "bash", aliases: ["zsh"] },
  { id: "smalltalk", label: "Smalltalk", grammar: "smalltalk", aliases: ["st"] },
  { id: "solidity", label: "Solidity", grammar: "solidity", aliases: ["sol"] },
  { id: "sql", label: "SQL", grammar: "sql" },
  { id: "swift", label: "Swift", grammar: "swift" },
  { id: "toml", label: "TOML", grammar: "toml" },
  { id: "typescript", label: "TypeScript", grammar: "typescript", aliases: ["ts", "tsx", "mts", "cts"] },
  { id: "vb.net", label: "VB.Net", grammar: "vbnet", aliases: ["vbnet", "vb"] },
  { id: "verilog", label: "Verilog", grammar: "verilog" },
  { id: "vhdl", label: "VHDL", grammar: "vhdl" },
  { id: "visual basic", label: "Visual Basic", grammar: "visual-basic", aliases: ["visual-basic", "vba"] },
  { id: "webassembly", label: "WebAssembly", grammar: "wasm", aliases: ["wasm", "wat"] },
  { id: "mathematica", label: "Wolfram Language", grammar: "wolfram", aliases: ["wolfram", "wolfram-language", "wl", "nb"] },
  { id: "xml", label: "XML", grammar: "markup", aliases: ["xhtml", "rss", "atom", "xsd", "xsl", "plist", "wsf"] },
  { id: "yaml", label: "YAML", grammar: "yaml", aliases: ["yml"] },
];

const customCodeLanguages: readonly CodeLanguage[] = [
  { id: "actionscript", label: "ActionScript", grammar: "actionscript", aliases: ["as", "as3"] },
  { id: "awk", label: "AWK", grammar: "awk", aliases: ["gawk"] },
  { id: "batch", label: "Batch (CMD)", grammar: "batch", aliases: ["bat", "cmd", "dos", "windows batch"] },
  { id: "django", label: "Django Template Language", grammar: "django", aliases: ["dtl", "django-html", "django template"] },
  { id: "epl", label: "Easy Programming Language", grammar: "epl", aliases: ["易语言", "eyuyan", "e-language"] },
  { id: "excel-formula", label: "Excel Formula", grammar: "excel-formula", aliases: ["excel", "xlsx", "xls", "Excel 公式"] },
  { id: "octave", label: "GNU Octave", grammar: "octave" },
  { id: "jinja", label: "Jinja", grammar: "jinja2", aliases: ["jinja2", "j2", "jinja-html"] },
  { id: "lean", label: "Lean", grammar: "lean4", engine: "shiki", aliases: ["lean4", "lean 4"] },
  { id: "regex", label: "Regular Expression", grammar: "regex", aliases: ["regexp", "regular-expression", "正则", "正则表达式"] },
  { id: "sed", label: "sed", grammar: "sed", engine: "shiki", aliases: ["gsed", "gnu sed"] },
  { id: "sparql", label: "SPARQL", grammar: "sparql", aliases: ["rq"] },
  { id: "svg", label: "SVG", grammar: "markup", aliases: ["scalable vector graphics"] },
  { id: "turtle", label: "Turtle", grammar: "turtle", aliases: ["ttl", "rdf turtle"] },
  { id: "vimscript", label: "Vimscript", grammar: "vim", aliases: ["vim", "viml", "vim script"] },
  { id: "wenyan", label: "Wenyan", grammar: "wenyan", engine: "shiki", aliases: ["wenyan-lang", "wenyan lang", "文言", "文言文"] },
  { id: "wikitext", label: "Wikitext", grammar: "wiki", aliases: ["wiki", "mediawiki", "wiki markup"] },
];

export interface CodeLanguageGroup { label: string; languages: readonly CodeLanguage[] }

export const codeLanguageGroups: readonly CodeLanguageGroup[] = [
  { label: "Notion", languages: notionCodeLanguages },
  { label: "Custom", languages: customCodeLanguages },
];

export const codeLanguages: readonly CodeLanguage[] = codeLanguageGroups.flatMap(group => group.languages);

/** Search labels, fence IDs and aliases across both groups without mixing their results. */
export function filterCodeLanguages(query: string): CodeLanguageGroup[] {
  const normalized = query.trim().toLowerCase();
  return codeLanguageGroups.map(group => ({
    ...group,
    languages: group.languages.filter(language => !normalized ||
      [language.id, language.label, ...(language.aliases ?? [])].some(name => name.toLowerCase().includes(normalized))),
  })).filter(group => group.languages.length);
}

const byName = new Map<string, CodeLanguage>();
for (const language of codeLanguages) {
  for (const name of [language.id, language.label, ...(language.aliases ?? [])])
    byName.set(name.toLowerCase(), language);
}

export function codeLanguage(params: string): CodeLanguage | undefined {
  if (/^\{r(?:[\s,][^\r\n]*|)\}$/.test(params.trim())) return byName.get("r");
  return byName.get(params.trim().toLowerCase());
}

export function codeLanguageLabel(params: string): string {
  return codeLanguage(params)?.label ?? params;
}
