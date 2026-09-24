# commonmark 官方语法测试文档

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


<!-- CASE cm-1 -->

	foo	baz		bim


<!-- CASE cm-2 -->

  	foo	baz		bim


<!-- CASE cm-3 -->

    a	a
    ὐ	a


<!-- CASE cm-4 -->

  - foo

	bar


<!-- CASE cm-5 -->

- foo

		bar


<!-- CASE cm-6 -->

>		foo


<!-- CASE cm-7 -->

-		foo


<!-- CASE cm-8 -->

    foo
	bar


<!-- CASE cm-9 -->

 - foo
   - bar
	 - baz


<!-- CASE cm-10 -->

#	Foo


<!-- CASE cm-11 -->

*	*	*	


<!-- CASE cm-12 -->

\!\"\#\$\%\&\'\(\)\*\+\,\-\.\/\:\;\<\=\>\?\@\[\\\]\^\_\`\{\|\}\~


<!-- CASE cm-13 -->

\	\A\a\ \3\φ\«


<!-- CASE cm-14 -->

\*not emphasized*
\<br/> not a tag
\[not a link](/foo)
\`not code`
1\. not a list
\* not a list
\# not a heading
\[foo]: /url "not a reference"
\&ouml; not a character entity


<!-- CASE cm-15 -->

\\*emphasis*


<!-- CASE cm-16 -->

foo\
bar


<!-- CASE cm-17 -->

