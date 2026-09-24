// Explicit local components, in Prism dependency order; no runtime CDN or DOM highlighting.
import Prism from "prismjs";
import "prismjs/components/prism-abap";
import "prismjs/components/prism-agda";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-arduino";
import "prismjs/components/prism-nasm";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-basic";
import "prismjs/components/prism-bnf";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-clojure";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-coffeescript";
import "prismjs/components/prism-css";
import "prismjs/components/prism-dart";
import "prismjs/components/prism-dhall";
import "prismjs/components/prism-diff";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-ebnf";
import "prismjs/components/prism-elixir";
import "prismjs/components/prism-elm";
import "prismjs/components/prism-erlang";
import "prismjs/components/prism-fsharp";
import "prismjs/components/prism-flow";
import "prismjs/components/prism-fortran";
import "prismjs/components/prism-gherkin";
import "prismjs/components/prism-glsl";
import "prismjs/components/prism-go";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-graphql";
import "prismjs/components/prism-groovy";
import "prismjs/components/prism-haskell";
import "prismjs/components/prism-hcl";
import "prismjs/components/prism-idris";
import "prismjs/components/prism-java";
import "prismjs/components/prism-json";
import "prismjs/components/prism-julia";
import "prismjs/components/prism-kotlin";
import "prismjs/components/prism-latex";
import "prismjs/components/prism-less";
import "prismjs/components/prism-lisp";
import "prismjs/components/prism-livescript";
import "prismjs/components/prism-llvm";
import "prismjs/components/prism-lua";
import "prismjs/components/prism-makefile";
import "prismjs/components/prism-wolfram";
import "prismjs/components/prism-matlab";
import "prismjs/components/prism-nix";
import "prismjs/components/prism-objectivec";
import "prismjs/components/prism-ocaml";
import "prismjs/components/prism-pascal";
import "prismjs/components/prism-perl";
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-php";
import "prismjs/components/prism-powershell";
import "prismjs/components/prism-prolog";
import "prismjs/components/prism-protobuf";
import "prismjs/components/prism-purescript";
import "prismjs/components/prism-python";
import "prismjs/components/prism-r";
import "prismjs/components/prism-scheme";
import "prismjs/components/prism-racket";
import "prismjs/components/prism-reason";
import "prismjs/components/prism-coq";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-sass";
import "prismjs/components/prism-scala";
import "prismjs/components/prism-scss";
import "prismjs/components/prism-smalltalk";
import "prismjs/components/prism-solidity";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-swift";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-vbnet";
import "prismjs/components/prism-verilog";
import "prismjs/components/prism-vhdl";
import "prismjs/components/prism-visual-basic";
import "prismjs/components/prism-wasm";
import "prismjs/components/prism-ini";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-actionscript";
import "prismjs/components/prism-awk";
import "prismjs/components/prism-batch";
import "prismjs/components/prism-wiki";
import "prismjs/components/prism-django";
import "prismjs/components/prism-turtle";
import "prismjs/components/prism-sparql";
import "prismjs/components/prism-vim";
import "prismjs/components/prism-regex";
import "prismjs/components/prism-excel-formula";

Prism.manual = true;
Prism.disableWorkerMessageHandler = true;

// 易语言's copied text source, not the binary .e project format. Lexical coloring only.
Prism.languages.epl = {
  comment: { pattern: /'[^\r\n]*/, greedy: true },
  string: [
    { pattern: /"[^"\r\n]*"/, greedy: true },
    { pattern: /“[^”\r\n]*”/, greedy: true },
  ],
  keyword: { pattern: /(^[\t ]*)\.[\p{L}_][\p{L}\p{N}_]*/mu, lookbehind: true },
  constant: /#[\p{L}_][\p{L}\p{N}_]*/u,
  boolean: { pattern: /(^|[^\p{L}\p{N}_])(?:真|假)(?![\p{L}\p{N}_])/u, lookbehind: true },
  function: /[\p{L}_][\p{L}\p{N}_]*(?=[\t ]*\()/u,
  number: { pattern: /(^|[^\p{L}\p{N}_])(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)(?![\p{L}\p{N}_])/iu, lookbehind: true },
  operator: /[+*/%<>=!＆|^÷×≠≤≥＝－-]+/,
  punctuation: /[()[\]{},，.]/,
};

// GNU Octave extends the MATLAB family, but has its own comments, strings and keywords.
// https://docs.octave.org/interpreter/Keywords.html
// https://docs.octave.org/interpreter/Block-Comments.html
Prism.languages.octave = Prism.languages.extend("matlab", {
  comment: [
    { pattern: /^[\t ]*([#%])\{[\t ]*\r?\n[\s\S]*?^[\t ]*\1\}[\t ]*(?=\r?$)/m, greedy: true },
    { pattern: /[#%][^\r\n]*/, greedy: true },
  ],
  string: [
    { pattern: /"(?:\\[\s\S]|""|[^"\\])*"/, greedy: true },
    { pattern: /(^|[^\w\])}.'])'(?:''|[^'\r\n])*'/, lookbehind: true, greedy: true },
  ],
  keyword: /\b(?:__FILE__|__LINE__|break|case|catch|classdef|continue|do|else|elseif|end|end_try_catch|end_unwind_protect|endclassdef|endenumeration|endevents|endfor|endfunction|endif|endmethods|endparfor|endproperties|endswitch|endwhile|enumeration|events|for|function|global|if|methods|otherwise|parfor|persistent|properties|return|switch|try|until|unwind_protect|unwind_protect_cleanup|while)\b/,
  builtin: /\b(?:Inf|NaN|NA|inf|nan|pi|true|false)\b/,
  operator: /\.?[*^/\\']=?|\+\+|--|[+\-:@]|[<>=~!]=?|&&?|\|\|?/,
});

// Lexical coloring only, based on https://www.notion.com/help/formula-syntax.
// No evaluation, property lookup, or claim of Notion's semantic validation.
Prism.languages["notion-formula"] = {
  comment: { pattern: /\/\*[\s\S]*?(?:\*\/|$)/, greedy: true },
  string: { pattern: /"(?:\\[\s\S]|[^"\\])*"/, greedy: true },
  boolean: /\b(?:true|false)\b/,
  keyword: /\b(?:if|ifs|let|lets)\b/,
  function: /[\p{L}_][\p{L}\p{N}_]*(?=\s*\()/u,
  variable: /\b(?:current|index)\b/,
  number: /\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b/i,
  operator: /\b(?:and|or|not)\b|!=|==|>=|<=|&&|\|\||[+*/%^!?<>:=\-]/,
  punctuation: /[()[\]{},.]/,
};

export { Prism };
