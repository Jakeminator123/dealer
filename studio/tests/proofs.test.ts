// The proof room's reading of /api/proofs (studio/lib/proofs.ts), on proofs made here.
// Run from the repo root: node --test "studio/tests/proofs.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Proof } from "../lib/api.ts";
import { chapterAt, chaptersOf, countLine, coverOf, formatBytes, matchProof, pickFile, proofFiles, proofTitle, sortProofs, unwrap, verdictTally } from "../lib/proofs.ts";

const file = (name: string, bytes = 1258291) => ({ name, path: `assets/proofs/x/${name}`, kind: (name.endsWith(".mp4") ? "video" : "image") as "video" | "image", bytes });
const proof = (extra: Partial<Proof> = {}): Proof => ({ id: "x", title: null, description: null, labels: null, verdicts: null, updatedAt: null, chapters: null, fps: 30, files: [], ...extra });

test("newest first, and the title falls back to the folder", () => {
  const list = [proof({ id: "b", updatedAt: 10 }), proof({ id: "a", updatedAt: 30 }), proof({ id: "c", updatedAt: null }), proof({ id: "d", updatedAt: 30 })];
  assert.deepEqual(sortProofs(list).map((p) => p.id), ["a", "d", "b", "c"]);
  assert.equal(proofTitle(proof({ id: "v6-referens", title: null })), "v6-referens");
  assert.equal(proofTitle(proof({ id: "v6", title: "  V6 mätt  " })), "V6 mätt");
});

test("search: every word, in title, folder, description or a label, without accents", () => {
  const p = proof({ id: "v6-referens", title: "V6 mätt som referens", description: "Vändningen är ett pålagt bildbyte.", labels: { "a.png": "Handbyte (bildens högra)" } });
  assert.ok(matchProof(p, ""));
  assert.ok(matchProof(p, "  "));
  assert.ok(matchProof(p, "matt"));
  assert.ok(matchProof(p, "V6 vandningen"));
  assert.ok(matchProof(p, "referens handbyte"));
  assert.ok(matchProof(p, "HÖGRA"));
  assert.ok(!matchProof(p, "v6 skog"));
});

test("files: films in the order the labels name them, short names, verdicts", () => {
  const p = proof({
    labels: { "jamforelse.mp4": "Jämförelse · råfilm | B1 | B2", "ra.mp4": "Råfilm (utan kort)", "b.png": "Kontaktark: en bild varannan sekund" },
    verdicts: { "ra.mp4": "failed", "b.png": "ok" },
    files: [file("ra.mp4"), file("extra.mp4"), file("jamforelse.mp4"), file("a.png"), file("b.png")],
  });
  const { films, pictures } = proofFiles(p);
  assert.deepEqual(films.map((f) => f.file.name), ["jamforelse.mp4", "ra.mp4", "extra.mp4"]);
  assert.deepEqual(pictures.map((f) => f.file.name), ["a.png", "b.png"]);
  assert.equal(films[1].name, "Råfilm (utan kort)"); // cut only at 8 characters or more
  assert.equal(films[1].verdict, "failed");
  assert.equal(films[2].name, "extra"); // no label: the file name in words
  assert.equal(pictures[1].name, "Kontaktark");
  assert.equal(pictures[1].rest, "en bild varannan sekund");
  assert.equal(pictures[1].verdict, "ok");
  assert.equal(pictures[0].verdict, null);
  assert.equal(countLine(p), "3 filmer · 2 bilder");
  assert.equal(countLine(proof({ files: [file("a.png")] })), "1 bild");
  assert.equal(countLine(proof({ files: [file("a.mp4")] })), "1 film");
  assert.equal(countLine(proof()), "Inga filer");
  assert.deepEqual(verdictTally(p), { ok: 1, remarks: 0, failed: 1, unreviewed: 0 });
});

test("the card's picture: the first picture, else a second into the first film", () => {
  assert.deepEqual(coverOf(proof({ files: [file("f.mp4"), file("z.png"), file("y.png")] })), { kind: "image", path: "assets/proofs/x/z.png" });
  assert.deepEqual(coverOf(proof({ fps: 24, labels: { "b.mp4": "B", "a.mp4": "A" }, files: [file("a.mp4"), file("b.mp4")] })), { kind: "video", path: "assets/proofs/x/b.mp4", frame: 24 });
  assert.equal(coverOf(proof()), null);
});

test("chapters: valid ones in order, within the film, and the one a frame is in", () => {
  const p = proof({ chapters: [{ label: "Vila", frame: 268 }, { label: "Entré", frame: 2 }, { label: "Fel", frame: -1 }, { label: "Sent", frame: 5000 }] });
  assert.deepEqual(chaptersOf(p).map((c) => c.label), ["Entré", "Vila", "Sent"]);
  const within = chaptersOf(p, 2700);
  assert.deepEqual(within.map((c) => c.label), ["Entré", "Vila"]);
  assert.equal(chapterAt(within, 0), null);
  assert.equal(chapterAt(within, 2)?.label, "Entré");
  assert.equal(chapterAt(within, 267)?.label, "Entré");
  assert.equal(chapterAt(within, 268)?.label, "Vila");
  assert.deepEqual(chaptersOf(proof()), []);
});

test("the rest of a label loses only the parentheses around all of it", () => {
  assert.equal(unwrap("(exakt, 4 s)"), "exakt, 4 s");
  assert.equal(unwrap("(a) och (b)"), "(a) och (b)");
  assert.equal(unwrap("(V6 161/123×66 px (bredd ×1,86))"), "V6 161/123×66 px (bredd ×1,86)");
  assert.equal(unwrap("en bild varannan sekund"), "en bild varannan sekund");
  assert.equal(unwrap(""), "");
  const p = proof({ labels: { "a.png": "Handbyte (hennes vänstra hand tar)" }, files: [file("a.png")] });
  assert.equal(proofFiles(p).pictures[0].rest, "hennes vänstra hand tar");
});

test("bytes, and what ?fil= names", () => {
  assert.equal(formatBytes(1258291), "1,2 MB");
  assert.equal(formatBytes(64806), "63 kB");
  assert.equal(formatBytes(10), "1 kB");
  const files = proofFiles(proof({ files: [file("a.mp4"), file("b.mp4"), file("z.png"), file("c.png")] }));
  assert.equal(pickFile(files, null).film?.file.name, "a.mp4");
  assert.equal(pickFile(files, null).index, null);
  assert.equal(pickFile(files, "b.mp4").film, files.films[1]); // the room's own entry, so it can be compared
  assert.equal(pickFile(files, "c.png").picture, files.pictures[1]);
  assert.equal(pickFile(files, "c.png").index, 1);
  assert.equal(pickFile(files, "c.png").film?.file.name, "a.mp4");
  assert.equal(pickFile(files, "nope.mp4").film?.file.name, "a.mp4");
  assert.equal(pickFile(proofFiles(proof({ files: [file("c.png")] })), null).film, null);
});
