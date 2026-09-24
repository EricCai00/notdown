# markdown_mmd 官方语法测试文档

每个 CASE 独立执行；完整文件另作整篇转换。行范围以 cases.json 为准。
元数据文首、未闭合围栏、引用定义等边界必须使用独立片段结果，不能以拼接结果替代。



<!-- CASE paragraphs -->

第一段 line one
line two

第二段。


<!-- CASE hard-break-spaces -->

alpha  
beta


<!-- CASE headings-atx -->

# One

## Two ##

### Three #####

#### Four

##### Five

###### Six


<!-- CASE headings-setext -->

Title
=====

Subtitle
--------


<!-- CASE headings-space-boundary -->

#nospace

####### seven


<!-- CASE heading-interruption -->

paragraph
# heading


<!-- CASE quote-lazy -->

> first line
lazy continuation
> last line


<!-- CASE quote-nesting -->

> outer
>
> > inner
>
> tail


<!-- CASE quote-blocks -->

> ## heading
>
> - item
>
>     code


<!-- CASE bullet-markers -->

* alpha
* beta

+ gamma
+ delta

- epsilon
- zeta


<!-- CASE ordered-start -->

3. third
8. fourth
1. fifth


<!-- CASE list-tight-loose -->

- tight one
- tight two

1. loose one

2. loose two


<!-- CASE list-paragraphs -->

- first

    second paragraph

    > quote

        code


<!-- CASE list-nesting -->

1. outer
    - middle
        1. inner
2. next


<!-- CASE list-interruption -->

paragraph
- candidate

1986. historical year


<!-- CASE code-indentation -->

    <sample>& literal *text*

    next line


<!-- CASE code-tab -->

	alpha	beta


<!-- CASE rules -->

***

- - -

___

* * * *


<!-- CASE inline-links -->

