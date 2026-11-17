// The studio's one table of words (studio/lib/words.ts): names.ts agrees with it, every entry has its shape and leads from
// each of its names to itself alone, Jakob's own words find their entry, the bot's guide carries the table, and nothing in it
// would stop the copy. Run from the repo root: node --test "studio/tests/words.test.ts"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ANCHOR_WORDS, WORDS, WORD_GROUPS, findWords, type Word } from "../lib/words.ts";
import { edgeName, nodeCode, nodeName } from "../lib/names.ts";
import { WORDS as GUIDE_WORDS } from "../lib/guide.ts";

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
const namesOf = (w: Word) => [w.ord, ...w.sager, ...w.aven];

test("names.ts writes the anchors as the table does, and its answers are unchanged", () => {
  for (const [node, w] of Object.entries(ANCHOR_WORDS)) {
    assert.equal(nodeCode(node), w.code);
    assert.equal(nodeName(node), w.name);
  }
  assert.equal(edgeName("READY>P4.C1"), "A2.1 → P4C1");
  assert.equal(nodeName("READY-B"), "A2.2 hand över");
  assert.equal(nodeCode("P4.C1"), "P4C1");
});

test("every entry has a word, one meaning line, a group, and lists of names without empty ones", () => {
  assert.ok(WORDS.length >= 80);
  for (const w of WORDS) {
    assert.ok(w.ord.trim() && w.ord === w.ord.trim(), JSON.stringify(w));
    assert.ok(w.betyder.length > 10 && w.betyder.length <= 300 && !w.betyder.includes("\n"), w.ord);
    assert.ok(WORD_GROUPS.includes(w.grupp), w.ord);
    for (const list of [w.sager, w.aven]) {
      assert.ok(Array.isArray(list), w.ord);
      for (const name of list) assert.ok(typeof name === "string" && name.trim() && name === name.trim(), `${w.ord}: "${name}"`);
    }
  }
  for (const group of WORD_GROUPS) assert.ok(WORDS.some((w) => w.grupp === group), group);
  // Plain words for people: the studio's word for an edge is "Steg", and "kant" is only one of its other names.
  assert.ok(!WORDS.some((w) => /\bkant\b/i.test(w.ord)));
  assert.ok(WORDS.find((w) => w.ord === "Steg")!.aven.includes("kant"));
});

test("no word stands twice, and every Säger också word belongs to one entry only", () => {
  assert.equal(new Set(WORDS.map((w) => fold(w.ord))).size, WORDS.length);
  const sager = WORDS.flatMap((w) => w.sager.map((s) => [fold(s), w.ord] as const));
  const seen = new Map<string, string>();
  for (const [s, ord] of sager) {
    assert.ok(!seen.has(s), `"${s}" står under både ${seen.get(s)} och ${ord}`);
    seen.set(s, ord);
  }
});

test("every name, in any field, leads to one entry only", () => {
  const owner = new Map<string, string>();
  for (const w of WORDS) {
    for (const name of namesOf(w)) {
      const key = fold(name);
      assert.ok(!owner.has(key), `"${name}" står under både ${owner.get(key)} och ${w.ord}`);
      owner.set(key, w.ord);
    }
  }
});

test("a search finds the studio's word from an older name, the word itself first", () => {
  assert.equal(findWords("kant")[0].ord, "Steg");
  assert.equal(findWords("Keystone 1")[0].ord, "A1 vila");
  assert.equal(findWords("READY-B")[0].ord, "A2.2 släp");
  assert.equal(findWords("REDO B")[0].ord, "A2.2 släp");
  assert.equal(findWords("vilan")[0].ord, "Vilan");
  assert.equal(findWords("platt")[0].ord, "Inte 3D", "marks do not matter: plätt and platt are one");
  assert.equal(findWords("xyzzy").length, 0);
  assert.equal(findWords("  ").length, WORDS.length);
  // An exact name goes before a word that only contains it: "lipsynk" is Lipsync, then Realtidslipsynk.
  assert.deepEqual(findWords("lipsynk").slice(0, 2).map((w) => w.ord), ["Lipsync", "Realtidslipsynk"]);
  assert.equal(findWords("hålkortet")[0].ord, "Dealerns kort");
  // Every anchor's name as the views write it today leads to its entry.
  for (const [node, w] of Object.entries(ANCHOR_WORDS)) {
    const found = findWords(w.name)[0];
    assert.ok(found && namesOf(found).includes(w.name), `${node}: ${w.name}`);
  }
});

