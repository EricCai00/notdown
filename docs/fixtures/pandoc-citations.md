---
lang: en-US
link-citations: true
reference-section-title: References
references:
  - id: doe99
    type: book
    title: Example Book
    author:
      - family: Doe
        given: Jane
    issued:
      date-parts: [[1999]]
  - id: smith04
    type: book
    title: Later Research
    author:
      - family: Smith
        given: John
    issued:
      date-parts: [[2004]]
---

# Citation examples

Single: [@doe99]. Multiple: [@doe99; @smith04].

Prefix, locator and suffix: [see @doe99, pp. 33-35 and *passim*; @smith04, chap. 1].

Complex locator: [@smith04{ii, A, D-Z}, with a suffix].

Forced locator: [@smith04, {pp. iv, vi-xi, (xv)-(xvii)} with suffix here].

Suffix without a locator: [@smith04{}, 99 years later].

@smith04 discusses this. @smith04 [p. 33] adds details.

Smith supports this [-@smith04].

An explanation.[^discussion]

[^discussion]: Normal citation [@doe99]. Author-in-text citation @smith04.

# New chapter {.reset-citation-positions}

Repeated source: [@doe99].

Literal code: `[@doe99]` and `@smith04`.
