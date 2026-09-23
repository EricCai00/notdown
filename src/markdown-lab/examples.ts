export const markdownExample = `# Let your words grow

One Markdown document, two views. Write on the left and see your ideas take shape on the right.

> Source is the starting point; the page is another way to express it.

## 01 · Start with simple words

Use **bold** for emphasis, *italics* for tone, and ~~strikethrough~~ to mark changes.
You can also add [a link](https://pandoc.org), or a little \`inline code\`.

### What would you like to do today?

- [x] Open a workspace for your words
- [x] Scroll source and page together
- [ ] Try a different Markdown dialect
  - Open Extensions and plugins to adjust your syntax
  - The same source can be interpreted in different ways

## 02 · Organize your information

| Dialect | Best for | Rendering engine |
| :--- | :--- | :--- |
| GFM | Everyday notes and technical documentation | Pandoc |
| Pandoc Markdown | Footnotes, definition lists, and long documents | Pandoc |
| Notion-flavored Markdown | Columns, callouts, and nested blocks | Notdown |

Dialects define syntax; extensions add features. Changing settings updates the preview without rewriting the source.

## 03 · Express ideas precisely

Inline math fits naturally: $E = mc^2$.

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

Code has its own structure:

\`\`\`javascript
const idea = {
  source: "Markdown",
  possibilities: Infinity,
};

function grow(note) {
  return { ...note, ready: true };
}

console.log(grow(idea));
\`\`\`

## 04 · Add optional block features

The bookmark card below comes from a separate block plugin. Disable Bookmark card to see the full code block.

[Pandoc](https://pandoc.org)

## 05 · Make room for further reading

Footnotes give extra details their own place.[^note]

[^note]: Extension defaults come from your local Pandoc. Toggle them individually in the settings panel.

---

Start writing on the left.
`;

export const notionExample = `# One page, many possibilities
This is the **Notion-flavored Markdown** dialect. Adjacent plain lines are separate blocks; tabs indicate child blocks.
<callout icon="💡">
	Choosing a dialect changes interpretation without rewriting the source.
</callout>

## Bring ideas together
<columns>
	<column>
		### Thinking it through
		Break complex things into simple steps.
		- [x] Preserve the source
		- [ ] Write down the next idea
	</column>
	<column>
		### Worth remembering
		Every block has its place.
		> Structure supports expression.
	</column>
</columns>

## Hierarchy and toggles
A parent block
	This is its child block
		This is a more deeply nested idea
<details>
<summary>Expand for details</summary>
	The source preserves all content.<br>This is the second line in the same block.
</details>

## Equations and tables
Inline math $E = mc^2$.
| Item | Status |
| --- | --- |
| Columns | Visible |
| Callout | Visible |

## Links
[Pandoc](https://pandoc.org)

## The original source is still here
<future-block custom="keep">Unrecognized structure; source preserved.</future-block>
`;
