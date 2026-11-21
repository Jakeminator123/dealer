// What a take's review says, as one of five verdicts with a sign and a colour, and whose word it is; and the same for a
// proof file. Pure: no DOM, no network; tests in studio/tests/verdict.test.ts.
import type { Graph, MotionRecord, Take } from "../../src/clip-graph.ts";
import type { Proof } from "./api.ts";

// ── Takes ───────────────────────────────────────────────────────────────────
export type Verdict = "primar" | "godkand" | "variant" | "vantar" | "underkand";
export const VERDICTS: readonly Verdict[] = ["primar", "godkand", "variant", "vantar", "underkand"];
export const VERDICT_LABEL: Record<Verdict, string> = { primar: "Primär", godkand: "Godkänd", variant: "Variant", vantar: "Väntar", underkand: "Underkänd" };
export const VERDICT_SIGN: Record<Verdict, string> = { primar: "★", godkand: "✓", variant: "◆", vantar: "○", underkand: "✕" };

/**
 * verdict: the chip. byJakob: the decision is Jakob's own (an acceptance with review.userAccepted, a rejection with his
 * words in review.userReview); false means a reviewer (an agent) decided and the chip says "av granskare". detail: a
 * word more where the five verdicts are too coarse ("sekundär", "renderas", "misslyckad"). provisional: the main agent and
 * a reviewer judged it for him, on his hand-over (review.provisional, tools/review-put.ts), in his words "dömd åt dig".
 * Never byJakob, not in his queue (awaitingJakob), and his own decision replaces it.
 */
export type VerdictInfo = { verdict: Verdict; byJakob: boolean; label: string; sign: string; detail: string | null; provisional: boolean };

export type Review = NonNullable<MotionRecord["review"]>;
type TakeLike = Pick<Take, "stage" | "decision" | "variant" | "explicitMain"> & { motion: Pick<MotionRecord, "review"> | null };

const info = (verdict: Verdict, byJakob: boolean, detail: string | null = null, provisional = false): VerdictInfo => ({
  verdict,
  byJakob,
  label: VERDICT_LABEL[verdict],
  sign: VERDICT_SIGN[verdict],
  detail,
  provisional,
});

/** Has Jakob said anything about this take? His words stand in review.userReview ("Jakob 2026-11-11: …"). */
export const jakobSaid = (review: Review | null | undefined): boolean => typeof review?.userReview === "string" && review.userReview.trim() !== "";

/** A provisional verdict (tools/review-store.ts applyProvisional): by whom, when, under which words of his, and why. */
export type Provisional = { by: string; at: string; mandate: string; note: string };
/**
 * A mandate in words, without the task's id the main agent stores in front of it ("dealer-37-20261120: pilot 02 till
 * plats 4" reads "pilot 02 till plats 4"); his own words ("Jakob 2026-11-13: …") are kept whole.
 */
export const mandateText = (mandate: string): string => mandate.replace(/^[^:\s]+:\s*/, "");
/** The provisional verdict a take carries, or null; his own word always wins over one left behind. */
export function provisionalOf(review: Review | null | undefined): Provisional | null {
  const p = review?.provisional;
  if (!p || typeof p !== "object" || jakobSaid(review)) return null;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return { by: s(p.by), at: s(p.at), mandate: s(p.mandate), note: s(p.note) };
}

export function verdictOf(take: TakeLike): VerdictInfo {
  const review = take.motion?.review ?? null;
  if (take.stage !== "DONE") return info("vantar", false, take.stage === "FAILED" ? "misslyckad" : take.stage === "ORDERED" ? "renderas" : "inte klar");
  const provisional = !!provisionalOf(review);
  if (take.decision === "REJECTED") return info("underkand", jakobSaid(review), null, provisional);
  // A secondary alternative is played only when nothing better exists, and its words are about its faults.
  if (take.decision === "SECONDARY") return info("underkand", jakobSaid(review), "sekundär");
  const accepted = review?.userAccepted === true;
  if (take.explicitMain) return info("primar", accepted);
  if (take.variant) return info("variant", accepted, null, provisional);
  if (take.decision === "ACCEPTED") return info("godkand", accepted, null, provisional);
  return info("vantar", false);
}

