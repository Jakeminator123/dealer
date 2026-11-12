// The bot's client: the shapes of the server's routes (cloud/, another builder's), a reader for the answer's event
// stream, the calls the panel makes, and a small fake of the same routes behind ?fejk=1 (kept for looking at the panel
// without a server, and for the kit). Nothing here shows a cost: the answer's token counts are read and never shown.
// Pure where it can be: the stream reader and the error words are tested in studio/tests/bot-client.test.ts.
//
// The routes (fixed):
//   POST /api/bot       {fraga, niva, trad, vy, bild} → text/event-stream: kallor, text (many), klar, fel; ":" lines beat
//   POST /api/utkast    {trad, vy} → {rubrik, typ, sammanfattning, forslag}
//   GET  /api/onskemal  → {poster}; POST /api/onskemal {vem, typ, rubrik, text, vy, sammanfattning, forslag, bild} → {id}
//   GET  /api/onskemal/<id>/bild → PNG

// ── Shapes ──────────────────────────────────────────────────────────────────
export type Niva = "snabb" | "grundlig";
export type Roll = "du" | "bot";
export type TradLine = { roll: Roll; text: string };
/** What the view shows: its name, its address, what is chosen there in Jakob's words. */
export type Vy = { namn: string; adress: string; val: Record<string, string> };
export type BotQuestion = { fraga: string; niva: Niva; trad: TradLine[]; vy: Vy | null; bild: string | null };
export type Kalla = { id: string; titel: string };
export type BotDone = { modell: string; niva: Niva; tokensIn: number; tokensUt: number; kallor: string[] };
export type ServerFelKod = "tak" | "for_manga" | "modell" | "indata" | "ingen_nyckel";
/** The server's own codes, and the client's: no network, logged out, no bot in this copy, too big, cut off, server. */
export type FelKod = ServerFelKod | "natverk" | "utloggad" | "saknas" | "for_stor" | "avbrutet" | "server";
export type BotFel = { kod: FelKod; text: string };

export type RequestKind = "fel" | "onskemal" | "fraga" | "ide";
export type RequestStatus = "ny" | "sedd" | "planerad" | "pagar" | "klar" | "avbojd" | "fraga_tillbaka";
export type Draft = { rubrik: string; typ: RequestKind; sammanfattning: string; forslag: string };
export type Post = {
  id: string;
  skapad: string;
  vem: string;
  typ: RequestKind;
  rubrik: string;
  text: string;
  vy: Vy | null;
  sammanfattning: string;
  forslag: string;
  harBild: boolean;
  status: RequestStatus;
  svar: string | null;
  andrad: string;
};
export type NewPost = Omit<Post, "id" | "skapad" | "harBild" | "status" | "svar" | "andrad"> & { bild: string | null };

/** The picture sent with a question or a request: one PNG data URL of at most about 1,5 MB. */
export const PICTURE_LIMIT = 1_500_000;
export const QUESTION_LIMIT = 2000;
/** How much of the conversation goes with a question. */
export const THREAD_LIMIT = 12;

// ── The event stream ────────────────────────────────────────────────────────
export type SseEvent = { event: string; data: string };

/**
 * A reader for text/event-stream, fed in pieces as they come: events end at an empty line, "data:" lines are joined with
 * a new line, lines that start with ":" are comments (the server's heartbeat while the model thinks). Lines may end with
 * \n, \r\n or \r, also when a piece ends between \r and \n.
 */
export function createSseParser(onEvent: (event: SseEvent) => void, onComment?: (text: string) => void) {
  let buffer = "";
  let name = "";
  let data: string[] = [];
  let skipNewline = false;
  const line = (raw: string) => {
    if (raw === "") {
      if (data.length) onEvent({ event: name || "message", data: data.join("\n") });
      name = "";
      data = [];
      return;
    }
    if (raw.startsWith(":")) {
      onComment?.(raw.slice(1).trim());
      return;
    }
    const colon = raw.indexOf(":");
    const field = colon < 0 ? raw : raw.slice(0, colon);
    let value = colon < 0 ? "" : raw.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") name = value;
    else if (field === "data") data.push(value);
  };
  return {
    push(chunk: string) {
      if (!chunk) return;
      let text = chunk;
      if (skipNewline && text.startsWith("\n")) text = text.slice(1);
      skipNewline = false;
      buffer += text;
      for (;;) {
        const at = buffer.search(/[\r\n]/);
        if (at < 0) break;
        const crlf = buffer[at] === "\r" && buffer[at + 1] === "\n";
        if (buffer[at] === "\r" && at === buffer.length - 1) skipNewline = true; // \n may come in the next piece
        line(buffer.slice(0, at));
        buffer = buffer.slice(at + (crlf ? 2 : 1));
      }
    },
    end() {
      if (buffer) line(buffer);
      buffer = "";
      line("");
    },
  };
}

