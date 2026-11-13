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
 * a reviewer judged it in his place (review.provisional, tools/review-put.ts); never byJakob, and it waits for his word.
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

// The verdict in words for a sentence. A provisional one says so and that it waits for him, in words he reads at a glance.
const PROVISIONAL_WORD: Partial<Record<Verdict, string>> = { godkand: "preliminärt godkänd", variant: "preliminärt godkänd som variant", underkand: "preliminärt underkänd" };
export const WAITS_FOR_YOU = "väntar på din dom";
/** "godkänd", "variant"; provisional: "preliminärt godkänd, väntar på din dom". */
export function verdictPhrase(v: Pick<VerdictInfo, "verdict" | "provisional">): string {
  const word = v.provisional ? PROVISIONAL_WORD[v.verdict] : null;
  return word ? `${word}, ${WAITS_FOR_YOU}` : VERDICT_LABEL[v.verdict].toLowerCase();
}
/** The chip's words for a provisional verdict: "Preliminär · godkänd av granskaren". */
export function provisionalChip(v: Pick<VerdictInfo, "verdict">): string {
  return `Preliminär · ${v.verdict === "underkand" ? "underkänd" : v.verdict === "variant" ? "variant" : "godkänd"} av granskaren`;
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
 * Finished takes still waiting for Jakob's word: no userReview yet and not set aside by a reviewer (rejected or
 * secondary), and every take with a provisional verdict, a provisional rejection too. The rail's count beside Granska.
 * Provisional ones first, then as the bank lists them.
 */
export function awaitingJakob(graph: Graph): Take[] {
  const provisional = (t: Take) => (provisionalOf(t.motion?.review) ? 1 : 0);
  return Object.values(graph.takes)
    .filter((t) => t.stage === "DONE" && !jakobSaid(t.motion?.review) && ((t.decision !== "REJECTED" && t.decision !== "SECONDARY") || provisional(t)))
    .sort((a, b) => provisional(b) - provisional(a) || a.order - b.order);
}

/** The films the round needs (graph.summary.films.required) and how many of them have a Primär: the count beside Primära. */
export function primarCount(graph: Graph): { set: number; total: number } {
  const required = graph.summary.films.required.map((id) => graph.edge[id]).filter(Boolean);
  return { set: required.filter((e) => e.takes.some((t) => t.explicitMain)).length, total: required.length };
}

// ── Proofs ──────────────────────────────────────────────────────────────────
// A proof file's verdict (assets/proofs/<id>/proof.json: verdicts[file] = ok | remarks | failed | unreviewed), or, when
// the proof does not state one, read from the words of its label, as the old lab did (src/lab-ui.ts pfVerdict).
export type ProofVerdict = "ok" | "remarks" | "failed" | "unreviewed";
export const PROOF_VERDICT_LABEL: Record<ProofVerdict, string> = { ok: "Användbar", remarks: "Med anmärkningar", failed: "Underkänd", unreviewed: "Inte granskad" };

type ProofLike = Pick<Proof, "labels" | "verdicts">;

/** A file's label as the proof gives it, else its name in words: "titta-runt.mp4" → "titta runt". */
export const proofLabel = (proof: ProofLike, file: string): string => proof.labels?.[file] ?? file.replace(/\.(?:mp4|png)$/, "").replaceAll("-", " ");

export function proofVerdict(proof: ProofLike, file: string): ProofVerdict | null {
  const given = proof.verdicts?.[file];
  if (given && Object.hasOwn(PROOF_VERDICT_LABEL, given)) return given as ProofVerdict;
  const t = proofLabel(proof, file).toLowerCase();
  if (/inte användbar|underkän|not usable/.test(t)) return "failed";
  if (/användbar med|med anmärkning|som variant/.test(t)) return "remarks";
  if (/bara mätt|inte (?:rut)?granskad|inte rättad|ej granskad/.test(t)) return "unreviewed";
  if (/användbar|godkän/.test(t)) return "ok";
  return null;
}

/** A label is one short name and then everything known about the file: "Hemvy · salong (exakt, 4 s)" → name + rest. */
export function splitLabel(label: string): { name: string; rest: string } {
  const cut = label.search(/ \(|\. |: /);
  return cut >= 8 ? { name: label.slice(0, cut), rest: label.slice(cut).replace(/^[.:]\s*/, "").trim() } : { name: label, rest: "" };
}