// A verdict the main agent and a reviewer gave for him (provisional) reads "dömd åt dig": the verdict's own word and
// "åt dig". It does not wait for him (Jakob 2026-11-13: "Med andra ord vill jag inte se en sån här lista när jag är
// tillbaka!"); Granska lists such takes under JUDGED_FOR_YOU in "Alla".
export const FOR_YOU = "åt dig";
export const JUDGED_FOR_YOU = "Dömda åt dig";
const FOR_YOU_WORD: Partial<Record<Verdict, string>> = { godkand: "godkänd", variant: "variant", underkand: "underkänd" };
/** The verdict in words for a sentence: "godkänd", "variant"; judged for him: "godkänd åt dig", "underkänd åt dig". */
export function verdictPhrase(v: Pick<VerdictInfo, "verdict" | "provisional">): string {
  const word = v.provisional ? FOR_YOU_WORD[v.verdict] : null;
  return word ? `${word} ${FOR_YOU}` : VERDICT_LABEL[v.verdict].toLowerCase();
}
/** The chip of a verdict judged for him: the verdict's own label and the note "åt dig" (the chip is drawn dashed). */
export function provisionalChip(v: Pick<VerdictInfo, "verdict">): { label: string; note: string } {
  return { label: VERDICT_LABEL[v.verdict], note: FOR_YOU };
}
/**
 * Who judged it for him, when, under which words of his, and that his decision replaces it; the chip's tooltip and the
 * line above his buttons. "Godkänd åt dig av huvudagenten och en granskare, 2026-11-13, på ditt uppdrag: Jakob …. Inte
 * din egen dom; ditt beslut ersätter den." Without the block (only the verdict known) it names neither who nor his words.
 */
export function provisionalWords(v: Pick<VerdictInfo, "verdict">, p: Provisional | null = null): string {
  const said = verdictPhrase({ verdict: v.verdict, provisional: true });
  const head = [`${said[0].toUpperCase()}${said.slice(1)}${p?.by ? ` av ${p.by}` : ""}`, p?.at ? p.at.slice(0, 10) : "", p?.mandate ? `på ditt uppdrag: ${mandateText(p.mandate)}` : ""];
  return `${head.filter(Boolean).join(", ")}. Inte din egen dom; ditt beslut ersätter den.`;
}

/**
 * The decision a take's buttons show as chosen, in the words of the review route; null when nothing is chosen. A
 * provisional verdict is not his choice, so none of his buttons shows as pressed for it.
 */
export function chosenDecision(take: TakeLike): "MAIN" | "ACCEPTED" | "VARIANT" | "REJECTED" | null {
  if (take.stage !== "DONE" || provisionalOf(take.motion?.review)) return null;
  if (take.decision === "REJECTED") return "REJECTED";
  if (take.explicitMain) return "MAIN";
  if (take.variant) return "VARIANT";
  return take.decision === "ACCEPTED" ? "ACCEPTED" : null;
}

// The words tools/review-store.ts writes when a decision comes without a note (SAID there). They are not Jakob's note,
// so a note field shows them as empty. studio/tests/verdict.test.ts checks this list against review-store itself.
export const SAID_WITHOUT_NOTE = [
  "vald som primär tagning i labbet.",
  "godkänd i labbet.",
  "godkänd som variant i labbet.",
  "sekundärt alternativ, satt i labbet.",
  "underkänd i labbet.",
  "återställd till ogranskad i labbet.",
];

/** Jakob's own note, without the name and date in front ("Jakob 2026-11-11: ") and without the store's default words. */
export function storedNote(review: Review | null | undefined): string {
  const text = String(review?.userReview ?? "")
    .replace(/^\S+ \d{4}-\d{2}-\d{2}: /, "")
    .trim();
  return SAID_WITHOUT_NOTE.includes(text) ? "" : text;
}

/** The day and name of Jakob's word, if any: "Jakob 2026-11-11". */
export function reviewStamp(review: Review | null | undefined): string | null {
  return /^(\S+ \d{4}-\d{2}-\d{2}):/.exec(String(review?.userReview ?? ""))?.[1] ?? null;
}

/**
 * Finished takes still waiting for Jakob's word, as the bank lists them: no userReview yet, not set aside by a reviewer
 * (rejected or secondary), and not judged for him (a provisional verdict does not wait for him; judgedForJakob lists
 * those). The rail's count beside Granska.
 */
export function awaitingJakob(graph: Graph): Take[] {
  return Object.values(graph.takes)
    .filter((t) => t.stage === "DONE" && !jakobSaid(t.motion?.review) && t.decision !== "REJECTED" && t.decision !== "SECONDARY" && !provisionalOf(t.motion?.review))
    .sort((a, b) => a.order - b.order);
}