// ── Words for what went wrong ───────────────────────────────────────────────
const SERVER_CODES: readonly ServerFelKod[] = ["tak", "for_manga", "modell", "indata", "ingen_nyckel"];
const FALLBACK: Record<FelKod, string> = {
  tak: "Dagens tak för frågor är nått. Försök igen i morgon, eller skriv ett önskemål till Jakob.",
  for_manga: "Många frågar just nu. Vänta en halv minut och försök igen.",
  modell: "Boten fick inget svar från sin modell. Försök igen om en stund.",
  indata: "Frågan gick inte att läsa. Skriv om den och försök igen.",
  ingen_nyckel: "Boten är inte påslagen i den här kopian ännu.",
  natverk: "Kunde inte nå boten. Kontrollera nätet och försök igen.",
  utloggad: "Du har loggats ut. Ladda om sidan och logga in igen.",
  saknas: "Boten finns inte i den här kopian ännu.",
  for_stor: "Bilden är för stor. Ta en mindre bild och försök igen.",
  avbrutet: "Svaret bröts innan det var klart. Försök igen.",
  server: "Något gick fel hos boten. Försök igen om en stund.",
};

/** The server's own {kod, text} when an answer carries one, else null. */
export function readFel(value: unknown): BotFel | null {
  if (!value || typeof value !== "object") return null;
  const { kod, text } = value as { kod?: unknown; text?: unknown };
  if (typeof kod !== "string" || !SERVER_CODES.includes(kod as ServerFelKod)) return null;
  return { kod: kod as ServerFelKod, text: typeof text === "string" && text.trim() ? text.trim() : FALLBACK[kod as ServerFelKod] };
}

/** An HTTP answer that is not the stream, in plain Swedish (the server's own words when it sent them). */
export function httpProblem(status: number, body: unknown): BotFel {
  const own = readFel(body);
  if (own) return own;
  if (status === 401 || status === 403) return { kod: "utloggad", text: FALLBACK.utloggad };
  if (status === 404 || status === 405 || status === 501) return { kod: "saknas", text: FALLBACK.saknas };
  if (status === 413) return { kod: "for_stor", text: FALLBACK.for_stor };
  if (status === 429) return { kod: "for_manga", text: FALLBACK.for_manga };
  if (status === 0) return { kod: "natverk", text: FALLBACK.natverk };
  return { kod: "server", text: FALLBACK.server };
}

export const felText = (kod: FelKod): string => FALLBACK[kod];

/** A thrown error from a call, with its words. */
export class BotError extends Error {
  readonly fel: BotFel;
  constructor(fel: BotFel) {
    super(fel.text);
    this.name = "BotError";
    this.fel = fel;
  }
}

async function bodyOf(response: Response): Promise<unknown> {
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

// ── The fake (?fejk=1) ──────────────────────────────────────────────────────
const FAKE_KEY = "studio.fejk";

/** Whether the panel talks to the fake: ?fejk=1 turns it on for this tab, ?fejk=0 off. Read only in the browser. */
export function fakeOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const asked = new URLSearchParams(window.location.search).get("fejk");
    if (asked === "1") window.sessionStorage.setItem(FAKE_KEY, "1");
    if (asked === "0") window.sessionStorage.removeItem(FAKE_KEY);
    return window.sessionStorage.getItem(FAKE_KEY) === "1";
  } catch {
    return new URLSearchParams(window.location.search).get("fejk") === "1";
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((done, fail) => {
    const timer = setTimeout(done, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        fail(new DOMException("Avbruten", "AbortError"));
      },
      { once: true },
    );
  });

