# commonmark_x 官方语法测试文档

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


<!-- CASE pandoc-alerts -->

> [!NOTE]
> Body


<!-- CASE pandoc-ascii_identifiers -->

# Café 中文


<!-- CASE pandoc-attributes -->

*em*{.red}

{#para}
Paragraph


<!-- CASE pandoc-autolink_bare_uris -->

https://example.com/a_(b) user@example.com www.example.com


<!-- CASE pandoc-bracketed_spans -->

[**bold** text]{#span .smallcaps lang=en}


<!-- CASE pandoc-definition_lists -->

Term
:   First
~   Second

Next

:   Loose paragraph

    Continued


<!-- CASE pandoc-east_asian_line_breaks -->

中文
段落
English
next


<!-- CASE pandoc-emoji -->

:smile: :+1: :unknown:


<!-- CASE pandoc-fancy_lists -->

(a) alpha
(b) beta

iv. four
v. five

A.  capital
B.  next

#. auto
#. auto


<!-- CASE pandoc-fenced_divs -->

:::: {.outer}

::: {.inner}
**inside**
:::

::::


<!-- CASE pandoc-footnotes -->

ref[^b] ref[^a] repeat[^b]

[^a]: first
[^b]: second

    extra paragraph


<!-- CASE pandoc-gfm_auto_identifiers -->

# 33 Café 中文 & emoji 😀


<!-- CASE pandoc-hard_line_breaks -->

first
second


<!-- CASE pandoc-implicit_figures -->

![**Caption**](/sample.png "title")


<!-- CASE pandoc-implicit_header_references -->

# Target heading

[Target heading] [Target heading][] [text][target heading]


<!-- CASE pandoc-pipe_tables -->

| A | B |
| :--- | ---: |
| **x** | y |


<!-- CASE pandoc-raw_attribute -->

before `<b>raw</b>`{=html} after

```{=latex}
\clearpage
```


<!-- CASE pandoc-raw_html -->

before <kbd>K</kbd> after

<section>raw</section>


<!-- CASE pandoc-rebase_relative_paths -->

[link](../Target.md) ![image](assets/sample.svg)


<!-- CASE pandoc-smart -->

"double" 'single' -- --- ...


<!-- CASE pandoc-sourcepos -->

# Heading

Text *emphasis*.


<!-- CASE pandoc-strikeout -->

~~deleted~~ ~single~


<!-- CASE pandoc-subscript -->

H~2~O and X~long\ text~


<!-- CASE pandoc-superscript -->

X^2^ and X^long\ text^


<!-- CASE pandoc-task_lists -->

- [ ] open
- [x] closed
- [X] uppercase


<!-- CASE pandoc-tex_math_dollars -->

$x^2$ and $ spaced $ and $x$5

$$
y^2
$$


<!-- CASE pandoc-tex_math_gfm -->

$`x+1`$

```math
x^2
```


<!-- CASE pandoc-wikilinks_title_after_pipe -->

[[Target|Label]] [[Target]]


<!-- CASE pandoc-wikilinks_title_before_pipe -->

[[Label|Target]] [[Target]]


<!-- CASE pandoc-yaml_metadata_block -->

---
title: Demo
author: [One, Two]
custom: value
---

Body


<!-- CASE pandoc-boundary-yaml-later -->

Text

---
title: Later
---

More


<!-- CASE pandoc-boundary-yaml-multiple -->

---
author: One
---

Body

---
title: Later
---


<!-- CASE pandoc-boundary-definition-multi-terms -->

Term A
Term B
:   Meaning


<!-- CASE pandoc-boundary-fancy-negative -->

A. Smith

Hello. world

abc) not list

(a. malformed


<!-- CASE pandoc-boundary-fence-interruption -->

paragraph
```
code
```


<!-- CASE pandoc-boundary-fence-indent -->

   ~~~
   code
   ~~~


<!-- CASE pandoc-boundary-header-empty -->

## {#empty}

## {.unnumbered}


<!-- CASE pandoc-boundary-math-literal -->

`$literal$`

```
$literal$
```


<!-- CASE pandoc-boundary-line-block-empty -->

| One
|
| Three


<!-- CASE pandoc-boundary-table-headless -->

------- -------
One     Two
Three   Four
------- -------


<!-- CASE pandoc-boundary-grid-span -->

+-------+-------+
| spanning      |
+=======+=======+
| a     | b     |
+-------+-------+


<!-- CASE pandoc-boundary-figure-optout -->

![caption](/sample.png)\


<!-- CASE pandoc-boundary-citation-punctuation -->

[@key_with_under; -@other, chap. 2] @key_with_under [p. 3]
