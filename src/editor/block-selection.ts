import type { NodeViewConstructor } from "prosemirror-view";

/** NodeViews own their content classes; ProseMirror owns decoration classes.
 * A render that replaces className must not erase an unchanged decoration:
 * ProseMirror only patches outer decorations when their values change. */
export function preserveSelectionDecorations(
  constructors: Record<string, NodeViewConstructor>,
): Record<string, NodeViewConstructor> {
  return Object.fromEntries(Object.entries(constructors).map(([name, create]) => [name,
    ((...args) => {
      const nodeView = create(...args);
      const update = nodeView.update;
      if (update) nodeView.update = (...updateArgs) => {
        const classes = nodeView.dom instanceof Element
          ? ["pm-block-selected", "ProseMirror-selectednode"].filter(name => nodeView.dom instanceof Element && nodeView.dom.classList.contains(name))
          : [];
        const accepted = update.apply(nodeView, updateArgs);
        if (accepted && nodeView.dom instanceof Element) nodeView.dom.classList.add(...classes);
        return accepted;
      };
      return nodeView;
    }) satisfies NodeViewConstructor,
  ]));
}