type FakeAnswer = { kallor: Kalla[]; text: string };
const K = {
  lage: { id: "handoff-lage", titel: "HANDOFF › Läget just nu" },
  bank: { id: "bank-kanter", titel: "Klippbanken › Filmerna per kant" },
  primara: { id: "guide-primara", titel: "Studion › Primära" },
  scout: { id: "readme-mal", titel: "README › Slutmålet Scoutgaming" },
  drift: { id: "drift-regler", titel: "DRIFT › Vad som inte flyttas från Scout" },
  ord: { id: "guide-ord", titel: "Studion › Jakobs ord för ankarna" },
  vy: { id: "guide-vy", titel: "Studion › Vyerna" },
};

/** The fake's answers: shaped like real ones (sources first, each claim marked with its section's title in brackets, as
 * the server asks the model to), never real advice. Written here with [n]; the titles go in on the way out. */
export function fakeAnswer(question: string, vy: Vy | null): FakeAnswer {
  const { kallor, text } = fakeText(question, vy);
  return { kallor, text: text.replace(/\[(\d)\]/g, (_, n: string) => `[${kallor[Number(n) - 1]?.titel ?? n}]`) };
}

function fakeText(question: string, vy: Vy | null): FakeAnswer {
  const q = question.toLowerCase();
  if (/läge|banken|status/.test(q))
    return {
      kallor: [K.lage, K.bank, K.primara],
      text:
        "Kort sagt: rundan går att spela hela vägen, men flera platser spelar fortfarande en variant i stället för en tagning Jakob har godkänt rakt av [1].\n\n" +
        "- **Godkända:** plats 1, 4 och 5 har en giv och en retur som Jakob har godkänt [2].\n" +
        "- **Varianter:** given till plats 2, 3, 6 och 7 spelar en variant just nu.\n" +
        "- **Lucka:** dealerns andra kort (A2.1 → DC2) har ingen spelbar tagning; allt där är underkänt [2].\n\n" +
        "Ingen film har en Primär ännu. Det väljer Jakob själv i vyn Primära [3].",
    };
  if (/väntar|jakob/.test(q))
    return {
      kallor: [K.lage, K.primara],
      text:
        "Tre saker väntar på Jakobs beslut [1]:\n\n" +
        "1. **Primär per film.** Ingen film har en Primär ännu; varje val är hans eget klick [2].\n" +
        "2. **Nya tagningar i Granska.** De som inte har något omdöme ligger i kön där.\n" +
        "3. **Dealerns andra kort.** Filmen dit saknas och behöver göras om [1].",
    };
  if (/scout/.test(q))
    return {
      kallor: [K.scout, K.drift],
      text:
        "Scoutgaming är slutmålet: dealern ska spelas upp där, som film eller i 3D-scenen [1].\n\n" +
        "Studion och labbet är verkstaden. Spelreglerna, slumpen och kortens värden stannar i Scout och flyttas aldrig hit [2]. " +
        "Det som byggs här är filmerna och hur de sätts ihop till en runda; när de håller måttet förs de över i ett eget, uttryckligt steg.",
    };
  if (/ankare|2\.1|a2/.test(q))
    return {
      kallor: [K.ord, K.vy],
      text:
        "Ankare 2.1 är **nypet vid skons fönster**: handen håller kortet i skon och är redo att dela ut [1].\n\n" +
        "- **A1** är vila.\n- **A2.1** är nypet vid fönstret.\n- **A2.2** är när handen lämnar kortet vid skons mun.\n\n" +
        "En giv skrivs som Jakob skriver den: ”A2.1 - P4C1 - A2.1” är från nypet till plats 4:s första kort och tillbaka [2].",
    };
  const where = vy ? `Du tittar på ${[vy.namn, ...Object.values(vy.val)].join(" · ")}. ` : "";
  return {
    kallor: [K.vy],
    text: `${where}Det här är ett låtsassvar från provläget: den riktiga boten svarar ur projektets underlag, med källa på varje påstående [1].`,
  };
}