[label](https://example.com/a?x=1&y=2 "a title") [relative](./next.md) [fragment](#anchor)


<!-- CASE reference-links -->

[full][Ref] [ref][] [Ref]

[ref]: https://example.com "reference title"


<!-- CASE reference-spacing -->

[visible] [case fold]

[CASE FOLD]: <https://example.com>
    "continued title"


<!-- CASE reference-duplicate -->

[target]

[target]: /first
[target]: /second


<!-- CASE emphasis -->

*italic* _italic_ **bold** __bold__ ***both*** a*b*c a_b_c


<!-- CASE emphasis-boundaries -->

* spaced * ** spaced ** foo__bar__baz **outer *inner* tail**


<!-- CASE code-spans -->

`<b>& *literal*</b>` ``backtick ` inside`` `` padded ``


<!-- CASE images -->

![caption](/image.png "image title")

inline ![reference][pic] tail

[pic]: /other.png "reference title"


<!-- CASE autolinks -->

<https://example.com/a?x=1&y=2> <reader@example.com>


<!-- CASE escaping -->

\*literal\* \_literal\_ \`code\` \#heading \[link] \! \\


<!-- CASE entities -->

AT&T 4 < 5 &copy; &amp; &#35; &#x41; &not-an-entity;


<!-- CASE html-inline -->

before <span title="t">*em*</span> <u>under</u> after


<!-- CASE html-block -->

before

<div>
*literal inside block*
</div>

after


<!-- CASE html-comment -->

before

<!-- hidden
line -->

after


<!-- CASE escaped-list -->

1\. plain

\- plain


<!-- CASE unicode -->

中文 **加粗** Ελληνικά café 😀


<!-- CASE extra-definitions -->

Term A
Term B
:   first definition
:   second definition

Term C
:   third


<!-- CASE extra-definition-lazy -->

Term
:   first line
lazy continuation


<!-- CASE extra-definition-loose -->

Term

:   paragraph one

    paragraph two

    > quote

    - list


<!-- CASE extra-footnote-order -->

second[^b] first[^a] repeat[^b]

[^a]: Alpha
[^b]: Beta


<!-- CASE extra-footnote-blocks -->

note[^multi]

[^multi]:
    first

    second

    - nested

        code


<!-- CASE mmd-abbreviation -->

[>API] [>(UI) User interface] API

[>API]: Application programming interface


<!-- CASE mmd-abbreviation-boundary -->

API api XAPI [>API]

[>API]: *Plain* definition


<!-- CASE mmd-citation -->

claim[p. 8][#smith:2026] and [][#smith:2026]

[#smith:2026]: Alex Smith. *Testing*. 2026.


<!-- CASE mmd-citation-inline -->

claim[#Alex Smith. *Testing*. 2026.]


<!-- CASE mmd-citation-uncited -->

[Not cited][#unused]

[#unused]: Unused work.


<!-- CASE mmd-bibtex -->

BibTeX: references
Biblio Style: plain

[#smith] [#smith;] [p. 4][#smith;]


<!-- CASE mmd-critic-add -->

before {++new++} after


<!-- CASE mmd-critic-delete -->

before {--old--} after


<!-- CASE mmd-critic-substitute -->

before {~~old~>new~~} after


<!-- CASE mmd-critic-highlight -->

before {==marked==} after


<!-- CASE mmd-critic-comment -->

before {>>review<<} after


<!-- CASE mmd-critic-boundary -->

{++one

two++}


<!-- CASE mmd-cross-heading -->

## Target heading

[Target heading][]


<!-- CASE mmd-explicit-id -->

## Target [explicit] ##

[explicit][]

Setext [underlined]
===================

[underlined]


<!-- CASE mmd-ref-precedence -->

## Target

[Target][]

[Target]: /external


<!-- CASE mmd-fences -->

`````python
``` literal shorter fence
`````


<!-- CASE mmd-fence-unclosed -->

```text
continues to EOF


<!-- CASE mmd-transclude -->

before

{{include.md}}

after


<!-- CASE mmd-transclude-code -->

```
{{include.txt}}
```


<!-- CASE mmd-transclude-wildcard -->

{{include.*}}


<!-- CASE mmd-transclude-base -->

Transclude Base: assets

{{include.md}}


<!-- CASE mmd-footnote-inline -->

reference[^A note with *emphasis*]


<!-- CASE mmd-glossary -->

[?(term) A *definition*] and [?term] and term.

[?term]: A definition


<!-- CASE mmd-image-figure -->

![A **bold** caption](/sample.png)


<!-- CASE mmd-image-inline -->

before ![alt](/sample.png) after


<!-- CASE mmd-reference-attrs -->

![sample][] [link][]

[sample]: /sample.png "title" width=40px height=50px
[link]: /target class=external
    title="multi word"


<!-- CASE mmd-inline-attrs -->

[label](/target "title" class=external)


<!-- CASE mmd-math -->

Inline \\(x+1\\) and $y^2$.

\\[x^2\\]

$$z^2$$


<!-- CASE mmd-math-boundary -->

$ spaced $ a$x$b $x$5 and $5.00


<!-- CASE mmd-scripts -->

100m^2 and x~z and y^(a+b)^ and x~y,z~


<!-- CASE mmd-metadata -->

Title: *Plain title*
Author: A
Long Key: first
    second: value

[%title] [%longkey] [%missing]


<!-- CASE mmd-metadata-delimited -->

---
Title: Demo
...

[%title]


<!-- CASE mmd-metadata-not-start -->


Title: Not metadata

[%title]


<!-- CASE mmd-base-header -->

Base Header Level: 2

# Heading


<!-- CASE mmd-header-footer -->

MMD Header: **Before**
MMD Footer: **After**

Body


<!-- CASE mmd-html-footer -->

HTML Footer: <aside>Tail</aside>

Body


<!-- CASE mmd-smart -->

"double" 'single' -- --- ... ``quoted''


<!-- CASE mmd-smart-language -->

Quotes Language: french

"quoted"


<!-- CASE mmd-raw-inline -->

before `<b>raw</b>`{=html} after `omitted`{=latex}


<!-- CASE mmd-raw-block -->

```{=html}
<aside>raw</aside>
```

```{=*}
<b>all formats</b>
```


<!-- CASE mmd-toc -->

{{TOC}}

{{TOC:2}}

{{TOC:2-3}}

# Main

## Part

### Detail

#### Excluded


<!-- CASE mmd-table -->

| Group ||
| A | B |
| :--- | ---: |
| joined ||

| next | row |
[Caption][table-label]

[table-label]


<!-- CASE mmd-table-escape -->

| A | B |
| --- | --- |
| x\|y | `code` |
[Caption]


<!-- CASE mmd-table-wrap -->

| A | B |
| --- | --- |
| first | second |\
| continued | content |


<!-- CASE mmd-table-no-block -->

| A | B |
| --- | --- |
| # not heading | - not list |


<!-- CASE mmd-key-author -->

Author: audit-value

Body


<!-- CASE mmd-key-affiliation -->

Affiliation: audit-value

Body


<!-- CASE mmd-key-biblio-style -->

Biblio Style: audit-value

Body


<!-- CASE mmd-key-bibtex -->

BibTeX: audit-value

Body


<!-- CASE mmd-key-copyright -->

Copyright: audit-value

Body


<!-- CASE mmd-key-css -->

CSS: audit-value

Body


<!-- CASE mmd-key-date -->

Date: audit-value

Body


<!-- CASE mmd-key-html-header -->

HTML Header: audit-value

Body


<!-- CASE mmd-key-language -->

Language: audit-value

Body


<!-- CASE mmd-key-latex-author -->

LaTeX Author: audit-value

Body


<!-- CASE mmd-key-latex-begin -->

LaTeX Begin: audit-value

Body


<!-- CASE mmd-key-latex-config -->

LaTeX Config: audit-value

Body


<!-- CASE mmd-key-latex-footer -->

LaTeX Footer: audit-value

Body


<!-- CASE mmd-key-latex-header -->

LaTeX Header: audit-value

Body


<!-- CASE mmd-key-latex-leader -->

LaTeX Leader: audit-value

Body


<!-- CASE mmd-key-latex-mode -->

LaTeX Mode: audit-value

Body


<!-- CASE mmd-key-latex-title -->

LaTeX Title: audit-value

Body


<!-- CASE mmd-key-odf-header -->

ODF Header: audit-value

Body


<!-- CASE mmd-key-title -->

Title: audit-value

Body
