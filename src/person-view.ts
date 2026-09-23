import type { Node as PMNode } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";
import { personId } from "./person";
import { allPeople, peopleChanged, requestPeople } from "./people-client";

export class PersonMentionView implements NodeView {
  dom = document.createElement("span");
  private events = new AbortController();
  constructor(private node: PMNode) {
    this.dom.contentEditable = "false";
    this.dom.className = "pm-mention pm-person-mention";
    this.dom.tabIndex = 0;
    this.dom.setAttribute("role", "button");
    this.dom.setAttribute("aria-haspopup", "dialog");
    this.dom.dataset.mentionKind = "user";
    const open = () => requestPeople({ selectedId: personId(this.node.attrs.nfmAttrs.url)! });
    this.dom.onclick = event => { event.preventDefault(); open(); };
    this.dom.onkeydown = event => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); open(); }
    };
    document.addEventListener(peopleChanged, () => this.render(), { signal: this.events.signal });
    this.render();
  }
  private render() {
    const id = personId(this.node.attrs.nfmAttrs.url)!;
    const person = allPeople().find(person => person.id === id);
    this.dom.dataset.personId = id;
    this.dom.classList.toggle("person-deleted", !!person?.deleted);
    this.dom.textContent = `@${person?.name || this.node.attrs.label || "Unknown person"}`;
    this.dom.title = person ? `${person.name}${person.deleted ? " · Deleted contact" : person.organization ? ` · ${person.organization}` : " · Local contact"}` : "Contact unavailable · Saved name preserved";
    this.dom.setAttribute("aria-label", this.dom.title);
  }
  update(node: PMNode) {
    if (node.type !== this.node.type || node.attrs.kind !== "user" || !personId(node.attrs.nfmAttrs.url)) return false;
    this.node = node;
    this.render();
    return true;
  }
  stopEvent(event: Event) { return ["mousedown", "click", "dblclick", "keydown"].includes(event.type); }
  ignoreMutation() { return true; }
  destroy() { this.events.abort(); }
}