async function fakeAsk(q: BotQuestion, handlers: AskHandlers, signal: AbortSignal): Promise<void> {
  if (/testa fel/i.test(q.fraga)) {
    await sleep(600, signal);
    handlers.fel({ kod: "tak", text: FALLBACK.tak });
    return;
  }
  const answer = fakeAnswer(q.fraga, q.vy);
  const thinking = q.niva === "grundlig" ? 4500 : 900;
  for (let t = 0; t < thinking; t += 1500) {
    await sleep(Math.min(1500, thinking - t), signal);
    handlers.beat();
  }
  handlers.kallor(answer.kallor);
  const words = answer.text.split(/(?<=\s)/);
  for (let i = 0; i < words.length; i += 3) {
    await sleep(28 + Math.round(Math.random() * 30), signal);
    handlers.text(words.slice(i, i + 3).join(""));
  }
  handlers.klar({ modell: "fejk", niva: q.niva, tokensIn: 0, tokensUt: 0, kallor: answer.kallor.map((k) => k.id) });
}

/** The fake's draft: the last question as the heading, the answer's first sentence as the summary. */
export function fakeDraft(trad: readonly TradLine[], vy: Vy | null): Draft {
  const mine = [...trad].reverse().find((l) => l.roll === "du")?.text.trim() ?? "";
  const bot = [...trad].reverse().find((l) => l.roll === "bot")?.text.trim() ?? "";
  const typ: RequestKind = /fel|fungerar inte|konstig|hoppar|glapp/i.test(mine) ? "fel" : /\?\s*$/.test(mine) ? "fraga" : /kanske|tänk om|idé/i.test(mine) ? "ide" : "onskemal";
  const firstSentence = (bot.split(/\n\s*\n/)[0] ?? "").replace(/\s*\[[^\]\n]{1,200}\]/g, "").replace(/\*\*/g, "").split(/(?<=[.!?])\s/)[0] ?? "";
  return {
    rubrik: mine ? (mine.length > 70 ? `${mine.slice(0, 67).trimEnd()}…` : mine) : "",
    typ,
    sammanfattning: firstSentence ? `Boten svarade: ${firstSentence}` : vy ? `Gäller ${vy.namn}.` : "",
    forslag: mine ? "Jakob tittar på det och svarar här." : "",
  };
}

const FAKE_POSTS = "studio.fejk.onskemal";
const fakePicture = (id: string) => `studio.fejk.bild.${id}`;

function fakeSeed(): Post[] {
  const day = 86_400_000;
  const at = (ago: number) => new Date(Date.now() - ago).toISOString();
  return [
    {
      id: "fejk-3",
      skapad: at(2 * 3_600_000),
      vem: "Provperson",
      typ: "ide",
      rubrik: "Kan dealern le lite mellan givarna?",
      text: "Hon ser väldigt allvarlig ut när hon väntar vid skon. Ett litet leende ibland hade känts mer välkomnande.",
      vy: { namn: "Spela", adress: "/studio/", val: { runda: "A1 - A2.1 - P4C1 - A1" } },
      sammanfattning: "Önskar en mjukare min hos dealern i vilan mellan givarna.",
      forslag: "Pröva en vila med ett kort leende som variant.",
      harBild: false,
      status: "ny",
      svar: null,
      andrad: at(2 * 3_600_000),
    },
    {
      id: "fejk-2",
      skapad: at(1.2 * day),
      vem: "Provperson",
      typ: "fel",
      rubrik: "Kortet landar för långt till vänster på plats 2",
      text: "När kortet kommer fram till plats 2 hamnar det nästan utanför den markerade rutan.",
      vy: { namn: "Karta", adress: "/studio/karta/?kant=READY%3EP2.C1", val: { kant: "A2.1 → P2C1" } },
      sammanfattning: "Given till plats 2 landar till vänster om kortets plats.",
      forslag: "Kontrollera tagningen som spelar på A2.1 → P2C1.",
      harBild: false,
      status: "planerad",
      svar: "Bra fångat. Det är en variant som spelar där just nu; jag gör om den filmen i nästa omgång.",
      andrad: at(3 * 3_600_000),
    },
    {
      id: "fejk-1",
      skapad: at(3 * day),
      vem: "Provperson",
      typ: "fraga",
      rubrik: "Vad betyder ankare 2.2?",
      text: "Jag ser A2.2 på kartan men förstår inte skillnaden mot A2.1.",
      vy: { namn: "Karta", adress: "/studio/karta/", val: {} },
      sammanfattning: "Frågar vad som skiljer ankare 2.2 från 2.1.",
      forslag: "",
      harBild: false,
      status: "klar",
      svar: "A2.1 är när handen nyper kortet i skons fönster. A2.2 är ett steg senare: handen lämnar kortet vid skons mun.",
      andrad: at(2.5 * day),
    },
  ];
}

