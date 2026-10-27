import { escapeXml } from "../../document/notion-syntax";

/** A local address-book entry, not a login, workspace member, or permission. */
export interface Person {
  notionUserId?: string;
  id: string;
  name: string;
  email: string;
  phone: string;
  organization: string;
  notes: string;
  deleted: boolean;
  created: string;
  updated: string;
  revision: string;
}
export type PersonInput = Partial<Pick<Person, "name" | "email" | "phone" | "organization" | "notes" | "deleted" | "notionUserId">>;
export const personFields = ["name", "email", "phone", "organization", "notes"] as const;
export function personId(url: unknown): string | null {
  if (typeof url !== "string") return null;
  return /^person:\/\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,127})$/.exec(url)?.[1] ?? null;
}
export function personMention(person: Pick<Person, "id" | "name">): string {
  return `<mention-user url="person://${escapeXml(person.id)}">${escapeXml(person.name)}</mention-user>`;
}
export function searchPeople(people: Person[], query: string, deleted = false): Person[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return people.filter(person => person.deleted === deleted && terms.every(term =>
    personFields.some(field => person[field].toLocaleLowerCase().includes(term)),
  )).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}
export function personInitials(name: string): string {
  return Array.from(name.trim()).slice(0, 1).join("").toLocaleUpperCase() || "?";
}
