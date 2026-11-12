// The conversation in the panel as lines, and what of it goes with a question or a draft. Pure; tests in
// studio/tests/bot-thread.test.ts.
import { THREAD_LIMIT, type BotFel, type Kalla, type Niva, type TradLine, type Vy } from "../../lib/bot-client.ts";

export type DuLine = { id: string; roll: "du"; text: string; bild: string | null; harBild: boolean; vy: Vy | null; niva: Niva };
export type BotStatus = "tanker" | "skriver" | "klar" | "fel" | "stoppad";
export type BotLine = {
  id: string;
  roll: "bot";
  /** The question it answers. */
  fraga: string;
  text: string;
  kallor: Kalla[];
  /** The sources the answer says it used (klar), or null while it streams. */
  used: string[] | null;
  status: BotStatus;
  fel: BotFel | null;
  niva: Niva;
  started: number;
  beat: number;
};
export type InfoLine = { id: string; roll: "info"; text: string; href: string | null; link: string | null };
export type Line = DuLine | BotLine | InfoLine;

let serial = 0;
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++serial).toString(36)}`;

/** An answer worth sending back as context: finished, or stopped with some text. */
const answered = (line: BotLine) => (line.status === "klar" || line.status === "stoppad") && line.text.trim() !== "";

/**
 * The conversation before a line (or all of it) as the bot reads it: questions and the answers they got, oldest first,
 * the last THREAD_LIMIT lines. A question whose answer failed is left out with it; notes in the panel are left out.
 */
export function threadOf(lines: readonly Line[], before?: string, limit = THREAD_LIMIT): TradLine[] {
  const end = before ? lines.findIndex((l) => l.id === before) : -1;
  const upto = end >= 0 ? lines.slice(0, end) : lines;
  const answers = new Map<string, BotLine>();
  for (const line of upto) if (line.roll === "bot") answers.set(line.fraga, line);
  const out: TradLine[] = [];
  for (const line of upto) {
    if (line.roll === "du") {
      const answer = answers.get(line.id);
      if (answer && answered(answer)) out.push({ roll: "du", text: line.text }, { roll: "bot", text: answer.text });
    }
  }
  return out.slice(-limit);
}

/** The conversation up to and including one answer: what a draft of a request from that answer reads. */
export function threadThrough(lines: readonly Line[], botId: string, limit = THREAD_LIMIT): TradLine[] {
  const at = lines.findIndex((l) => l.id === botId);
  return threadOf(at < 0 ? lines : lines.slice(0, at + 1), undefined, limit);
}

/** The question an answer belongs to. */
export const questionOf = (lines: readonly Line[], bot: BotLine): DuLine | null =>
  (lines.find((l) => l.id === bot.fraga && l.roll === "du") as DuLine | undefined) ?? null;

/** The lines as they are kept for this tab: without pictures (too big), an answer cut off by a reload marked stopped. */
export function toKeep(lines: readonly Line[]): Line[] {
  return lines.map((line) => {
    if (line.roll === "du") return { ...line, bild: null };
    if (line.roll === "bot" && (line.status === "tanker" || line.status === "skriver")) return { ...line, status: line.text ? "stoppad" : "fel", fel: line.text ? null : { kod: "avbrutet", text: "Svaret bröts när sidan laddades om." } };
    return line;
  });
}

/** Lines read back from storage, or [] when they cannot be read. */
export function fromKept(value: unknown): Line[] {
  if (!Array.isArray(value)) return [];
  return value.filter((l): l is Line => !!l && typeof l === "object" && typeof (l as Line).id === "string" && ["du", "bot", "info"].includes((l as Line).roll));
}
