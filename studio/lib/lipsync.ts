// Lipsync (/lipsync/): what the lip-sync model actually uses and at which scales (data/lipsync.json, the speech lane's
// register, read through tools/lipsync-store.ts). The view's one call to the lab server, and the pure reading of the
// speech lane's words the view draws with: who does a step, a scale as factors in width and height, whether a value is
// estimated. The words themselves are shown as the file has them; these only decide colour, size and order.
// Only in the lab: the online copy reads nothing here (app/lipsync/page.tsx shows a word instead, the rail leaves the
// view out). Read-only: nothing here writes. Tests: studio/tests/lipsync.test.ts.
import type { BaseImage, LipRow, Lipsync, LipsMeasured, NotUsed, OpenPoint, ProofFact, Runs, Setting, Step } from "../../tools/lipsync-register.ts";
import type { LipsyncAnswer, Still } from "../../tools/lipsync-store.ts";
import { ApiError } from "./api.ts";
import { labUrl } from "./lab.ts";
import { isSnapshot, swedishMoment } from "./mode.ts";

export type { BaseImage, LipRow, Lipsync, LipsMeasured, LipsyncAnswer, NotUsed, OpenPoint, ProofFact, Runs, Setting, Step, Still };

// ── The call ────────────────────────────────────────────────────────────────
const NOT_UP = "Labbet svarar inte. Starta det med START.cmd.";

/** The facts, with a still per proof (GET /api/lipsync). */
export async function getLipsync(): Promise<LipsyncAnswer> {
  if (isSnapshot) throw new ApiError("Lipsync finns bara i labbet.", 403, "refused");
  let response: Response;
  try {
    response = await fetch(labUrl("api/lipsync"), { cache: "no-store" });
  } catch {
    throw new ApiError(NOT_UP, 0, "network");
  }
  if (!response.ok) {
    let said = "";
    try {
      said = String((await response.json())?.error ?? "");
    } catch {}
    // A 404 without a word of the route's own is a lab server started before the route was there.
    if (response.status === 404 && !said) throw new ApiError("Labbet känner inte vyn Lipsync än: labbservern behöver startas om.", 404, "missing");
    throw new ApiError(said || `Fakta om läppsynken gick inte att läsa (${response.status}).`, response.status, response.status === 404 ? "missing" : response.status >= 500 ? "server" : "invalid");
  }
  return (await response.json()) as LipsyncAnswer;
}

// ── Who does a step ─────────────────────────────────────────────────────────
export type Who = "ours" | "renderer" | "model" | "game" | "other";

/**
 * "Scoutgamings renderer" → renderer; "MuseTalk 1.5" → model; "munlagret i spelet" → game; "vårt verktyg (prov, inte i
 * spelet)" → ours, with the words in brackets as a note. The other team's renderer and the model it runs are sealed.
 */
export function whoOf(by: string): { who: Who; label: string; note: string | null; sealed: boolean } {
  const bracket = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(by);
  const label = (bracket ? bracket[1] : by).trim();
  const note = bracket ? bracket[2].trim() : null;
  const who: Who = /musetalk/i.test(label) ? "model" : /renderer/i.test(label) ? "renderer" : /\bspelet\b/i.test(label) ? "game" : /\bvår(?:t|a)?\b/i.test(label) ? "ours" : "other";
  return { who, label: label.charAt(0).toUpperCase() + label.slice(1), note, sealed: who === "renderer" || who === "model" };
}

/** A step beside the chain: a trial, not what the game does ("vårt verktyg (prov, inte i spelet)"). */
export const isTrial = (step: Pick<Step, "by">): boolean => /\bprov\b/i.test(whoOf(step.by).note ?? "");

/** A value the speech lane estimated: it says so in its own words. */
export const isEstimated = (text: string): boolean => /\bcirka\b|\bskatta[dt]\b|\bskattning/i.test(text);

/** "-" in the file: the step has no format or no scale. */
export const isNone = (text: string): boolean => /^\s*[-–]\s*$/.test(text);

// ── A scale ─────────────────────────────────────────────────────────────────
/** One factor as the file writes it ("1,18", or "1,18–1,40" for a span) and its numbers. */
export type Factor = { lo: number; hi: number; text: string };
export type Scale = { width: Factor; height: Factor; estimated: boolean };

const number = (text: string) => Number(text.replace(",", "."));

/**
 * The factors of a scale in width and height: "× 2" and "1 : 1" both ways, "× 1,00 i bredd, × 1,25 i höjd" each its own,
 * "× 1,18 till × 1,40 i höjd" a span. Parts after the first that name neither width nor height ("överläppen för sig …") are
 * left to the text. null for "-" or a scale it cannot read; the view then shows the words only.
 */
