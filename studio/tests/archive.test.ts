// studio/lib/archive.ts: what the confirm says before a clip is archived or taken back in Karta, read from the game's own
// rule, and what Karta then lists and counts. Run from the repo root: node --test "studio/tests/archive.test.ts"
import test from "node:test";
import assert from "node:assert/strict";
import { buildGraph, type BankData, type BankJob, type MotionRecord } from "../../src/clip-graph.ts";
import { hubDeals } from "../../src/game-director.ts";
import { ApiError, putArchive } from "../lib/api.ts";
import { archiveLines, archivedOf, restoreLines, stepAfter, withArchived } from "../lib/archive.ts";
import { decide, makePrimary } from "../lib/decide.ts";
import { bankSummary, edgeInfo, isOutright, isSecondary, primaryOf } from "../lib/edge-stats.ts";
import { takeName } from "../lib/names.ts";
import { gameGraph, stepFilms } from "../lib/primaries.ts";
import { choiceEdges } from "../lib/review.ts";
import { contextSteps } from "../lib/rounds.ts";
import { primarCount } from "../lib/verdict.ts";

type Review = NonNullable<MotionRecord["review"]>;
type Motion = NonNullable<MotionRecord["motion"]>;
const ARCHIVED = { by: "Jakob", at: "2026-11-18T01:00:00.000Z", where: "Karta" };
const jakob = (extra: Review = {}): Review => ({ decision: "ACCEPTED", userAccepted: true, userReview: "Jakob 2026-11-17: bra.", ...extra });
type Row = [id: string, from: string, to: string, kind: string, review: Review, motion?: Motion];
// Paow at seat 4 (his Primär deal, another he accepted, one still waiting), her returns, the way in, three rests and a talk film,
// and one experiment film. No media: only the records the graph reads.
const ROWS: Row[] = [
  ["paow-ingang-01", "IDLE", "READY", "ENTRY", jakob()],
  ["paow-giv-p4-01", "READY", "P4.C1", "DEAL", jakob({ acceptedAs: "MAIN" })],
  ["paow-giv-p4-02", "READY", "P4.C1", "DEAL", jakob()],
  ["paow-giv-p4-03", "READY", "P4.C1", "DEAL", { decision: "PENDING", inbox: true }],
  ["paow-retur-p4-01", "P4.C1", "READY", "RETURN", jakob()],
  ["paow-retur-vila-p4-01", "P4.C1", "IDLE", "RETURN", jakob({ acceptedAs: "MAIN" })],
  ["paow-vila-lugn-01", "IDLE", "IDLE", "IDLE", jakob({ acceptedAs: "MAIN" }), { idle: { calm: true, weight: 20 } }],
  ["paow-vila-nick-01", "IDLE", "IDLE", "IDLE", jakob(), { idle: { calm: false, weight: 3 } }],
  ["paow-vila-ler-01", "IDLE", "IDLE", "IDLE", jakob(), { idle: { calm: false, weight: 3 } }],
  ["paow-tal-hej-01", "IDLE", "IDLE", "IDLE", jakob(), { idle: { calm: true, weight: 0, onRequest: true } }],
  ["paow-prov-drag-01", "READY-B", "DRAWN", "DEAL", jakob({ acceptedAs: "MAIN" })],
];
function bank(archived: string[] = [], rows: Row[] = ROWS): BankData {
  const jobs: BankJob[] = [], motions: Record<string, MotionRecord> = {}, media: NonNullable<BankData["media"]> = {}, revisions: Record<string, string> = {};
  for (const [id, from, to, kind, review, motion] of rows) {
    jobs.push({ id, kind, target: null, from, to, model: "kling-4", duration: 4, ratio: "auto_1080p", audio: false, promptText: "", first: { file: { path: "a.png", sha256: "a" } }, purpose: "", dealer: "paow" });
    motions[id] = { source: { frames: 120, fps: 30 }, review: archived.includes(id) ? { ...review, archived: ARCHIVED } : review, ...(motion ? { motion } : {}) };
    media[id] = { video: `assets/motions/${id}/source.mp4` };
    revisions[id] = `"${id}"`;
  }
  return { jobs, motions, media, revisions };
}
const DEAL = "READY>P4.C1";
const graphOf = (b: BankData) => buildGraph(b, { dealer: "paow" });
const named = (b: BankData, id: string) => { const g = graphOf(b); return takeName(g.takes[id], g.edge[g.takes[id].edge].takes); };
const KEPT = "Filmen raderas inte och domen på den står kvar. Ta tillbaka finns under Arkiverade här i steget.";

