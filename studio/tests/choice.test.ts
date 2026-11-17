// Material's choice of a picture by hand (components/material/choice.ts) and Karta's marks on a take built on a picture that
// no longer holds (components/map/marks.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { changeLines } from "../components/material/choice.ts";
import { marksFrom } from "../components/map/marks.ts";
import type { Entry } from "../lib/media.ts";

const anchor = (id: string, state: Entry["state"], node = "IDLE"): Pick<Entry, "id" | "role" | "node" | "card" | "state" | "name"> => ({ id, role: "ankare-1", node, state, name: id });

test("making a picture hold names what is set aside and how many clips become marked as older", () => {
  const now = anchor("paow-vila-ung-2", "gäller"), next = anchor("paow-vila-tatuerad", "kandidat"), other = anchor("paow-nyp", "gäller", "READY");
  const lineage = { a: { first: "paow-vila-ung-2", last: "paow-nyp" }, b: { first: "paow-vila-ung-2", last: null }, c: { first: "paow-nyp", last: null } };
  const said = changeLines(next, "gäller", [now, next, other], lineage);
  assert.deepEqual(said.aside, ["paow-vila-ung-2"]);
  assert.equal(said.lines[1], "2 klipp är byggda på den bild som gäller nu och blir markerade som äldre. De spelas som förut tills du väljer annat.");
  assert.equal(changeLines(next, "gäller", [next], {}).lines[1], "Inga klipp är byggda på de andra bilderna här; inget blir markerat.");
});

test("Arkivera says it is not a deletion and can be taken back; archiving what holds leaves the role without one", () => {
  assert.deepEqual(changeLines(anchor("x", "kandidat"), "arkiverad", [], {}).lines, ["Den tas ur listorna men raderas inte. Ta tillbaka gör den till kandidat igen."]);
  assert.equal(changeLines(anchor("x", "gäller"), "arkiverad", [], {}).lines[1], "Rollen har sedan ingen bild som gäller.");
  assert.deepEqual(changeLines(anchor("x", "arkiverad"), "kandidat", [], {}).lines, ["Den kommer tillbaka som kandidat."]);
});

test("Karta marks a take on a picture another holds now, and links to that picture in Material for its dealer", () => {
  const answer = { dealers: [{ id: "paow", entries: [anchor("paow-vila-ung-2", "ersatt"), anchor("paow-vila-tatuerad", "gäller")] }], lineage: { t1: { first: "paow-vila-ung-2", last: null }, t2: { first: "paow-vila-tatuerad", last: null } } };
  const [m] = marksFrom(answer, "t1");
  assert.equal(m.chip, "äldre ankare 1");
  assert.equal(m.href, "/material/?bild=paow-vila-ung-2&dealer=paow");
  assert.match(m.title, /paow-vila-tatuerad gäller nu/);
  assert.deepEqual(marksFrom(answer, "t2"), [], "built on what holds");
  assert.deepEqual(marksFrom(null, "t1"), [], "no media answer (the online copy): nothing");
});
