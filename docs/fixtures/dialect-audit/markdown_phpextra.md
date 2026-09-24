# markdown_phpextra 官方语法测试文档

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


<!-- CASE table-align -->

| left | center | right |
| :--- | :---: | ---: |
| *a* | **b** | `c` |


<!-- CASE table-pipes -->

a | b
--- | ---
\| | `x\|y`
short
extra | cell | discarded


<!-- CASE table-negative -->

a | b
---
x | y


<!-- CASE table-empty-body -->

| a | b |
| --- | --- |


<!-- CASE table-block-boundary -->

| a | b |
| --- | --- |
| x | y |

> next block


<!-- CASE extra-html-interrupt -->

paragraph
<div>
raw
</div>
after


<!-- CASE extra-html-indent -->

   <div>raw</div>

    <div>code</div>


<!-- CASE extra-html-list -->

- item

    <div>
    raw content
    </div>


<!-- CASE extra-markdown-one -->

<div markdown="1">
**parsed**

- child
</div>


<!-- CASE extra-markdown-span -->

<p markdown="1">**strong** and *em*
- inline text</p>


<!-- CASE extra-markdown-cell -->

<table><tr><td markdown="block">

- child
- next

</td></tr></table>


<!-- CASE extra-heading-attrs -->

Heading {#setext .one lang=fr}
=======

## Atx ## {.main .shine #atx lang=fr}


<!-- CASE extra-link-image-attrs -->

[link](/target){#link .external lang=en}

![image](/sample.png){#image .small}


<!-- CASE extra-reference-attrs -->

[visible][ref] ![alt][ref]

[ref]: /target "title" {#ref .external}


<!-- CASE extra-fence-tilde -->

~~~ .html
<b>literal</b>
~~~


<!-- CASE extra-fence-backtick -->

```js
const a = 1;
```


<!-- CASE extra-fence-attrs -->

~~~ {.html #sample}
<p>literal</p>
~~~


<!-- CASE extra-fence-blanks -->

~~~

first
last

~~~


<!-- CASE extra-fence-length -->

~~~
short
~~~~
still code?
~~~


<!-- CASE extra-one-column -->

| only |
| --- |
| value |


<!-- CASE extra-one-column-negative -->

only
----
value


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


<!-- CASE extra-abbreviation -->

ABC abc ABCD multi word EMPTY

*[ABC]: Alpha Beta
*[multi word]: Longer phrase
*[EMPTY]:


<!-- CASE extra-escape -->

Term
\: not a definition

a \| b
--- \| ---
