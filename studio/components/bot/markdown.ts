// The bot's answer as blocks for the panel: paragraphs, headings, lists, **bold**, `code` and source marks. The server
// asks the model to cite a section by its title in brackets, exactly as given ("[HANDOFF › Läget i banken]", several with
// ";"); a mark may also be a source's number ([1], [1, 3]) or id. Titles are compared as the server compares them
// (cloud/studio/bot-prompt.ts cited: spaces, the › > » separators, case). A bracket that names no source stays text.
// Built for running text: an unclosed ** while the answer streams is shown as it is until it closes. Pure; tests in
// studio/tests/bot-markdown.test.ts.

export type Inline = { t: "text"; v: string } | { t: "b"; v: string } | { t: "code"; v: string } | { t: "cite"; n: number } | { t: "br" };
export type Block = { kind: "p"; parts: Inline[] } | { kind: "h"; parts: Inline[] } | { kind: "ul" | "ol"; items: Inline[][]; start: number };
/** A source as the answer's kallor event names it. */
export type Source = { id: string; titel: string };

const BULLET = /^\s{0,3}[-*•]\s+(.*)$/;
const NUMBER = /^\s{0,3}(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,4}\s+(.*)$/;

/** A title as the server compares it (cloud/studio/bot-prompt.ts norm): the arrows of a step ("A2.1 → P4C1", "->") too. */
export const normTitle = (text: string) =>
  text
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/\s*(?:->|›|>|»|→)\s*/g, " › ")
    .trim()
    .toLowerCase();

/** The source a part of a bracket names (title, id or number), as its number from 1, or 0. */
function sourceNumber(part: string, sources: readonly Source[]): number {
  const p = part.trim();
  if (/^\d{1,2}$/.test(p)) {
    const n = Number(p);
    return n >= 1 && n <= sources.length ? n : 0;
  }
  const key = normTitle(p);
  const at = sources.findIndex((s) => s.id === p || normTitle(s.titel) === key);
  return at + 1;
}

/** The source numbers a bracket names, or null when it names none. */
function citeNumbers(inside: string, sources: readonly Source[]): number[] | null {
  const text = inside.replace(/^källa:?\s*/i, "").trim();
  if (!text) return null;
  const whole = sourceNumber(text, sources);
  if (whole) return [whole];
  // Several: "A; B" (titles may hold commas), or numbers "1, 3".
  const parts = /^\d{1,2}(?:\s*,\s*\d{1,2})+$/.test(text) ? text.split(",") : text.split(";");
  if (parts.length < 2) return null;
  const out = parts.map((p) => sourceNumber(p, sources));
  return out.every(Boolean) ? out : null;
}

/** The numbers of the sources an answer's text cites, in order of first mention. */
export function citedNumbers(blocks: readonly Block[]): number[] {
  const out: number[] = [];
  const walk = (parts: readonly Inline[]) => {
    for (const p of parts) if (p.t === "cite" && !out.includes(p.n)) out.push(p.n);
  };
  for (const b of blocks) {
    if (b.kind === "p" || b.kind === "h") walk(b.parts);
    else b.items.forEach(walk);
  }
  return out;
}

export function parseInline(text: string, sources: readonly Source[] = []): Inline[] {
  const out: Inline[] = [];
  const push = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last?.t === "text") last.v += v;
    else out.push({ t: "text", v });
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "\n") {
      out.push({ t: "br" });
      i++;
      continue;
    }
    if (c === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        out.push({ t: "b", v: text.slice(i + 2, end) });
        i = end + 2;
        continue;
      }
    }
    if (c === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        out.push({ t: "code", v: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (c === "[") {
      const end = text.indexOf("]", i + 1);
      const numbers = end > i + 1 && end - i <= 200 && sources.length ? citeNumbers(text.slice(i + 1, end), sources) : null;
      if (numbers) {
        // A mark sits right after its word: the space before it goes.
        const last = out[out.length - 1];
        if (last?.t === "text") last.v = last.v.replace(/\s+$/, "");
        for (const n of numbers) out.push({ t: "cite", n });
        i = end + 1;
        continue;
      }
    }
    push(c);
    i++;
  }
  return out;
}

/** The answer's text as blocks. While it streams, a source mark not yet closed at the end is held back (no flicker). */
export function parseAnswer(whole: string, ids: readonly Source[] = [], streaming = false): Block[] {
  const text = streaming ? whole.replace(/\[[^\]\n]{0,200}$/, "") : whole;
  const blocks: Block[] = [];
  let para: string[] = [];
  type Open = { kind: "ul" | "ol"; items: string[]; start: number };
  // (cast: the list is also changed inside flushList, which narrowing does not see)
  let list = null as Open | null;
  const flushPara = () => {
    if (para.length) blocks.push({ kind: "p", parts: parseInline(para.join("\n"), ids) });
    para = [];
  };
  const flushList = () => {
    if (list) blocks.push({ kind: list.kind, start: list.start, items: list.items.map((item) => parseInline(item, ids)) });
    list = null;
  };
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const number = NUMBER.exec(line);
    if (heading) {
      flushPara();
      flushList();
      blocks.push({ kind: "h", parts: parseInline(heading[1], ids) });
    } else if (bullet || number) {
      flushPara();
      const kind = bullet ? "ul" : "ol";
      if (list?.kind !== kind) {
        flushList();
        list = { kind, items: [], start: number ? Number(number[1]) : 1 };
      }
      list!.items.push(bullet ? bullet[1] : number![2]);
    } else if (list && /^\s{2,}\S/.test(raw)) {
      // An indented line continues the list item above it.
      list.items[list.items.length - 1] += " " + line.trim();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return blocks;
}

/** The answer as plain text (for copying): without bold marks, with the source marks as [n]. */
export function plainAnswer(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").trim();
}