function fakeRead(): Post[] {
  try {
    const raw = window.localStorage.getItem(FAKE_POSTS);
    if (raw) return JSON.parse(raw) as Post[];
  } catch {
    /* no storage: the seed every time */
  }
  return fakeSeed();
}

function fakeWrite(posts: Post[]) {
  try {
    window.localStorage.setItem(FAKE_POSTS, JSON.stringify(posts));
  } catch {
    /* storage full or closed: the post lives until reload */
  }
}

// ── The calls ───────────────────────────────────────────────────────────────
export type AskHandlers = {
  kallor: (kallor: Kalla[]) => void;
  text: (piece: string) => void;
  klar: (done: BotDone) => void;
  fel: (fel: BotFel) => void;
  /** Something came (a heartbeat or a piece): the bot is alive. */
  beat: () => void;
};

/** How long without a byte (not even a heartbeat) before the answer is given up. */
const SILENCE_MS = 120_000;

/** Asks the bot; the answer comes to the handlers piece by piece. Resolves when the answer is done or has failed. */
export async function askBot(question: BotQuestion, handlers: AskHandlers, signal: AbortSignal): Promise<void> {
  if (fakeOn()) {
    try {
      await fakeAsk(question, handlers, signal);
    } catch (error) {
      if (!signal.aborted) handlers.fel({ kod: "server", text: error instanceof Error ? error.message : FALLBACK.server });
    }
    return;
  }
  let response: Response;
  try {
    response = await fetch("/api/bot", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(question),
      credentials: "same-origin",
      signal,
    });
  } catch {
    if (!signal.aborted) handlers.fel(httpProblem(0, null));
    return;
  }
  const type = response.headers.get("content-type") ?? "";
  if (!response.ok || !type.includes("text/event-stream") || !response.body) {
    handlers.fel(httpProblem(response.ok && !type.includes("text/event-stream") ? 404 : response.status, await bodyOf(response)));
    return;
  }

  let ended = false;
  const finish = (call: () => void) => {
    if (ended) return;
    ended = true;
    call();
  };
  const parser = createSseParser(
    ({ event, data }) => {
      handlers.beat();
      let value: unknown = null;
      try {
        value = JSON.parse(data);
      } catch {
        value = null;
      }
      if (event === "kallor" && Array.isArray(value))
        handlers.kallor(value.filter((k): k is Kalla => !!k && typeof k.id === "string").map((k) => ({ id: k.id, titel: typeof k.titel === "string" ? k.titel : k.id })));
      else if (event === "text" && value && typeof (value as { t?: unknown }).t === "string") handlers.text((value as { t: string }).t);
      else if (event === "klar") {
        const done = (value ?? {}) as Partial<BotDone>;
        finish(() =>
          handlers.klar({
            modell: String(done.modell ?? ""),
            niva: done.niva === "grundlig" ? "grundlig" : "snabb",
            tokensIn: Number(done.tokensIn ?? 0),
            tokensUt: Number(done.tokensUt ?? 0),
            kallor: Array.isArray(done.kallor) ? done.kallor.filter((k): k is string => typeof k === "string") : [],
          }),
        );
      } else if (event === "fel") finish(() => handlers.fel(readFel(value) ?? { kod: "server", text: FALLBACK.server }));
    },
    () => handlers.beat(),
  );

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let silence: ReturnType<typeof setTimeout> | null = null;
  const quiet = () => {
    if (silence) clearTimeout(silence);
    silence = setTimeout(() => void reader.cancel().catch(() => {}), SILENCE_MS);
  };
  quiet();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      quiet();
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } catch {
    if (signal.aborted) return;
  } finally {
    if (silence) clearTimeout(silence);
  }
  if (!signal.aborted) finish(() => handlers.fel({ kod: "avbrutet", text: FALLBACK.avbrutet }));
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "same-origin" });
  } catch {
    throw new BotError(httpProblem(0, null));
  }
  const value = await bodyOf(response);
  if (!response.ok) throw new BotError(httpProblem(response.status, value));
  return value as T;
}