/** The takes judged for him (the chip's "åt dig", verdictOf provisional), in the order given: Granska's "Dömda åt dig". */
export function judgedForJakob(takes: readonly Take[]): Take[] {
  return takes.filter((t) => verdictOf(t).provisional);
}

/**
 * The films the round needs (graph.summary.films.required) and how many of them have a Primär: the count beside Primära.
 * A Primär he has archived does not count: its step has no Primär until he chooses one or takes it back.
 */
export function primarCount(graph: Graph): { set: number; total: number } {
  const required = graph.summary.films.required.map((id) => graph.edge[id]).filter(Boolean);
  return { set: required.filter((e) => e.takes.some((t) => t.explicitMain && !t.archived)).length, total: required.length };
}

// ── Proofs ──────────────────────────────────────────────────────────────────
// A proof's files are takes (produced films or pictures that may be used: proof.json takes, a list of file names) or
// underlag (what was sent, a reference film, a measuring sheet, a look at a page). Only a take carries a review chip: the
// reviewer's verdict (proof.json verdicts[file] = ok | remarks | failed, or read from the words of its label), else
// "Väntar på granskaragenten", which is the reviewer's work, never Jakob's. A proof without a takes list counts as takes only the
// files a reviewer has judged; every other file carries no chip.
export type ProofVerdict = "ok" | "remarks" | "failed" | "unreviewed";
export const PROOF_VERDICT_LABEL: Record<ProofVerdict, string> = { ok: "Användbar", remarks: "Med anmärkningar", failed: "Underkänd", unreviewed: "Väntar på granskaragenten" };

type ProofLike = Pick<Proof, "labels" | "verdicts"> & { takes?: readonly string[] | null };

/** A file's label as the proof gives it, else its name in words: "titta-runt.mp4" → "titta runt". */
export const proofLabel = (proof: ProofLike, file: string): string => proof.labels?.[file] ?? file.replace(/\.(?:mp4|png)$/, "").replaceAll("-", " ");

/** What the proof says of a file: its stated verdict, else the one its label's words give, else nothing. */
function statedVerdict(proof: ProofLike, file: string): ProofVerdict | null {
  const given = proof.verdicts?.[file];
  // A stated "unreviewed" is no verdict: where the label carries the reviewer's word, the word counts.
  if (given && given !== "unreviewed" && Object.hasOwn(PROOF_VERDICT_LABEL, given)) return given as ProofVerdict;
  return fromWords(proofLabel(proof, file).toLowerCase()) ?? (given === "unreviewed" ? "unreviewed" : null);
}

/** The verdict a label's words give. */
function fromWords(t: string): ProofVerdict | null {
  // A reviewer's word first in a parenthesis is a verdict too: "(faller, 1/5: …)", "(håller, 4/5: …)", "(möjlig variant, 3/5)".
  if (/inte användbar|underkän|not usable|\((?:faller|föll)[,:)]/.test(t)) return "failed";
  if (/användbar med|med anmärkning|som variant|\(möjlig variant[,:)]/.test(t)) return "remarks";
  if (/bara mätt|inte (?:rut)?granskad|inte rättad|ej granskad/.test(t)) return "unreviewed";
  if (/användbar|godkän|\(håller[,:)]/.test(t)) return "ok";
  return null;
}

/** Whether a file of the proof is a take: named in its takes list; without a list, judged by a reviewer. */
export function isProofTake(proof: ProofLike, file: string): boolean {
  if (Array.isArray(proof.takes)) return proof.takes.includes(file);
  const v = statedVerdict(proof, file);
  return v !== null && v !== "unreviewed";
}

/** A file's review chip: a take's verdict, "unreviewed" (Väntar på granskaragenten) for a take without one, null for underlag. */
export function proofVerdict(proof: ProofLike, file: string): ProofVerdict | null {
  return isProofTake(proof, file) ? (statedVerdict(proof, file) ?? "unreviewed") : null;
}

/** A label is one short name and then everything known about the file: "Hemvy · salong (exakt, 4 s)" → name + rest. */
export function splitLabel(label: string): { name: string; rest: string } {
  const cut = label.search(/ \(|\. |: /);
  return cut >= 8 ? { name: label.slice(0, cut), rest: label.slice(cut).replace(/^[.:]\s*/, "").trim() } : { name: label, rest: "" };
}
