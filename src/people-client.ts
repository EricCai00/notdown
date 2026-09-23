import { api } from "./types";
import type { Person, PersonInput } from "./person";

let people: Person[] = [];
let epoch = 0;
let loading: Promise<void> | undefined;
export const peopleChanged = "notdown-people-changed";
export const openPeopleEvent = "notdown-open-people";
export const allPeople = () => people;
export function refreshPeople(): Promise<void> {
  if (loading) return loading;
  const started = epoch;
  loading = api<Person[]>("/people?includeDeleted=true").then(result => {
    if (started !== epoch) return;
    if (JSON.stringify(people) === JSON.stringify(result)) return;
    people = result;
    document.dispatchEvent(new Event(peopleChanged));
  }).finally(() => { loading = undefined; });
  return loading;
}
export async function savePerson(input: PersonInput, original?: Person): Promise<Person> {
  const saved = await api<Person>(original ? `/people/${encodeURIComponent(original.id)}` : "/people", {
    method: original ? "PUT" : "POST",
    body: JSON.stringify({ ...input, ...(original ? { baseRevision: original.revision } : {}) }),
  });
  epoch++;
  people = [...people.filter(person => person.id !== saved.id), saved];
  document.dispatchEvent(new Event(peopleChanged));
  return saved;
}
export function requestPeople(detail: { selectedId?: string; onSelect?: (person: Person) => void } = {}) {
  document.dispatchEvent(new CustomEvent(openPeopleEvent, { detail }));
}