test("Jakob's own words find their entry, ahead of the names in code and the meanings", () => {
  const his: [string, string][] = [
    ["släpar", "A2.2 släp"],
    ["nyper", "A2.1 nyp"],
    ["ankare 2.2", "A2.2 släp"],
    ["A3", "Landningsbild"],
    ["ankare 3", "Landningsbild"],
    ["tillbakagången", "Retur"],
    ["utgiven", "Giv"],
    ["grundloopen", "Vilan"],
    ["vrida över handleden", "Handleden vänder kortet"],
    ["vrida som en nyckel", "Som en nyckel"],
    ["gult till blått", "Gult och blått kort"],
    ["kortbana", "Kortbana"],
    ["avatar", "Siluett"],
    ["överlägg", "Ritat kort"],
    ["overlay", "Ritat kort"],
    ["post", "Efterbehandling"],
    ["efterlaborering", "Efterbehandling"],
    ["råfilm", "Råmaterial"],
    ["färdigt material", "Färdigt material"],
    ["keystonebild", "Keystone"],
    ["baslinje", "Grundbild"],
    ["5-faldiga", "Rollblad"],
    ["replikklipp", "Talfilm"],
    ["realtidstala", "Realtidslipsynk"],
    ["lipsynk", "Lipsync"],
    ["nya labbet", "Labbet"],
    ["3D-labbet", "3D-sidan"],
    ["sajten", "Kopian"],
    ["profilval", "Förval"],
    ["boten", "Boten"],
    ["beställningsmetod", "Metod"],
    ["vinkel", "Riktning, lutning, perspektiv"],
  ];
  for (const [word, ord] of his) assert.equal(findWords(word)[0]?.ord, ord, word);
});

test("the entries the audit found missing are there", () => {
  const entry = (ord: string) => WORDS.find((w) => w.ord === ord)!;
  assert.match(entry("Ingång").betyder, /A1 → A2\.1 eller A1 → A2\.2/);
  assert.match(entry("Utgång").betyder, /A2\.1 → A1 eller A2\.2 → A1/);
  assert.match(entry("Hon går").betyder, /A1 → Borta/, "she leaves is not the Utgång");
  assert.match(entry("Landningsbild").betyder, /Stillbilden/);
  assert.match(entry("Landningsruta").betyder, /Rutan i en giv/);
  assert.match(entry("Keystone").betyder, /ur en video eller som redigerad stillbild/);
  assert.match(entry("54 och 33").betyder, /54 steg.*33 filmer/);
  for (const ord of ["Kortbana", "Siluett", "Ritat kort", "Efterbehandling", "Förval", "Rollblad", "Grundbild", "Lipsync", "Beslut", "Rörelse", "Munlapp", "Talfilm"]) assert.ok(entry(ord), ord);
});

test("the bot's guide carries every word of the table, with the other names", () => {
  for (const w of WORDS) assert.ok(GUIDE_WORDS.some((g) => g.ord === w.ord), w.ord);
  const steg = GUIDE_WORDS.find((w) => w.ord === "Steg");
  assert.ok(steg && /Kallas också: kant, edge/.test(steg.betyder));
  assert.ok(GUIDE_WORDS.some((w) => w.ord === "A1 vila" && /IDLE/.test(w.betyder)));
});

test("the table ships in the copy: no machine path, no lab address, no blocked name", () => {
  const release = JSON.parse(readFileSync(new URL("../../data/studio-release.json", import.meta.url), "utf8")) as { blocked: { names: string[] } };
  const text = JSON.stringify(WORDS);
  assert.doesNotMatch(text, /\b[A-Za-z]:[\\/]|\/(?:Users|home|tmp|private)\//);
  assert.doesNotMatch(text, /127\.0\.0\.1|https?:\/\//);
  for (const name of release.blocked.names) assert.ok(!text.includes(name), name);
});
