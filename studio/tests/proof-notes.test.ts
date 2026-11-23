// Jakob's own word on the proofs (data/proof-notes.json): the register's rules (tools/proof-notes-register.ts), the store the
// lab server writes through (tools/proof-notes-store.ts), the main agent's tool (tools/proof-notes.ts) and what the online
// copy carries (tools/studio-freeze.ts pickNotes).
// Run from the repo root: node --test "studio/tests/proof-notes.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { NEW_REVISION, applyAgent, applyChange, cleanText, noteLine, readNotes, unreadNotes, validateChange } from "../../tools/proof-notes-register.ts";
import { proofNotesStore } from "../../tools/proof-notes-store.ts";
import { listing } from "../../tools/proof-notes.ts";
import { pickNotes } from "../../tools/studio-freeze.ts";

const T1 = "2026-11-18T00:10:00.000Z", T2 = "2026-11-18T00:20:00.000Z", T3 = "2026-11-18T00:30:00.000Z";
const note = (extra: Record<string, unknown> = {}) => ({ id: 1, proof: "kort-grepp", file: "a.mp4", choice: "bra", text: "", at: T1, ...extra });
const register = (notes: unknown[]) => ({ schemaVersion: 1, notes });

test("the register: his choice or text per place, nothing private, one note per place", () => {
  assert.equal(readNotes(register([note(), note({ id: 2, file: null, choice: null, text: "Hela provet är för mörkt" })])).notes.length, 2);
  const bad = (n: unknown, words: RegExp) => assert.throws(() => readNotes(register([n])), words);
  bad(note({ choice: "kanske" }), /choice/);
  bad(note({ choice: null, text: "  " }), /varken val eller text/);
  bad(note({ file: "../x.mp4" }), /file/);
  bad(note({ text: "se C:\\Users\\jakem\\film.mp4" }), /sökväg/);
  bad(note({ text: "jakob@example.com" }), /e-post/);
  bad(note({ extra: 1 }), /okända fält/);
  bad(note({ answer: { text: "", at: T2 } }), /tom/);
  assert.throws(() => readNotes(register([note(), note({ id: 2 })])), /två poster/);
  assert.throws(() => readNotes(register([note(), note({ file: "b.mp4" })])), /två gånger/);
});

test("his word from the page: a choice, a text, or both empty to take it away", () => {
  assert.deepEqual(validateChange({ proof: "x", file: "a.mp4", choice: "inte-bra", text: "  för  mörk \n\n\n\n kanten " }), { choice: "inte-bra", text: "för mörk\n\nkanten" });
  assert.deepEqual(validateChange({ proof: "x", file: null, choice: null }), { choice: null, text: "" });
  assert.throws(() => validateChange({ proof: "x", file: null, choice: "ja" }), /Valet/);
  assert.throws(() => validateChange({ proof: "x", file: null, choice: null, text: "x".repeat(1001) }), /högst/);
  assert.throws(() => validateChange({ proof: "x", file: null, choice: null, text: "D:/dealer-scratch/tmp" }), /sökväg/);
  assert.throws(() => validateChange({ proof: "x", file: null, by: "huvudagent" }), /bara innehålla/);
  assert.equal(cleanText("a\r\nb"), "a\nb");
});

test("a change of his: a new id, read taken away, the answer kept; empty takes the note out", () => {
  const raw = register([note({ id: 4, answer: { text: "Ja, den görs om.", at: T2 }, read: T2 })]) as never;
  const changed = applyChange(raw, { proof: "kort-grepp", file: "a.mp4" }, { choice: "inte-bra", text: "ändå för mörk" }, T3);
  assert.deepEqual(changed.note, { id: 4, proof: "kort-grepp", file: "a.mp4", choice: "inte-bra", text: "ändå för mörk", at: T3, answer: { text: "Ja, den görs om.", at: T2 } });
  const added = applyChange(changed.raw, { proof: "kort-grepp", file: null }, { choice: "bra", text: "" }, T3);
  assert.equal((added.note as { id: number }).id, 5);
  const removed = applyChange(added.raw, { proof: "kort-grepp", file: "a.mp4" }, { choice: null, text: "" }, T3);
  assert.equal(removed.note, null);
  assert.deepEqual(removed.raw.notes.map((n) => n.id), [5]);
});

