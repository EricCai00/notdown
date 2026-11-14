import type { DatabaseProperty } from "./database-model";
import "./database-properties.css";

/** Status has a dot and pill shape; Select retains its rectangular tag. */
export function databaseOptionTag(option: { name: string; color?: string }, type: DatabaseProperty["type"]) {
  const tag = document.createElement("span");
  tag.className = "database-tag";
  tag.classList.toggle("database-status-tag", type === "status");
  tag.dataset.color = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"].includes(option.color ?? "") ? option.color : "gray";
  tag.textContent = option.name;
  return tag;
}