test("archiving his Primär: the step then has no Primär, and the one line names what the game then plays", () => {
  const b = bank(), g = graphOf(b);
  assert.deepEqual(archiveLines(b, "paow", g.takes["paow-giv-p4-01"], g), [`Steget har sedan ingen Primär tills du väljer en; spelet spelar då ${named(b, "paow-giv-p4-02")} här.`, KEPT]);
  // The game's own rule decides, on the bank as the game reads it: the take that still waits for him is not what plays.
  const after = stepAfter(b, "paow", g.takes["paow-giv-p4-01"], true);
  assert.equal(after.now.take?.id, "paow-giv-p4-02"); assert.equal(after.loop, null);
  assert.equal(gameGraph(withArchived(b, "paow-giv-p4-01", true), "paow").edge[DEAL].main?.id, "paow-giv-p4-02");
  // Nothing is chosen for him: no take of the step is Primär afterwards, and the bank he was shown is left as it was.
  const then = graphOf(withArchived(b, "paow-giv-p4-01", true));
  assert.equal(primaryOf(then.edge[DEAL]), null); assert.equal(then.takes["paow-giv-p4-02"].explicitMain, false);
  assert.equal(b.motions!["paow-giv-p4-01"].review!.archived, undefined);
});

test("when nothing else can play it is said plainly: a take that waits for him does not stand in", () => {
  const b = bank(["paow-giv-p4-02"]), g = graphOf(b);
  assert.deepEqual(archiveLines(b, "paow", g.takes["paow-giv-p4-01"], g), ["Steget har sedan ingen Primär tills du väljer en; spelet har då ingen film här: inget annat klipp i steget kan spelas.", KEPT]);
  const after = stepAfter(b, "paow", g.takes["paow-giv-p4-01"], true);
  assert.deepEqual([after.now.take, after.now.gap], [null, "MISSING"]);
  assert.equal(graphOf(withArchived(b, "paow-giv-p4-01", true)).edge[DEAL].main?.id, "paow-giv-p4-03", "the lab's own graph would still show the waiting take: the line follows the game, not that");
});

test("a take that is not Primär: what the game plays on the step afterwards, and for the rest how many films it picks among", () => {
  const b = bank(), g = graphOf(b);
  assert.equal(archiveLines(b, "paow", g.takes["paow-giv-p4-02"], g)[0], `Spelet spelar sedan ${named(b, "paow-giv-p4-01")} här.`);
  assert.equal(archiveLines(b, "paow", g.takes["paow-retur-p4-01"], g)[0], "Spelet har sedan ingen film här: inget annat klipp i steget kan spelas.");
  // The rest is a loop, not one film: a gesture less, and with its Primär archived the step has none.
  assert.equal(archiveLines(b, "paow", g.takes["paow-vila-nick-01"], g)[0], "Vilan slumpar sedan bland 2 filmer.");
  assert.equal(archiveLines(b, "paow", g.takes["paow-vila-lugn-01"], g)[0], "Steget har sedan ingen Primär tills du väljer en; vilan slumpar då bland 2 filmer.");
  assert.equal(archiveLines(bank(["paow-vila-nick-01", "paow-vila-ler-01"]), "paow", g.takes["paow-vila-lugn-01"], g)[0], "Steget har sedan ingen Primär tills du väljer en; vilan har då ingen film att slumpa bland.");
  assert.equal(archiveLines(b, "paow", g.takes["paow-tal-hej-01"], g)[0], "Vilan slumpar sedan bland 3 filmer.", "a talk film was never in the loop");
  // An experiment is never played by the game.
  assert.equal(archiveLines(b, "paow", g.takes["paow-prov-drag-01"], g)[0], "Steget har sedan ingen Primär tills du väljer en; spelet spelar aldrig det här steget (ett experiment).");
  for (const t of Object.values(g.takes)) assert.equal(archiveLines(b, "paow", t, g)[1], KEPT, t.id);
});