test("the main agent: an answer marks read; read alone keeps the answer; unread newest first", () => {
  const raw = register([note({ id: 1, at: T1 }), note({ id: 2, file: "b.mp4", at: T3 }), note({ id: 3, file: "c.mp4", at: T2 })]) as never;
  const answered = applyAgent(raw, 2, { answer: "Tack, den  tas bort.", read: T3 });
  assert.deepEqual(answered.notes[1], { ...note({ id: 2, file: "b.mp4", at: T3 }), answer: { text: "Tack, den tas bort.", at: T3 }, read: T3 });
  const read = applyAgent(answered, 2, { read: T3 });
  assert.deepEqual(read.notes[1].answer, { text: "Tack, den tas bort.", at: T3 });
  assert.deepEqual(unreadNotes(readNotes(read)).map((n) => n.id), [3, 1]);
  assert.throws(() => applyAgent(raw, 9, { read: T3 }), /ingen anteckning 9/);
  assert.throws(() => applyAgent(raw, 1, { answer: " ", read: T3 }), /tomt/);
  // one line per note that names it, its place, his choice and words and the time, however it is laid out
  const line = (extra: Record<string, unknown>) => noteLine(readNotes(register([note(extra)])).notes[0]);
  const said = line({ text: "för\nmörk", choice: "inte-bra" });
  assert.ok(!said.includes("\n"), said);
  for (const part of ["#1", "kort-grepp", "a.mp4", "för", "mörk", "2026-11-18", "00:10"]) assert.ok(said.includes(part), `${part}: ${said}`);
  assert.notEqual(said, line({ text: "för\nmörk", choice: "bra" }), "his choice shows");
});

test("the store: only against the revision he read; a conflict is refused; the tool answers and marks read", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "proof-notes-"));
  try {
    let clock = 0;
    const store = proofNotesStore(root, () => [T1, T2, T3, T3, T3, T3][clock++]);
    assert.deepEqual((await store.answer()).notes, []);
    await assert.rejects(store.save({ proof: "kort-grepp", file: "a.mp4", choice: "bra" }, undefined), /Läs orden/);
    const first = await store.save({ proof: "kort-grepp", file: "a.mp4", choice: "bra", text: "" }, NEW_REVISION);
    assert.equal(first.note?.id, 1);
    await assert.rejects(store.save({ proof: "kort-grepp", file: "a.mp4", choice: "inte-bra", text: "" }, NEW_REVISION), /ändrats/);
    const listed = await store.answer();
    assert.equal(listed.notes[0].revision, first.note?.revision);
    await store.answerNote(1, "Den används i rundan.");
    const second = await store.save({ proof: "kort-grepp", file: "a.mp4", choice: "bra", text: "Fin vändning" }, (await store.answer()).notes[0].revision);
    assert.equal(second.note?.read, undefined, "his change is read again");
    assert.equal(second.note?.answer?.text, "Den används i rundan.");
    await store.markRead(1);
    const text = await readFile(path.join(root, "data", "proof-notes.json"), "utf8");
    assert.ok(text.endsWith("\n") && text.includes('\n  "notes": ['));
    assert.deepEqual(Object.keys(JSON.parse(text).notes[0]), ["id", "proof", "file", "choice", "text", "at", "answer", "read"]);
    const gone = await store.save({ proof: "kort-grepp", file: "a.mp4", choice: null, text: "" }, (await store.answer()).notes[0].revision);
    assert.equal(gone.note, null);
    await writeFile(path.join(root, "data", "proof-notes.json"), "{");
    await assert.rejects(store.answer(), /inte giltig JSON/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the tool lists, answers and marks read, and never writes his word", () => {
  const notes = readNotes(register([note({ id: 2, at: T2, text: "mörk" }), note({ id: 1, file: null, answer: { text: "Svar", at: T3 }, read: T3 })])).notes;
  const unread = unreadNotes({ schemaVersion: 1, notes });
  assert.ok(listing(unread, false).startsWith(noteLine(unread[0])), "the unread, each on its own line");
  const nothing = listing([], false);
  assert.ok(nothing.trim() && !nothing.includes("#"), "nothing new says so, in a line of its own");
  assert.ok(listing(notes, true).includes("Svar") && !listing(notes, false).includes("Svar"), "the full list carries the answer");
  const source = readFileSync(new URL("../../tools/proof-notes.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\.save\(|applyChange/, "the tool has no way to write as him");
});

test("the copy carries his word on the proofs and files that go up, without the read mark", () => {
  const answer = { notes: [note({ revision: '"r"', read: T2 }), note({ id: 2, file: "hemlig.mp4" }), note({ id: 3, file: null }), note({ id: 4, proof: "annat" })] };
  const picked = pickNotes(answer, [{ id: "kort-grepp", files: [{ name: "a.mp4", path: "", kind: "video", bytes: 1 }] }]);
  assert.deepEqual(picked.notes.map((n) => n.id), [1, 3]);
  assert.equal("read" in picked.notes[0] || "revision" in picked.notes[0], false);
});