const KINDS: readonly RequestKind[] = ["fel", "onskemal", "fraga", "ide"];
const STATUSES: readonly RequestStatus[] = ["ny", "sedd", "planerad", "pagar", "klar", "avbojd", "fraga_tillbaka"];

/** A draft from the server, made safe to show: unknown kinds become a request, missing words empty. */
export function readDraft(value: unknown): Draft {
  const d = (value ?? {}) as Partial<Record<keyof Draft, unknown>>;
  const s = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  return { rubrik: s(d.rubrik), typ: KINDS.includes(d.typ as RequestKind) ? (d.typ as RequestKind) : "onskemal", sammanfattning: s(d.sammanfattning), forslag: s(d.forslag) };
}

/** The quick model's draft of a request from the conversation and the view. */
export async function draftRequest(trad: TradLine[], vy: Vy | null): Promise<Draft> {
  if (fakeOn()) {
    await sleep(800);
    return fakeDraft(trad, vy);
  }
  return readDraft(await postJson<unknown>("/api/utkast", { trad, vy }));
}

/** One post as the list shows it; a post that cannot be read is left out. */
export function readPost(value: unknown): Post | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== "string" || !p.id) return null;
  const s = (x: unknown) => (typeof x === "string" ? x : "");
  const vy = p.vy && typeof p.vy === "object" ? (p.vy as Vy) : null;
  return {
    id: p.id,
    skapad: s(p.skapad),
    vem: s(p.vem).trim() || "Okänd",
    typ: KINDS.includes(p.typ as RequestKind) ? (p.typ as RequestKind) : "onskemal",
    rubrik: s(p.rubrik).trim() || "Utan rubrik",
    text: s(p.text),
    vy: vy && typeof vy.namn === "string" ? { namn: vy.namn, adress: typeof vy.adress === "string" ? vy.adress : "", val: vy.val && typeof vy.val === "object" ? vy.val : {} } : null,
    sammanfattning: s(p.sammanfattning),
    forslag: s(p.forslag),
    harBild: p.harBild === true,
    status: STATUSES.includes(p.status as RequestStatus) ? (p.status as RequestStatus) : "ny",
    svar: typeof p.svar === "string" && p.svar.trim() ? p.svar : null,
    andrad: s(p.andrad) || s(p.skapad),
  };
}

/** Every request, as everyone logged in sees them. */
export async function listRequests(): Promise<Post[]> {
  if (fakeOn()) {
    await sleep(250);
    return fakeRead();
  }
  let response: Response;
  try {
    response = await fetch("/api/onskemal", { cache: "no-store", credentials: "same-origin" });
  } catch {
    throw new BotError(httpProblem(0, null));
  }
  const value = await bodyOf(response);
  if (!response.ok) throw new BotError(httpProblem(response.status, value));
  const list = (value as { poster?: unknown } | null)?.poster;
  return Array.isArray(list) ? list.map(readPost).filter((p): p is Post => !!p) : [];
}

/** Sends one request to Jakob; only ever called from his press on "Skicka till Jakob". */
export async function sendRequest(post: NewPost): Promise<{ id: string }> {
  if (fakeOn()) {
    await sleep(500);
    const now = new Date().toISOString();
    const id = `fejk-${Date.now().toString(36)}`;
    const { bild, ...rest } = post;
    if (bild) {
      try {
        window.localStorage.setItem(fakePicture(id), bild);
      } catch {
        /* too big for storage: the post keeps no picture */
      }
    }
    fakeWrite([{ ...rest, id, skapad: now, andrad: now, harBild: !!bild, status: "ny", svar: null }, ...fakeRead()]);
    return { id };
  }
  const answer = await postJson<{ id?: unknown }>("/api/onskemal", post);
  return { id: typeof answer?.id === "string" ? answer.id : "" };
}

/** Where a request's picture is read from (the fake keeps its pictures in the browser). */
export function requestPictureUrl(id: string): string | null {
  if (fakeOn()) {
    try {
      return window.localStorage.getItem(fakePicture(id));
    } catch {
      return null;
    }
  }
  return `/api/onskemal/${encodeURIComponent(id)}/bild`;
}