test("taking back: it comes back with its verdict, a Primär as Primär, and the line says what the game then plays", () => {
  const b = bank(["paow-giv-p4-01"]), g = graphOf(b), gone = g.takes["paow-giv-p4-01"];
  assert.deepEqual(archivedOf(g.edge[DEAL]).map((t) => t.id), ["paow-giv-p4-01"]);
  assert.equal(gone.explicitMain, true, "his verdict stayed on it");
  assert.deepEqual(restoreLines(b, "paow", gone, g), ["Den kommer tillbaka i steget som Primär, med sin dom; spelet spelar den då här."]);
  assert.equal(stepAfter(b, "paow", gone, false).now.take?.id, "paow-giv-p4-01");
  // A plain approved take comes back beside the Primär that plays.
  const plain = bank(["paow-giv-p4-02"]), pg = graphOf(plain);
  assert.deepEqual(restoreLines(plain, "paow", pg.takes["paow-giv-p4-02"], pg), [`Den kommer tillbaka i steget, med sin dom; spelet spelar då ${named(plain, "paow-giv-p4-01")} här.`]);
  assert.deepEqual(restoreLines(bank(["paow-vila-nick-01"]), "paow", g.takes["paow-vila-nick-01"], g), ["Den kommer tillbaka i steget, med sin dom; vilan slumpar då bland 3 filmer."]);
  // Should the step hold another Primär by then (a lowering that failed), both are named and the choice is his.
  const two = bank(["paow-giv-p4-01"], ROWS.map((r): Row => (r[0] === "paow-giv-p4-02" ? [r[0], r[1], r[2], r[3], jakob({ acceptedAs: "MAIN" })] : r))), tg = graphOf(two);
  assert.equal(restoreLines(two, "paow", tg.takes["paow-giv-p4-01"], tg)[1], `${named(two, "paow-giv-p4-02")} är också Primär i steget: välj en av dem med Gör primär efteråt.`);
  assert.equal(withArchived(b, "paow-giv-p4-01", false).motions!["paow-giv-p4-01"].review!.archived, undefined);
  assert.deepEqual(b.motions!["paow-giv-p4-01"].review!.archived, ARCHIVED, "the bank itself is left as it was");
});

test("Karta with an archived Primär: no Primär on the step, the take neither Primär nor secondary nor counted, and listed only under Arkiverade", () => {
  const before = bank(), b = bank(["paow-giv-p4-01"]), g = graphOf(b), game = gameGraph(b, "paow"), hubs = hubDeals(b, "paow");
  const step = stepFilms(b, g, game, DEAL, hubs)!;
  assert.equal(step.primary, null);
  assert.deepEqual(step.secondaries.map((f) => f.take.id), ["paow-giv-p4-02"]);
  assert.equal(step.proposal?.id, "paow-giv-p4-02", "his other approved take is proposed, not chosen");
  assert.equal(step.now.take?.id, "paow-giv-p4-02");
  assert.equal(step.elsewhere, 1, "the waiting take is in Granska; the archived one is not counted there");
  const gone = g.takes["paow-giv-p4-01"];
  assert.deepEqual([isSecondary(gone, game), isOutright(gone), !!game.takes[gone.id]], [false, false, false]);
  // The counts: one Primär less, the step still has a film, and the line's chip counts one secondary.
  assert.equal(primarCount(graphOf(before)).set - primarCount(g).set, 1);
  assert.deepEqual([bankSummary(game, hubs).primary, bankSummary(game, hubs).missing], [bankSummary(gameGraph(before, "paow"), hubs).primary - 1, bankSummary(gameGraph(before, "paow"), hubs).missing]);
  assert.equal(edgeInfo(game, DEAL, hubs, true)!.counts.total, 1);
  // With the step's last film archived too, the map says the film is missing.
  const none = bank(["paow-giv-p4-01", "paow-giv-p4-02"]), ng = gameGraph(none, "paow");
  assert.deepEqual([edgeInfo(ng, DEAL, {}, true)!.tag, bankSummary(ng).missing - bankSummary(game).missing], [{ kind: "gap", gap: "MISSING", word: "saknas" }, 1]);
  assert.deepEqual(archivedOf(graphOf(none).edge[DEAL]).map((t) => t.id), ["paow-giv-p4-01", "paow-giv-p4-02"]);
  // Jämför offers no choice where one film is left, and the scene refuses to play an archived take, saying why.
  assert.equal(choiceEdges(g).some((c) => c.edge.id === DEAL && c.takes.some((t) => t.archived)), false);
  assert.match(contextSteps(g, DEAL, "paow-giv-p4-01").error ?? "", /kan inte spelas \(arkiverad: ta tillbaka den i Karta\)\.$/);
  assert.equal(contextSteps(graphOf(before), DEAL, "paow-giv-p4-01").error, null);
});