`` \[\` ``


<!-- CASE cm-18 -->

    \[\]


<!-- CASE cm-19 -->

~~~
\[\]
~~~


<!-- CASE cm-20 -->

<https://example.com?find=\*>


<!-- CASE cm-21 -->

<a href="/bar\/)">


<!-- CASE cm-22 -->

[foo](/bar\* "ti\*tle")


<!-- CASE cm-23 -->

[foo]

[foo]: /bar\* "ti\*tle"


<!-- CASE cm-24 -->

``` foo\+bar
foo
```


<!-- CASE cm-25 -->

&nbsp; &amp; &copy; &AElig; &Dcaron;
&frac34; &HilbertSpace; &DifferentialD;
&ClockwiseContourIntegral; &ngE;


<!-- CASE cm-26 -->

&#35; &#1234; &#992; &#0;


<!-- CASE cm-27 -->

&#X22; &#XD06; &#xcab;


<!-- CASE cm-28 -->

&nbsp &x; &#; &#x;
&#87654321;
&#abcdef0;
&ThisIsNotDefined; &hi?;


<!-- CASE cm-29 -->

&copy


<!-- CASE cm-30 -->

&MadeUpEntity;


<!-- CASE cm-31 -->

<a href="&ouml;&ouml;.html">


<!-- CASE cm-32 -->

[foo](/f&ouml;&ouml; "f&ouml;&ouml;")


<!-- CASE cm-33 -->

[foo]

[foo]: /f&ouml;&ouml; "f&ouml;&ouml;"


<!-- CASE cm-34 -->

``` f&ouml;&ouml;
foo
```


<!-- CASE cm-35 -->

`f&ouml;&ouml;`


<!-- CASE cm-36 -->

    f&ouml;f&ouml;


<!-- CASE cm-37 -->

&#42;foo&#42;
*foo*


<!-- CASE cm-38 -->

&#42; foo

* foo


<!-- CASE cm-39 -->

foo&#10;&#10;bar


<!-- CASE cm-40 -->

&#9;foo


<!-- CASE cm-41 -->

[a](url &quot;tit&quot;)


<!-- CASE cm-42 -->

- `one
- two`


<!-- CASE cm-43 -->

***
---
___


<!-- CASE cm-44 -->

+++


<!-- CASE cm-45 -->

===


<!-- CASE cm-46 -->

--
**
__


<!-- CASE cm-47 -->

 ***
  ***
   ***


<!-- CASE cm-48 -->

    ***


<!-- CASE cm-49 -->

Foo
    ***


<!-- CASE cm-50 -->

_____________________________________


<!-- CASE cm-51 -->

 - - -


<!-- CASE cm-52 -->

 **  * ** * ** * **


<!-- CASE cm-53 -->

-     -      -      -


<!-- CASE cm-54 -->

- - - -    


<!-- CASE cm-55 -->

_ _ _ _ a

a------

---a---


<!-- CASE cm-56 -->

 *-*


<!-- CASE cm-57 -->

- foo
***
- bar


<!-- CASE cm-58 -->

Foo
***
bar


<!-- CASE cm-59 -->

Foo
---
bar


<!-- CASE cm-60 -->

* Foo
* * *
* Bar


<!-- CASE cm-61 -->

- Foo
- * * *


<!-- CASE cm-62 -->

# foo
## foo
### foo
#### foo
##### foo
###### foo


<!-- CASE cm-63 -->

####### foo


<!-- CASE cm-64 -->

#5 bolt

#hashtag


<!-- CASE cm-65 -->

\## foo


<!-- CASE cm-66 -->

# foo *bar* \*baz\*


<!-- CASE cm-67 -->

#                  foo                     


<!-- CASE cm-68 -->

 ### foo
  ## foo
   # foo


<!-- CASE cm-69 -->

    # foo


<!-- CASE cm-70 -->

foo
    # bar


<!-- CASE cm-71 -->

## foo ##
  ###   bar    ###


<!-- CASE cm-72 -->

# foo ##################################
##### foo ##


<!-- CASE cm-73 -->

### foo ###     


<!-- CASE cm-74 -->

### foo ### b


<!-- CASE cm-75 -->

# foo#


<!-- CASE cm-76 -->

### foo \###
## foo #\##
# foo \#


<!-- CASE cm-77 -->

****
## foo
****


<!-- CASE cm-78 -->

Foo bar
# baz
Bar foo


<!-- CASE cm-79 -->

## 
#
### ###


<!-- CASE cm-80 -->

Foo *bar*
=========

Foo *bar*
---------


<!-- CASE cm-81 -->

Foo *bar
baz*
====


<!-- CASE cm-82 -->

  Foo *bar
baz*	
====


<!-- CASE cm-83 -->

Foo
-------------------------

Foo
=


<!-- CASE cm-84 -->

   Foo
---

  Foo
-----

  Foo
  ===


<!-- CASE cm-85 -->

    Foo
    ---

    Foo
---


<!-- CASE cm-86 -->

Foo
   ----      


<!-- CASE cm-87 -->

Foo
    ---


<!-- CASE cm-88 -->

Foo
= =

Foo
--- -


<!-- CASE cm-89 -->

Foo  
-----


<!-- CASE cm-90 -->

Foo\
----


<!-- CASE cm-91 -->

`Foo
----
`

<a title="a lot
---
of dashes"/>


<!-- CASE cm-92 -->

> Foo
---


<!-- CASE cm-93 -->

> foo
bar
===


<!-- CASE cm-94 -->

- Foo
---


<!-- CASE cm-95 -->

Foo
Bar
---


<!-- CASE cm-96 -->

---
Foo
---
Bar
---
Baz


<!-- CASE cm-97 -->


====


<!-- CASE cm-98 -->

---
---


<!-- CASE cm-99 -->

- foo
-----


<!-- CASE cm-100 -->

    foo
---


<!-- CASE cm-101 -->

> foo
-----


<!-- CASE cm-102 -->

\> foo
------


<!-- CASE cm-103 -->

Foo

bar
---
baz


<!-- CASE cm-104 -->

Foo
bar

---

baz


<!-- CASE cm-105 -->

Foo
bar
* * *
baz


<!-- CASE cm-106 -->

Foo
bar
\---
baz


<!-- CASE cm-107 -->

    a simple
      indented code block


<!-- CASE cm-108 -->

  - foo

    bar


<!-- CASE cm-109 -->

1.  foo

    - bar


<!-- CASE cm-110 -->

    <a/>
    *hi*

    - one


<!-- CASE cm-111 -->

    chunk1

    chunk2
  
 
 
    chunk3


<!-- CASE cm-112 -->

    chunk1
      
      chunk2


<!-- CASE cm-113 -->

Foo
    bar



<!-- CASE cm-114 -->

    foo
bar


<!-- CASE cm-115 -->

# Heading
    foo
Heading
------
    foo
----


<!-- CASE cm-116 -->

        foo
    bar


<!-- CASE cm-117 -->


    
    foo
    



<!-- CASE cm-118 -->

    foo  


<!-- CASE cm-119 -->

```
<
 >
```


<!-- CASE cm-120 -->

~~~
<
 >
~~~


<!-- CASE cm-121 -->

``
foo
``


<!-- CASE cm-122 -->

```
aaa
~~~
```


<!-- CASE cm-123 -->

~~~
aaa
```
~~~


<!-- CASE cm-124 -->

````
aaa
```
``````


<!-- CASE cm-125 -->

~~~~
aaa
~~~
~~~~


<!-- CASE cm-126 -->

```


<!-- CASE cm-127 -->

`````

```
aaa


<!-- CASE cm-128 -->

> ```
> aaa

bbb


<!-- CASE cm-129 -->

```

  
```


<!-- CASE cm-130 -->

```
```


<!-- CASE cm-131 -->

 ```
 aaa
aaa
```


<!-- CASE cm-132 -->

  ```
aaa
  aaa
aaa
  ```


<!-- CASE cm-133 -->

   ```
   aaa
    aaa
  aaa
   ```


<!-- CASE cm-134 -->

    ```
    aaa
    ```


<!-- CASE cm-135 -->

```
aaa
  ```


<!-- CASE cm-136 -->

   ```
aaa
  ```


<!-- CASE cm-137 -->

```
aaa
    ```


<!-- CASE cm-138 -->

``` ```
aaa


<!-- CASE cm-139 -->

~~~~~~
aaa
~~~ ~~


<!-- CASE cm-140 -->

foo
```
bar
```
baz


<!-- CASE cm-141 -->

foo
---
~~~
bar
~~~
# baz


<!-- CASE cm-142 -->

```ruby
def foo(x)
  return 3
end
```


<!-- CASE cm-143 -->

~~~~    ruby startline=3 $%@#$
def foo(x)
  return 3
end
~~~~~~~


<!-- CASE cm-144 -->

````;
````


<!-- CASE cm-145 -->

``` aa ```
foo


<!-- CASE cm-146 -->

~~~ aa ``` ~~~
foo
~~~


<!-- CASE cm-147 -->

```
``` aaa
```


<!-- CASE cm-148 -->

<table><tr><td>
<pre>
**Hello**,

_world_.
</pre>
</td></tr></table>


<!-- CASE cm-149 -->

<table>
  <tr>
    <td>
           hi
    </td>
  </tr>
</table>

okay.


<!-- CASE cm-150 -->

 <div>
  *hello*
         <foo><a>


<!-- CASE cm-151 -->

</div>
*foo*


<!-- CASE cm-152 -->

<DIV CLASS="foo">

*Markdown*

</DIV>


<!-- CASE cm-153 -->

<div id="foo"
  class="bar">
</div>


<!-- CASE cm-154 -->

<div id="foo" class="bar
  baz">
</div>


<!-- CASE cm-155 -->

<div>
*foo*

*bar*


<!-- CASE cm-156 -->

<div id="foo"
*hi*


<!-- CASE cm-157 -->

<div class
foo


<!-- CASE cm-158 -->

<div *???-&&&-<---
*foo*


<!-- CASE cm-159 -->

<div><a href="bar">*foo*</a></div>


<!-- CASE cm-160 -->

<table><tr><td>
foo
</td></tr></table>


<!-- CASE cm-161 -->

<div></div>
``` c
int x = 33;
```


<!-- CASE cm-162 -->

<a href="foo">
*bar*
</a>


<!-- CASE cm-163 -->

<Warning>
*bar*
</Warning>


<!-- CASE cm-164 -->

<i class="foo">
*bar*
</i>


<!-- CASE cm-165 -->

</ins>
*bar*


<!-- CASE cm-166 -->

<del>
*foo*
</del>


<!-- CASE cm-167 -->

<del>

*foo*

</del>


<!-- CASE cm-168 -->

<del>*foo*</del>


<!-- CASE cm-169 -->

<pre language="haskell"><code>
import Text.HTML.TagSoup

main :: IO ()
main = print $ parseTags tags
</code></pre>
okay


<!-- CASE cm-170 -->

<script type="text/javascript">
// JavaScript example

document.getElementById("demo").innerHTML = "Hello JavaScript!";
</script>
okay


<!-- CASE cm-171 -->

<textarea>

*foo*

_bar_

</textarea>


<!-- CASE cm-172 -->

<style
  type="text/css">
h1 {color:red;}

p {color:blue;}
</style>
okay


<!-- CASE cm-173 -->

<style
  type="text/css">

foo


<!-- CASE cm-174 -->

> <div>
> foo

bar


<!-- CASE cm-175 -->

- <div>
- foo


<!-- CASE cm-176 -->

<style>p{color:red;}</style>
*foo*


<!-- CASE cm-177 -->

<!-- foo -->*bar*
*baz*


<!-- CASE cm-178 -->

<script>
foo
</script>1. *bar*


<!-- CASE cm-179 -->

<!-- Foo

bar
   baz -->
okay


<!-- CASE cm-180 -->

<?php

  echo '>';

?>
okay


<!-- CASE cm-181 -->

<!DOCTYPE html>


<!-- CASE cm-182 -->

<![CDATA[
function matchwo(a,b)
{
  if (a < b && a < 0) then {
    return 1;

  } else {

    return 0;
  }
}
]]>
okay


<!-- CASE cm-183 -->

  <!-- foo -->

    <!-- foo -->


<!-- CASE cm-184 -->

  <div>

    <div>


<!-- CASE cm-185 -->

Foo
<div>
bar
</div>


<!-- CASE cm-186 -->

<div>
bar
</div>
*foo*


<!-- CASE cm-187 -->

Foo
<a href="bar">
baz


<!-- CASE cm-188 -->

<div>

*Emphasized* text.

</div>


<!-- CASE cm-189 -->

<div>
*Emphasized* text.
</div>


<!-- CASE cm-190 -->

<table>

<tr>

<td>
Hi
</td>

</tr>

</table>


<!-- CASE cm-191 -->

<table>

  <tr>

    <td>
      Hi
    </td>

  </tr>

</table>


<!-- CASE cm-192 -->

[foo]: /url "title"

[foo]


<!-- CASE cm-193 -->

   [foo]: 
      /url  
           'the title'  

[foo]


<!-- CASE cm-194 -->

[Foo*bar\]]:my_(url) 'title (with parens)'

[Foo*bar\]]


<!-- CASE cm-195 -->

[Foo bar]:
<my url>
'title'

[Foo bar]


<!-- CASE cm-196 -->

[foo]: /url '
title
line1
line2
'

[foo]


<!-- CASE cm-197 -->

[foo]: /url 'title

with blank line'

[foo]


<!-- CASE cm-198 -->

[foo]:
/url

[foo]


<!-- CASE cm-199 -->

[foo]:

[foo]


<!-- CASE cm-200 -->

[foo]: <>

[foo]


<!-- CASE cm-201 -->

[foo]: <bar>(baz)

[foo]


<!-- CASE cm-202 -->

[foo]: /url\bar\*baz "foo\"bar\baz"

[foo]


<!-- CASE cm-203 -->

[foo]

[foo]: url


<!-- CASE cm-204 -->

[foo]

[foo]: first
[foo]: second


<!-- CASE cm-205 -->

[FOO]: /url

[Foo]


<!-- CASE cm-206 -->

[ΑΓΩ]: /φου

[αγω]


<!-- CASE cm-207 -->

[foo]: /url


<!-- CASE cm-208 -->

[
foo
]: /url
bar


<!-- CASE cm-209 -->

[foo]: /url "title" ok


<!-- CASE cm-210 -->

[foo]: /url
"title" ok


<!-- CASE cm-211 -->

    [foo]: /url "title"

[foo]


<!-- CASE cm-212 -->

```
[foo]: /url
```

[foo]


<!-- CASE cm-213 -->

Foo
[bar]: /baz

[bar]


<!-- CASE cm-214 -->

# [Foo]
[foo]: /url
> bar


<!-- CASE cm-215 -->

[foo]: /url
bar
===
[foo]


<!-- CASE cm-216 -->

[foo]: /url
===
[foo]


<!-- CASE cm-217 -->

[foo]: /foo-url "foo"
[bar]: /bar-url
  "bar"
[baz]: /baz-url

[foo],
[bar],
[baz]


<!-- CASE cm-218 -->

[foo]

> [foo]: /url


<!-- CASE cm-219 -->

aaa

bbb


<!-- CASE cm-220 -->

aaa
bbb

ccc
ddd


<!-- CASE cm-221 -->

aaa


bbb


<!-- CASE cm-222 -->

  aaa
 bbb


<!-- CASE cm-223 -->

aaa
             bbb
                                       ccc


<!-- CASE cm-224 -->

   aaa
bbb


<!-- CASE cm-225 -->

    aaa
bbb


<!-- CASE cm-226 -->

aaa     
bbb     


<!-- CASE cm-227 -->

  

aaa
  

# aaa

  


<!-- CASE cm-228 -->

> # Foo
> bar
> baz


<!-- CASE cm-229 -->

># Foo
>bar
> baz


<!-- CASE cm-230 -->

   > # Foo
   > bar
 > baz


<!-- CASE cm-231 -->

    > # Foo
    > bar
    > baz


<!-- CASE cm-232 -->

> # Foo
> bar
baz


<!-- CASE cm-233 -->

> bar
baz
> foo


<!-- CASE cm-234 -->

> foo
---


<!-- CASE cm-235 -->

> - foo
- bar


<!-- CASE cm-236 -->

>     foo
    bar


<!-- CASE cm-237 -->

> ```
foo
```


<!-- CASE cm-238 -->

> foo
    - bar


<!-- CASE cm-239 -->

>


<!-- CASE cm-240 -->

>
>  
> 


<!-- CASE cm-241 -->

>
> foo
>  


<!-- CASE cm-242 -->

> foo

> bar


<!-- CASE cm-243 -->

> foo
> bar


<!-- CASE cm-244 -->

> foo
>
> bar


<!-- CASE cm-245 -->

foo
> bar


<!-- CASE cm-246 -->

> aaa
***
> bbb


<!-- CASE cm-247 -->

> bar
baz


<!-- CASE cm-248 -->

> bar

baz


<!-- CASE cm-249 -->

> bar
>
baz


<!-- CASE cm-250 -->

> > > foo
bar


<!-- CASE cm-251 -->

>>> foo
> bar
>>baz


<!-- CASE cm-252 -->

>     code

>    not code


<!-- CASE cm-253 -->

A paragraph
with two lines.

    indented code

> A block quote.


<!-- CASE cm-254 -->

1.  A paragraph
    with two lines.

        indented code

    > A block quote.


<!-- CASE cm-255 -->

- one

 two


<!-- CASE cm-256 -->

- one

  two


<!-- CASE cm-257 -->

 -    one

     two


<!-- CASE cm-258 -->

 -    one

      two


<!-- CASE cm-259 -->

   > > 1.  one
>>
>>     two


<!-- CASE cm-260 -->

>>- one
>>
  >  > two


<!-- CASE cm-261 -->

-one

2.two


<!-- CASE cm-262 -->

- foo


  bar


<!-- CASE cm-263 -->

1.  foo

    ```
    bar
    ```

    baz

    > bam


<!-- CASE cm-264 -->

- Foo

      bar


      baz


<!-- CASE cm-265 -->

123456789. ok


<!-- CASE cm-266 -->

1234567890. not ok


<!-- CASE cm-267 -->

0. ok


<!-- CASE cm-268 -->

003. ok


<!-- CASE cm-269 -->

-1. not ok


<!-- CASE cm-270 -->

- foo

      bar


<!-- CASE cm-271 -->

  10.  foo

           bar


<!-- CASE cm-272 -->

    indented code

paragraph

    more code


<!-- CASE cm-273 -->

1.     indented code

   paragraph

       more code


<!-- CASE cm-274 -->

1.      indented code

   paragraph

       more code


<!-- CASE cm-275 -->

   foo

bar


<!-- CASE cm-276 -->

-    foo

  bar


<!-- CASE cm-277 -->

-  foo

   bar


<!-- CASE cm-278 -->

-
  foo
-
  ```
  bar
  ```
-
      baz


<!-- CASE cm-279 -->

-   
  foo


<!-- CASE cm-280 -->

-

  foo


<!-- CASE cm-281 -->

- foo
-
- bar


<!-- CASE cm-282 -->

- foo
-   
- bar


<!-- CASE cm-283 -->

1. foo
2.
3. bar


<!-- CASE cm-284 -->

*


<!-- CASE cm-285 -->

foo
*

foo
1.


<!-- CASE cm-286 -->

 1.  A paragraph
     with two lines.

         indented code

     > A block quote.


<!-- CASE cm-287 -->

  1.  A paragraph
      with two lines.

          indented code

      > A block quote.


<!-- CASE cm-288 -->

   1.  A paragraph
       with two lines.

           indented code

       > A block quote.


<!-- CASE cm-289 -->

    1.  A paragraph
        with two lines.

            indented code

        > A block quote.


<!-- CASE cm-290 -->

  1.  A paragraph
with two lines.

          indented code

      > A block quote.


<!-- CASE cm-291 -->

  1.  A paragraph
    with two lines.


<!-- CASE cm-292 -->

> 1. > Blockquote
continued here.


<!-- CASE cm-293 -->

> 1. > Blockquote
> continued here.


<!-- CASE cm-294 -->

- foo
  - bar
    - baz
      - boo


<!-- CASE cm-295 -->

- foo
 - bar
  - baz
   - boo


<!-- CASE cm-296 -->

10) foo
    - bar


<!-- CASE cm-297 -->

10) foo
   - bar


<!-- CASE cm-298 -->

- - foo


<!-- CASE cm-299 -->

1. - 2. foo


<!-- CASE cm-300 -->

- # Foo
- Bar
  ---
  baz


<!-- CASE cm-301 -->

- foo
- bar
+ baz


<!-- CASE cm-302 -->

1. foo
2. bar
3) baz


<!-- CASE cm-303 -->

Foo
- bar
- baz


<!-- CASE cm-304 -->

The number of windows in my house is
14.  The number of doors is 6.


<!-- CASE cm-305 -->

The number of windows in my house is
1.  The number of doors is 6.


<!-- CASE cm-306 -->

- foo

- bar


- baz


<!-- CASE cm-307 -->

- foo
  - bar
    - baz


      bim


<!-- CASE cm-308 -->

- foo
- bar

<!-- -->

- baz
- bim


<!-- CASE cm-309 -->

-   foo

    notcode

-   foo

<!-- -->

    code


<!-- CASE cm-310 -->

- a
 - b
  - c
   - d
  - e
 - f
- g


<!-- CASE cm-311 -->

1. a

  2. b

   3. c


<!-- CASE cm-312 -->

- a
 - b
  - c
   - d
    - e


<!-- CASE cm-313 -->

1. a

  2. b

    3. c


<!-- CASE cm-314 -->

- a
- b

- c


<!-- CASE cm-315 -->

* a
*

* c


<!-- CASE cm-316 -->

- a
- b

  c
- d


<!-- CASE cm-317 -->

- a
- b

  [ref]: /url
- d


<!-- CASE cm-318 -->

- a
- ```
  b


  ```
- c


<!-- CASE cm-319 -->

- a
  - b

    c
- d


<!-- CASE cm-320 -->

* a
  > b
  >
* c


<!-- CASE cm-321 -->

- a
  > b
  ```
  c
  ```
- d


<!-- CASE cm-322 -->

- a


<!-- CASE cm-323 -->

- a
  - b


<!-- CASE cm-324 -->

1. ```
   foo
   ```

   bar


<!-- CASE cm-325 -->

* foo
  * bar

  baz


<!-- CASE cm-326 -->

- a
  - b
  - c

- d
  - e
  - f


<!-- CASE cm-327 -->

`hi`lo`


<!-- CASE cm-328 -->

`foo`


<!-- CASE cm-329 -->

`` foo ` bar ``


<!-- CASE cm-330 -->

` `` `


<!-- CASE cm-331 -->

`  ``  `


<!-- CASE cm-332 -->

` a`


<!-- CASE cm-333 -->

` b `


<!-- CASE cm-334 -->

` `
`  `


<!-- CASE cm-335 -->

``
foo
bar  
baz
``


<!-- CASE cm-336 -->

``
foo 
``


<!-- CASE cm-337 -->

`foo   bar 
baz`


<!-- CASE cm-338 -->

`foo\`bar`


<!-- CASE cm-339 -->

``foo`bar``


<!-- CASE cm-340 -->

` foo `` bar `


<!-- CASE cm-341 -->

*foo`*`


<!-- CASE cm-342 -->

[not a `link](/foo`)


<!-- CASE cm-343 -->

`<a href="`">`


<!-- CASE cm-344 -->

<a href="`">`


<!-- CASE cm-345 -->

`<https://foo.bar.`baz>`


<!-- CASE cm-346 -->

<https://foo.bar.`baz>`


<!-- CASE cm-347 -->

```foo``


<!-- CASE cm-348 -->

`foo


<!-- CASE cm-349 -->

`foo``bar``


<!-- CASE cm-350 -->

*foo bar*


<!-- CASE cm-351 -->

a * foo bar*


<!-- CASE cm-352 -->

a*"foo"*


<!-- CASE cm-353 -->

* a *


<!-- CASE cm-354 -->

*$*alpha.

*£*bravo.

*€*charlie.


<!-- CASE cm-355 -->

foo*bar*


<!-- CASE cm-356 -->

5*6*78


<!-- CASE cm-357 -->

_foo bar_


<!-- CASE cm-358 -->

_ foo bar_


<!-- CASE cm-359 -->

a_"foo"_


<!-- CASE cm-360 -->

foo_bar_


<!-- CASE cm-361 -->

5_6_78


<!-- CASE cm-362 -->

пристаням_стремятся_


<!-- CASE cm-363 -->

aa_"bb"_cc


<!-- CASE cm-364 -->

foo-_(bar)_


<!-- CASE cm-365 -->

_foo*


<!-- CASE cm-366 -->

*foo bar *


<!-- CASE cm-367 -->

*foo bar
*


<!-- CASE cm-368 -->

*(*foo)


<!-- CASE cm-369 -->

*(*foo*)*


<!-- CASE cm-370 -->

*foo*bar


<!-- CASE cm-371 -->

_foo bar _


<!-- CASE cm-372 -->

_(_foo)


<!-- CASE cm-373 -->

_(_foo_)_


<!-- CASE cm-374 -->

_foo_bar


<!-- CASE cm-375 -->

_пристаням_стремятся


<!-- CASE cm-376 -->

_foo_bar_baz_


<!-- CASE cm-377 -->

_(bar)_.


<!-- CASE cm-378 -->

**foo bar**


<!-- CASE cm-379 -->

** foo bar**


<!-- CASE cm-380 -->

a**"foo"**


<!-- CASE cm-381 -->

foo**bar**


<!-- CASE cm-382 -->

__foo bar__


<!-- CASE cm-383 -->

__ foo bar__


<!-- CASE cm-384 -->

__
foo bar__


<!-- CASE cm-385 -->

a__"foo"__


<!-- CASE cm-386 -->

foo__bar__


<!-- CASE cm-387 -->

5__6__78


<!-- CASE cm-388 -->

пристаням__стремятся__


<!-- CASE cm-389 -->

__foo, __bar__, baz__


<!-- CASE cm-390 -->

foo-__(bar)__


<!-- CASE cm-391 -->

**foo bar **


<!-- CASE cm-392 -->

**(**foo)


<!-- CASE cm-393 -->

*(**foo**)*


<!-- CASE cm-394 -->

**Gomphocarpus (*Gomphocarpus physocarpus*, syn.
*Asclepias physocarpa*)**


<!-- CASE cm-395 -->

**foo "*bar*" foo**


<!-- CASE cm-396 -->

**foo**bar


<!-- CASE cm-397 -->

__foo bar __


<!-- CASE cm-398 -->

__(__foo)


<!-- CASE cm-399 -->

_(__foo__)_


<!-- CASE cm-400 -->

__foo__bar


<!-- CASE cm-401 -->

__пристаням__стремятся


<!-- CASE cm-402 -->

__foo__bar__baz__


<!-- CASE cm-403 -->

__(bar)__.


<!-- CASE cm-404 -->

*foo [bar](/url)*


<!-- CASE cm-405 -->

*foo
bar*


<!-- CASE cm-406 -->

_foo __bar__ baz_


<!-- CASE cm-407 -->

_foo _bar_ baz_


<!-- CASE cm-408 -->

__foo_ bar_


<!-- CASE cm-409 -->

*foo *bar**


<!-- CASE cm-410 -->

*foo **bar** baz*


<!-- CASE cm-411 -->

*foo**bar**baz*


<!-- CASE cm-412 -->

*foo**bar*


<!-- CASE cm-413 -->

***foo** bar*


<!-- CASE cm-414 -->

*foo **bar***


<!-- CASE cm-415 -->

*foo**bar***


<!-- CASE cm-416 -->

foo***bar***baz


<!-- CASE cm-417 -->

foo******bar*********baz


<!-- CASE cm-418 -->

*foo **bar *baz* bim** bop*


<!-- CASE cm-419 -->

*foo [*bar*](/url)*


<!-- CASE cm-420 -->

** is not an empty emphasis


<!-- CASE cm-421 -->

**** is not an empty strong emphasis


<!-- CASE cm-422 -->

**foo [bar](/url)**


<!-- CASE cm-423 -->

**foo
bar**


<!-- CASE cm-424 -->

__foo _bar_ baz__


<!-- CASE cm-425 -->

__foo __bar__ baz__


<!-- CASE cm-426 -->

____foo__ bar__


<!-- CASE cm-427 -->

**foo **bar****


<!-- CASE cm-428 -->

**foo *bar* baz**


<!-- CASE cm-429 -->

**foo*bar*baz**


<!-- CASE cm-430 -->

***foo* bar**


<!-- CASE cm-431 -->

**foo *bar***


<!-- CASE cm-432 -->

**foo *bar **baz**
bim* bop**


<!-- CASE cm-433 -->

**foo [*bar*](/url)**


<!-- CASE cm-434 -->

__ is not an empty emphasis


<!-- CASE cm-435 -->

____ is not an empty strong emphasis


<!-- CASE cm-436 -->

foo ***


<!-- CASE cm-437 -->

foo *\**


<!-- CASE cm-438 -->

foo *_*


<!-- CASE cm-439 -->

foo *****


<!-- CASE cm-440 -->

foo **\***


<!-- CASE cm-441 -->

foo **_**


<!-- CASE cm-442 -->

**foo*


<!-- CASE cm-443 -->

*foo**


<!-- CASE cm-444 -->

***foo**


<!-- CASE cm-445 -->

****foo*


<!-- CASE cm-446 -->

**foo***


<!-- CASE cm-447 -->

*foo****


<!-- CASE cm-448 -->

foo ___


<!-- CASE cm-449 -->

foo _\__


<!-- CASE cm-450 -->

foo _*_


<!-- CASE cm-451 -->

foo _____


<!-- CASE cm-452 -->

foo __\___


<!-- CASE cm-453 -->

foo __*__


<!-- CASE cm-454 -->

__foo_


<!-- CASE cm-455 -->

_foo__


<!-- CASE cm-456 -->

___foo__


<!-- CASE cm-457 -->

____foo_


<!-- CASE cm-458 -->

__foo___


<!-- CASE cm-459 -->

_foo____


<!-- CASE cm-460 -->

**foo**


<!-- CASE cm-461 -->

*_foo_*


<!-- CASE cm-462 -->

__foo__


<!-- CASE cm-463 -->

_*foo*_


<!-- CASE cm-464 -->

****foo****


<!-- CASE cm-465 -->

____foo____


<!-- CASE cm-466 -->

******foo******


<!-- CASE cm-467 -->

***foo***


<!-- CASE cm-468 -->

_____foo_____


<!-- CASE cm-469 -->

*foo _bar* baz_


<!-- CASE cm-470 -->

*foo __bar *baz bim__ bam*


<!-- CASE cm-471 -->

**foo **bar baz**


<!-- CASE cm-472 -->

*foo *bar baz*


<!-- CASE cm-473 -->

*[bar*](/url)


<!-- CASE cm-474 -->

_foo [bar_](/url)


<!-- CASE cm-475 -->

*<img src="foo" title="*"/>


<!-- CASE cm-476 -->

**<a href="**">


<!-- CASE cm-477 -->

__<a href="__">


<!-- CASE cm-478 -->

*a `*`*


<!-- CASE cm-479 -->

_a `_`_


<!-- CASE cm-480 -->

**a<https://foo.bar/?q=**>


<!-- CASE cm-481 -->

__a<https://foo.bar/?q=__>


<!-- CASE cm-482 -->

[link](/uri "title")


<!-- CASE cm-483 -->

[link](/uri)


<!-- CASE cm-484 -->

[](./target.md)


<!-- CASE cm-485 -->

[link]()


<!-- CASE cm-486 -->

[link](<>)


<!-- CASE cm-487 -->

[]()


<!-- CASE cm-488 -->

[link](/my uri)


<!-- CASE cm-489 -->

[link](</my uri>)


<!-- CASE cm-490 -->

[link](foo
bar)


<!-- CASE cm-491 -->

[link](<foo
bar>)


<!-- CASE cm-492 -->

[a](<b)c>)


