# Vendored editor grammars

`sed.tmLanguage.json` is the JSON conversion of `grammars/sed.cson` from
[Alhadis/language-sed](https://github.com/Alhadis/language-sed/tree/c55c39ef05f29ad1a73a864170c06f3ee25e85f2),
commit `c55c39ef05f29ad1a73a864170c06f3ee25e85f2`.

The upstream ISC license is retained in `sed.LICENSE`. Conversion used
`cson-parser@4.0.9` and `JSON.stringify(grammar, null, 2)`, with only the top-level
`name` changed to `sed` for Shiki registration. No runtime CSON dependency or
network loading is required. The grammar is evaluated by Shiki's JavaScript regex
engine; editor tests cover substitution delimiters, escapes, addresses and
transliteration. This is lexical highlighting, not a sed interpreter.