// ── The one write, as the page sends it: the studio's real writer (putArchive in lib/api.ts) against a fake fetch ──
type Call = { method: string; url: string; ifMatch: string | null; type: string | null; body: unknown };
function fakeFetch(status = 200) {
  const calls: Call[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    calls.push({ method: init?.method ?? "GET", url: String(input), ifMatch: headers.get("if-match"), type: headers.get("content-type"), body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response(JSON.stringify(status === 200 ? { id: "x", review: {}, revision: '"ny"' } : { error: "Posten har ändrats sedan den lästes. Läs om klippbanken och försök igen." }), { status });
  }) as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = real) };
}

test("the write: one PUT to the archive route with the take's revision and nothing but archived; a changed record is a conflict", async () => {
  const g = graphOf(bank()), take = g.takes["paow-giv-p4-01"];
  const f = fakeFetch();
  try {
    await putArchive(take.id, true, take.revision ?? "");
    await putArchive(take.id, false, '"ny"');
    assert.deepEqual(f.calls, [
      { method: "PUT", url: "/api/clip-bank/archive/paow-giv-p4-01", ifMatch: '"paow-giv-p4-01"', type: "application/json", body: { archived: true } },
      { method: "PUT", url: "/api/clip-bank/archive/paow-giv-p4-01", ifMatch: '"ny"', type: "application/json", body: { archived: false } },
    ]);
    await assert.rejects(putArchive(take.id, true, ""), (e: unknown) => e instanceof ApiError && e.kind === "precondition", "a take without a record cannot be archived");
    assert.equal(f.calls.length, 2, "and nothing was sent for it");
  } finally {
    f.restore();
  }
  const changed = fakeFetch(409);
  try {
    await assert.rejects(putArchive(take.id, true, take.revision ?? ""), (e: unknown) => e instanceof ApiError && e.kind === "conflict");
  } finally {
    changed.restore();
  }
});

test("an archived take is not made Primär before it is taken back, and a new Primär lowers the archived one as any other", async () => {
  const b = bank(["paow-giv-p4-01"]), g = graphOf(b);
  const puts: [string, string][] = [];
  const put = async (id: string, decision: string) => { puts.push([id, decision]); return { id, review: {}, revision: '"ny"' }; };
  await assert.rejects(decide(g.takes["paow-giv-p4-01"], "MAIN", "", g, put), /Tagningen är arkiverad\. Ta tillbaka den i Karta först/);
  assert.deepEqual(puts, [], "nothing is written, so the step's films are left as they were");
  // His other decisions on it are still his to make, and choosing another take Primär leaves one Primär on the step.
  await decide(g.takes["paow-giv-p4-01"], "REJECTED", "nej", g, put);
  const made = await makePrimary(g.takes["paow-giv-p4-02"], g, put);
  assert.deepEqual(puts, [["paow-giv-p4-01", "REJECTED"], ["paow-giv-p4-02", "MAIN"], ["paow-giv-p4-01", "ACCEPTED"]]);
  assert.equal(made.lowered.length, 1);
});