<!-- CASE cm-493 -->

[link](<foo\>)


<!-- CASE cm-494 -->

[a](<b)c
[a](<b)c>
[a](<b>c)


<!-- CASE cm-495 -->

[link](\(foo\))


<!-- CASE cm-496 -->

[link](foo(and(bar)))


<!-- CASE cm-497 -->

[link](foo(and(bar))


<!-- CASE cm-498 -->

[link](foo\(and\(bar\))


<!-- CASE cm-499 -->

[link](<foo(and(bar)>)


<!-- CASE cm-500 -->

[link](foo\)\:)


<!-- CASE cm-501 -->

[link](#fragment)

[link](https://example.com#fragment)

[link](https://example.com?foo=3#frag)


<!-- CASE cm-502 -->

[link](foo\bar)


<!-- CASE cm-503 -->

[link](foo%20b&auml;)


<!-- CASE cm-504 -->

[link]("title")


<!-- CASE cm-505 -->

[link](/url "title")
[link](/url 'title')
[link](/url (title))


<!-- CASE cm-506 -->

[link](/url "title \"&quot;")


<!-- CASE cm-507 -->

[link](/url "title")


<!-- CASE cm-508 -->

[link](/url "title "and" title")


<!-- CASE cm-509 -->

[link](/url 'title "and" title')


<!-- CASE cm-510 -->

[link](   /uri
  "title"  )


<!-- CASE cm-511 -->

[link] (/uri)


<!-- CASE cm-512 -->

[link [foo [bar]]](/uri)


<!-- CASE cm-513 -->

[link] bar](/uri)


<!-- CASE cm-514 -->

[link [bar](/uri)


<!-- CASE cm-515 -->

[link \[bar](/uri)


<!-- CASE cm-516 -->

[link *foo **bar** `#`*](/uri)


<!-- CASE cm-517 -->

[![moon](moon.jpg)](/uri)


<!-- CASE cm-518 -->

[foo [bar](/uri)](/uri)


<!-- CASE cm-519 -->

[foo *[bar [baz](/uri)](/uri)*](/uri)


<!-- CASE cm-520 -->

![[[foo](uri1)](uri2)](uri3)


<!-- CASE cm-521 -->

*[foo*](/uri)


<!-- CASE cm-522 -->

[foo *bar](baz*)


<!-- CASE cm-523 -->

*foo [bar* baz]


<!-- CASE cm-524 -->

[foo <bar attr="](baz)">


<!-- CASE cm-525 -->

[foo`](/uri)`


<!-- CASE cm-526 -->

[foo<https://example.com/?search=](uri)>


<!-- CASE cm-527 -->

[foo][bar]

[bar]: /url "title"


<!-- CASE cm-528 -->

[link [foo [bar]]][ref]

[ref]: /uri


<!-- CASE cm-529 -->

[link \[bar][ref]

[ref]: /uri


<!-- CASE cm-530 -->

[link *foo **bar** `#`*][ref]

[ref]: /uri


<!-- CASE cm-531 -->

[![moon](moon.jpg)][ref]

[ref]: /uri


<!-- CASE cm-532 -->

[foo [bar](/uri)][ref]

[ref]: /uri


<!-- CASE cm-533 -->

[foo *bar [baz][ref]*][ref]

[ref]: /uri


<!-- CASE cm-534 -->

*[foo*][ref]

[ref]: /uri


<!-- CASE cm-535 -->

[foo *bar][ref]*

[ref]: /uri


<!-- CASE cm-536 -->

[foo <bar attr="][ref]">

[ref]: /uri


<!-- CASE cm-537 -->

[foo`][ref]`

[ref]: /uri


<!-- CASE cm-538 -->

[foo<https://example.com/?search=][ref]>

[ref]: /uri


<!-- CASE cm-539 -->

[foo][BaR]

[bar]: /url "title"


<!-- CASE cm-540 -->

[ẞ]

[SS]: /url


<!-- CASE cm-541 -->

[Foo
  bar]: /url

[Baz][Foo bar]


<!-- CASE cm-542 -->

[foo] [bar]

[bar]: /url "title"


<!-- CASE cm-543 -->

[foo]
[bar]

[bar]: /url "title"


<!-- CASE cm-544 -->

[foo]: /url1

[foo]: /url2

[bar][foo]


<!-- CASE cm-545 -->

[bar][foo\!]

[foo!]: /url


<!-- CASE cm-546 -->

[foo][ref[]

[ref[]: /uri


<!-- CASE cm-547 -->

[foo][ref[bar]]

[ref[bar]]: /uri


<!-- CASE cm-548 -->

[[[foo]]]

[[[foo]]]: /url


<!-- CASE cm-549 -->

[foo][ref\[]

[ref\[]: /uri


<!-- CASE cm-550 -->

[bar\\]: /uri

[bar\\]


<!-- CASE cm-551 -->

[]

[]: /uri


<!-- CASE cm-552 -->

[
 ]

[
 ]: /uri


<!-- CASE cm-553 -->

[foo][]

[foo]: /url "title"


<!-- CASE cm-554 -->

[*foo* bar][]

[*foo* bar]: /url "title"


<!-- CASE cm-555 -->

[Foo][]

[foo]: /url "title"


<!-- CASE cm-556 -->

[foo] 
[]

[foo]: /url "title"


<!-- CASE cm-557 -->

[foo]

[foo]: /url "title"


<!-- CASE cm-558 -->

[*foo* bar]

[*foo* bar]: /url "title"


<!-- CASE cm-559 -->

[[*foo* bar]]

[*foo* bar]: /url "title"


<!-- CASE cm-560 -->

[[bar [foo]

[foo]: /url


<!-- CASE cm-561 -->

[Foo]

[foo]: /url "title"


<!-- CASE cm-562 -->

[foo] bar

[foo]: /url


<!-- CASE cm-563 -->

\[foo]

[foo]: /url "title"


<!-- CASE cm-564 -->

[foo*]: /url

*[foo*]


<!-- CASE cm-565 -->

[foo][bar]

[foo]: /url1
[bar]: /url2


<!-- CASE cm-566 -->

[foo][]

[foo]: /url1


<!-- CASE cm-567 -->

[foo]()

[foo]: /url1


<!-- CASE cm-568 -->

[foo](not a link)

[foo]: /url1


<!-- CASE cm-569 -->

[foo][bar][baz]

[baz]: /url


<!-- CASE cm-570 -->

[foo][bar][baz]

[baz]: /url1
[bar]: /url2


<!-- CASE cm-571 -->

[foo][bar][baz]

[baz]: /url1
[foo]: /url2


<!-- CASE cm-572 -->

![foo](/url "title")


<!-- CASE cm-573 -->

![foo *bar*]

[foo *bar*]: train.jpg "train & tracks"


<!-- CASE cm-574 -->

![foo ![bar](/url)](/url2)


<!-- CASE cm-575 -->

![foo [bar](/url)](/url2)


<!-- CASE cm-576 -->

![foo *bar*][]

[foo *bar*]: train.jpg "train & tracks"


<!-- CASE cm-577 -->

![foo *bar*][foobar]

[FOOBAR]: train.jpg "train & tracks"


<!-- CASE cm-578 -->

![foo](train.jpg)


<!-- CASE cm-579 -->

My ![foo bar](/path/to/train.jpg  "title"   )


<!-- CASE cm-580 -->

![foo](<url>)


<!-- CASE cm-581 -->

![](/url)


<!-- CASE cm-582 -->

![foo][bar]

[bar]: /url


<!-- CASE cm-583 -->

![foo][bar]

[BAR]: /url


<!-- CASE cm-584 -->

![foo][]

[foo]: /url "title"


<!-- CASE cm-585 -->

![*foo* bar][]

[*foo* bar]: /url "title"


<!-- CASE cm-586 -->

![Foo][]

[foo]: /url "title"


<!-- CASE cm-587 -->

![foo] 
[]

[foo]: /url "title"


<!-- CASE cm-588 -->

![foo]

[foo]: /url "title"


<!-- CASE cm-589 -->

![*foo* bar]

[*foo* bar]: /url "title"


<!-- CASE cm-590 -->

![[foo]]

[[foo]]: /url "title"


<!-- CASE cm-591 -->

![Foo]

[foo]: /url "title"


<!-- CASE cm-592 -->

!\[foo]

[foo]: /url "title"


<!-- CASE cm-593 -->

\![foo]

[foo]: /url "title"


<!-- CASE cm-594 -->

<http://foo.bar.baz>


<!-- CASE cm-595 -->

<https://foo.bar.baz/test?q=hello&id=22&boolean>


<!-- CASE cm-596 -->

<irc://foo.bar:2233/baz>


<!-- CASE cm-597 -->

<MAILTO:FOO@BAR.BAZ>


<!-- CASE cm-598 -->

<a+b+c:d>


<!-- CASE cm-599 -->

<made-up-scheme://foo,bar>


<!-- CASE cm-600 -->

<https://../>


<!-- CASE cm-601 -->

<localhost:5001/foo>


<!-- CASE cm-602 -->

<https://foo.bar/baz bim>


<!-- CASE cm-603 -->

<https://example.com/\[\>


<!-- CASE cm-604 -->

<foo@bar.example.com>


<!-- CASE cm-605 -->

<foo+special@Bar.baz-bar0.com>


<!-- CASE cm-606 -->

<foo\+@bar.example.com>


<!-- CASE cm-607 -->

<>


<!-- CASE cm-608 -->

< https://foo.bar >


<!-- CASE cm-609 -->

<m:abc>


<!-- CASE cm-610 -->

<foo.bar.baz>


<!-- CASE cm-611 -->

https://example.com


<!-- CASE cm-612 -->

foo@bar.example.com


<!-- CASE cm-613 -->

<a><bab><c2c>


<!-- CASE cm-614 -->

<a/><b2/>


<!-- CASE cm-615 -->

<a  /><b2
data="foo" >


<!-- CASE cm-616 -->

<a foo="bar" bam = 'baz <em>"</em>'
_boolean zoop:33=zoop:33 />


<!-- CASE cm-617 -->

Foo <responsive-image src="foo.jpg" />


<!-- CASE cm-618 -->

<33> <__>


<!-- CASE cm-619 -->

<a h*#ref="hi">


<!-- CASE cm-620 -->

<a href="hi'> <a href=hi'>


<!-- CASE cm-621 -->

< a><
foo><bar/ >
<foo bar=baz
bim!bop />


<!-- CASE cm-622 -->

<a href='bar'title=title>


<!-- CASE cm-623 -->

</a></foo >


<!-- CASE cm-624 -->

</a href="foo">


<!-- CASE cm-625 -->

foo <!-- this is a --
comment - with hyphens -->


<!-- CASE cm-626 -->

foo <!--> foo -->

foo <!---> foo -->


<!-- CASE cm-627 -->

foo <?php echo $a; ?>


<!-- CASE cm-628 -->

foo <!ELEMENT br EMPTY>


<!-- CASE cm-629 -->

foo <![CDATA[>&<]]>


<!-- CASE cm-630 -->

foo <a href="&ouml;">


<!-- CASE cm-631 -->

foo <a href="\*">


<!-- CASE cm-632 -->

<a href="\"">


<!-- CASE cm-633 -->

foo  
baz


<!-- CASE cm-634 -->

foo\
baz


<!-- CASE cm-635 -->

foo       
baz


<!-- CASE cm-636 -->

foo  
     bar


<!-- CASE cm-637 -->

foo\
     bar


<!-- CASE cm-638 -->

*foo  
bar*


<!-- CASE cm-639 -->

*foo\
bar*


<!-- CASE cm-640 -->

`code  
span`


<!-- CASE cm-641 -->

`code\
span`


<!-- CASE cm-642 -->

<a href="foo  
bar">


<!-- CASE cm-643 -->

<a href="foo\
bar">


<!-- CASE cm-644 -->

foo\


<!-- CASE cm-645 -->

foo  


<!-- CASE cm-646 -->

### foo\


<!-- CASE cm-647 -->

### foo  


<!-- CASE cm-648 -->

foo
baz


<!-- CASE cm-649 -->

foo 
 baz


<!-- CASE cm-650 -->

hello $.;'there


<!-- CASE cm-651 -->

Foo χρῆν


<!-- CASE cm-652 -->

Multiple     spaces