export function readScale(scale: string): Scale | null {
  if (isNone(scale)) return null;
  let width: Factor | null = null;
  let height: Factor | null = null;
  // Split on ";" and on ", " (a decimal comma has no space after it).
  for (const [i, part] of scale.split(/;\s*|,\s+/).entries()) {
    const found = [...part.matchAll(/×\s?(\d+(?:,\d+)?)/g)].map((m) => m[1]);
    if (!found.length && /(?:^|\D)1\s?:\s?1(?:\D|$)/.test(part)) found.push("1");
    if (!found.length) continue;
    const values = found.map(number);
    const factor: Factor = { lo: Math.min(...values), hi: Math.max(...values), text: found.length > 1 ? `${found[0]}–${found[found.length - 1]}` : found[0] };
    if (/bredd/i.test(part)) width = factor;
    else if (/höjd/i.test(part)) height = factor;
    else if (i === 0) width = height = factor;
  }
  if (!width && !height) return null;
  // A scale that names only one way leaves the other as it was.
  const one: Factor = { lo: 1, hi: 1, text: "1" };
  return { width: width ?? one, height: height ?? one, estimated: isEstimated(scale) };
}

export type Direction = "up" | "down" | "same" | "mixed";

/** Whether the step enlarges, shrinks or keeps the size (in either way). */
export function direction(scale: Scale): Direction {
  const values = [scale.width.lo, scale.width.hi, scale.height.lo, scale.height.hi];
  if (values.every((v) => v === 1)) return "same";
  if (values.every((v) => v >= 1)) return "up";
  if (values.every((v) => v <= 1)) return "down";
  return "mixed";
}

export const DIRECTION_WORD: Record<Direction, string> = { up: "Förstoras", down: "Förminskas", same: "Samma storlek", mixed: "Både större och mindre" };

/** The scale in a few signs, for the overview: "1 : 1", "× 2", "≈ × 1,3", "bredd × 1,00 · höjd × 1,25". */
export function scaleHeadline(scale: Scale | null): string {
  if (!scale) return "–";
  const about = scale.estimated ? "≈ " : "";
  const { width, height } = scale;
  if (width.text === height.text) return width.lo === 1 && width.hi === 1 ? `${about}1 : 1` : `${about}× ${width.text}`;
  return `${about}bredd × ${width.text} · höjd × ${height.text}`;
}

/** A scale's words split for drawing: the factors ("× 1,3", "1 : 1") large, "(skattat)" as a mark, the rest as it is. */
export type ScalePart = { text: string; kind: "plain" | "factor" | "estimate" };
export function scaleParts(scale: string): ScalePart[] {
  return scale
    .split(/(×\s?\d+(?:,\d+)?|(?<!\d)1\s?:\s?1(?!\d)|\(skattat\))/)
    .filter((text) => text !== "")
    .map((text) => ({ text, kind: text === "(skattat)" ? "estimate" : /^×|^1\s?:\s?1$/.test(text) ? "factor" : "plain" }));
}

// ── Order and words ─────────────────────────────────────────────────────────
/** The settings by their group, the groups in the order the file first names them. */
export function groupSettings<T extends Pick<Setting, "group">>(settings: readonly T[]): { group: string; settings: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const s of settings) groups.set(s.group, [...(groups.get(s.group) ?? []), s]);
  return [...groups].map(([group, list]) => ({ group, settings: list }));
}

/** "vår" → "Vår", "Scoutgaming" as it is. */
export const ownerWord = (owner: string): string => owner.charAt(0).toUpperCase() + owner.slice(1);

/** Whose a setting is: ours, or the other team's. */
export const isOurs = (owner: string): boolean => /^vår/i.test(owner.trim());

/** "17 nov": a day of the file, in Swedish. */
export function dayWord(day: string): string {
  const moment = swedishMoment(`${day}T12:00:00Z`);
  return moment ? moment.replace(/\s\d{2}:\d{2}$/, "") : day;
}

/** How a proof ended, as a colour: waits for him, a no, approved for now, or neither. */
export function outcomeTone(outcome: string): "brass" | "bad" | "ok" | "neutral" {
  if (/väntar/i.test(outcome)) return "brass";
  if (/^nej\b|inte tagen|stängd/i.test(outcome)) return "bad";
  if (/godkänt/i.test(outcome)) return "ok";
  return "neutral";
}

/** A measure in pixels in Swedish: 7.4 → "7,4". */
export const measureWord = (value: number | undefined): string => (value === undefined ? "–" : String(value).replace(".", ","));

/** Where a proof opens in the Prov room, on the file the view shows. */
export function proofHref(proof: string, file?: string | null): string {
  const query = new URLSearchParams({ prov: proof });
  if (file) query.set("fil", file);
  return `/prov/?${query.toString()}`;
}
