import { editorKind } from "./node-identity";
import type { Node as PMNode } from "prosemirror-model";

export const listItemNames = ["bullet_list_item", "numbered_list_item", "task_list_item", "example_list_item"] as const;
export const isListItem = (node: PMNode | null | undefined): boolean =>
  !!node && listItemNames.some((name) => name === editorKind(node));
