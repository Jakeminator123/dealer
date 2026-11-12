"use client";

// The bot's state for the whole copy, held in the shell so the conversation stays while the view changes: the lines,
// the question on its way, the panel's open state, width and level, the picture to send, the pen, and the request card.
// It exists only in the online copy (lib/mode.ts) and, for looking at it without a server, behind ?fejk=1.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BotError, QUESTION_LIMIT, askBot, draftRequest, fakeOn, sendRequest, type Niva, type RequestKind, type Vy } from "../../lib/bot-client.ts";
import { readView, useCurrentView, type CurrentView } from "../../lib/context.ts";
import { isSnapshot, readMeta, swedishMoment } from "../../lib/mode.ts";
import { captureTab, captureView, checkFile } from "../krita/capture";
import type { Marked } from "../krita/KritaEditor";
import type { Shape } from "../krita/model";
import { headingFrom } from "../requests/status";
import { useRequests } from "../requests/RequestsProvider";
import { useToast } from "../ui/Toast";
import { KEYS, readJsonValue, readText, writeJsonValue, writeText } from "./storage";
import { fromKept, newId, questionOf, threadOf, threadThrough, toKeep, type BotLine, type DuLine, type Line } from "./thread";

export const WIDTH = { min: 360, max: 560, start: 400 } as const;

/** A picture made with the pen, ready to go with a question or a request. */
export type Attachment = Marked;
export type PictureTarget = "fraga" | "onskemal";

export type RequestForm = {
  /** From an answer ("Gör till önskemål") or from the panel ("Tyck till"). */
  from: "svar" | "tyck";
  phase: "utkast" | "redo" | "skickar";
  /** A word when the bot could not draft. */
  note: string | null;
  typ: RequestKind;
  rubrik: string;
  text: string;
  sammanfattning: string;
  forslag: string;
  vy: Vy | null;
  bild: Attachment | null;
  /** The name written in the card the first time ("Vem är du?"). */
  vem: string;
  /** Send was pressed: the card now says what is missing. */
  tried: boolean;
};

export type BotState = {
  enabled: boolean;
  fake: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  width: number;
  setWidth: (width: number) => void;
  level: Niva;
  setLevel: (level: Niva) => void;
  /** The view on screen and whether it goes with the next question. */
  view: CurrentView | null;
  contextOn: boolean;
  setContextOn: (on: boolean) => void;
  lines: Line[];
  busy: boolean;
  draft: string;
  setDraft: (text: string) => void;
  ask: (text?: string) => void;
  stop: () => void;
  retry: (botId: string) => void;
  clear: () => void;
  attachment: Attachment | null;
  setAttachment: (a: Attachment | null) => void;
  taking: boolean;
  takePicture: (how: "vy" | "flik" | File, target: PictureTarget) => Promise<void>;
  editor: { blob: Blob; shapes: Shape[]; target: PictureTarget } | null;
  editPicture: (a: Attachment, target: PictureTarget) => void;
  closeEditor: (marked: Marked | null) => void;
  request: RequestForm | null;
  startRequest: (from: string | null) => void;
  updateRequest: (patch: Partial<RequestForm>) => void;
  cancelRequest: () => void;
  submitRequest: () => Promise<void>;
  name: string;
  setName: (name: string) => void;
  /** "12 nov 21:40": when the copy (and the bot's knowledge) was made. */
  underlag: string | null;
};

const Context = createContext<BotState | null>(null);

export function useBot(): BotState | null {
  return useContext(Context);
}

const clampWidth = (w: number) => Math.min(WIDTH.max, Math.max(WIDTH.min, Math.round(w)));

/** Whether the bot is here: always in the online copy; in the lab only behind ?fejk=1 (read after the first render). */
export function useBotSwitch(): { enabled: boolean; fake: boolean } {
  const [fake, setFake] = useState(false);
  useEffect(() => setFake(fakeOn()), []);
  return { enabled: isSnapshot || fake, fake };
}

export function BotProvider({ enabled, fake, children }: { enabled: boolean; fake: boolean; children: ReactNode }) {
  const toast = useToast();
  const requests = useRequests();
  const [open, setOpenState] = useState(false);
  const [width, setWidthState] = useState<number>(WIDTH.start);
  const [level, setLevelState] = useState<Niva>("snabb");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [taking, setTaking] = useState(false);
  const [editor, setEditor] = useState<BotState["editor"]>(null);
  const [request, setRequest] = useState<RequestForm | null>(null);
  const [name, setNameState] = useState("");
  const [underlag, setUnderlag] = useState<string | null>(null);
  const [offFor, setOffFor] = useState<string | null>(null);
  const view = useCurrentView();
  const abort = useRef<AbortController | null>(null);
  const linesRef = useRef<Line[]>([]);
  /** Each question's picture as the pen made it (marks and all), for a request made from its answer. This tab only. */
  const pictures = useRef(new Map<string, Attachment>());
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  // What the browser kept: the fake's switch, the panel, the level, the name, this tab's conversation.
  useEffect(() => {
    setOpenState(readText(KEYS.open, "session") === "1");
    setWidthState(clampWidth(Number(readText(KEYS.width)) || WIDTH.start));
    setLevelState(readText(KEYS.level) === "grundlig" ? "grundlig" : "snabb");
    setNameState(readText(KEYS.name) ?? "");
    setLines(fromKept(readJsonValue<unknown>(KEYS.thread, [], "session")));
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void readMeta().then((meta) => setUnderlag(meta ? swedishMoment(meta.builtAt) : null));
  }, [enabled]);
  useEffect(() => {
    if (!busy) writeJsonValue(KEYS.thread, toKeep(lines).slice(-60), "session");
  }, [lines, busy]);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    writeText(KEYS.open, next ? "1" : null, "session");
  }, []);
  const setWidth = useCallback((w: number) => {
    const next = clampWidth(w);
    setWidthState(next);
    writeText(KEYS.width, String(next));
  }, []);
  const setLevel = useCallback((next: Niva) => {
    setLevelState(next);
    writeText(KEYS.level, next);
  }, []);
  const setName = useCallback((next: string) => {
    setNameState(next);
    writeText(KEYS.name, next.trim() || null);
  }, []);

  // The chip: removed, it stays away for this view's choice; another choice brings it back.
  const contextOn = !!view && offFor !== view.key;
  const setContextOn = useCallback((on: boolean) => setOffFor(on ? null : (view?.key ?? null)), [view]);

  const patch = useCallback((id: string, change: (line: BotLine) => BotLine) => {
    setLines((all) => all.map((l) => (l.id === id && l.roll === "bot" ? change(l) : l)));
  }, []);

  const run = useCallback(
    async (bot: BotLine, question: DuLine, before: string) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setBusy(true);
      let thinking = true;
      try {
        await askBot(
          { fraga: question.text, niva: bot.niva, trad: threadOf(linesRef.current, before), vy: question.vy, bild: question.bild },
          {
            kallor: (kallor) => patch(bot.id, (l) => ({ ...l, kallor })),
            text: (piece) => {
              thinking = false;
              patch(bot.id, (l) => ({ ...l, text: l.text + piece, status: "skriver", beat: Date.now() }));
            },
            klar: (done) => patch(bot.id, (l) => ({ ...l, status: "klar", used: done.kallor })),
            fel: (fel) => patch(bot.id, (l) => ({ ...l, status: "fel", fel })),
            beat: () => {
              if (thinking) patch(bot.id, (l) => ({ ...l, beat: Date.now() }));
            },
          },
          controller.signal,
        );
      } finally {
        if (abort.current === controller) {
          abort.current = null;
          setBusy(false);
        }
      }
    },
    [patch],
  );

  const ask = useCallback(
    (given?: string) => {
      const text = (given ?? draft).trim().slice(0, QUESTION_LIMIT);
      if (!text || abort.current) return;
      const vy = contextOn ? readView() : null;
      const question: DuLine = { id: newId("du"), roll: "du", text, bild: attachment?.url ?? null, harBild: !!attachment, vy, niva: level };
      const now = Date.now();
      const bot: BotLine = { id: newId("bot"), roll: "bot", fraga: question.id, text: "", kallor: [], used: null, status: "tanker", fel: null, niva: level, started: now, beat: now };
      if (attachment) pictures.current.set(question.id, attachment);
      setLines((all) => [...all, question, bot]);
      linesRef.current = [...linesRef.current, question, bot];
      if (given === undefined) setDraft("");
      setAttachment(null);
      void run(bot, question, question.id);
    },
    [draft, contextOn, attachment, level, run],
  );

  const stop = useCallback(() => {
    const controller = abort.current;
    if (!controller) return;
    controller.abort();
    setLines((all) => all.map((l) => (l.roll === "bot" && (l.status === "tanker" || l.status === "skriver") ? { ...l, status: l.text ? "stoppad" : "fel", fel: l.text ? null : { kod: "avbrutet", text: "Du stoppade frågan." } } : l)));
  }, []);

  const retry = useCallback(
    (botId: string) => {
      if (abort.current) return;
      const old = linesRef.current.find((l): l is BotLine => l.id === botId && l.roll === "bot");
      const question = old ? questionOf(linesRef.current, old) : null;
      if (!old || !question) return;
      if (question.harBild && !question.bild) {
        toast({ tone: "info", title: "Bilden finns inte kvar", detail: "Frågan skickas utan bild." });
      }
      const now = Date.now();
      const fresh: BotLine = { ...old, text: "", kallor: [], used: null, status: "tanker", fel: null, started: now, beat: now };
      patch(botId, () => fresh);
      void run(fresh, question, question.id);
    },
    [patch, run, toast],
  );

  const clear = useCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    setLines([]);
    setRequest(null);
    pictures.current.clear();
  }, []);

  // ── Pictures ──────────────────────────────────────────────────────────────
  const takePicture = useCallback(
    async (how: "vy" | "flik" | File, target: PictureTarget) => {
      if (how instanceof File) {
        const problem = checkFile(how);
        if (problem) {
          toast({ tone: "bad", title: "Bilden gick inte att använda", detail: problem });
          return;
        }
        setEditor({ blob: how, shapes: [], target });
        return;
      }
      setTaking(true);
      try {
        const taken = how === "vy" ? await captureView() : await captureTab();
        setEditor({ blob: taken.blob, shapes: [], target });
      } catch (error) {
        // The person closed the browser's own share dialog: nothing to say.
        if (error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError")) return;
        toast({
          tone: "bad",
          title: "Bilden gick inte att ta",
          detail: how === "vy" ? "Prova Hela fliken, eller klistra in en skärmbild (Ctrl+V)." : "Klistra in en skärmbild (Ctrl+V) eller välj en fil.",
        });
      } finally {
        setTaking(false);
      }
    },
    [toast],
  );

  const editPicture = useCallback((a: Attachment, target: PictureTarget) => setEditor({ blob: a.blob, shapes: a.shapes, target }), []);

  const closeEditor = useCallback(
    (marked: Marked | null) => {
      const target = editor?.target ?? "fraga";
      setEditor(null);
      if (!marked) return;
      if (target === "onskemal") setRequest((r) => (r ? { ...r, bild: marked } : r));
      else setAttachment(marked);
    },
    [editor],
  );

  // ── Requests ──────────────────────────────────────────────────────────────
  const startRequest = useCallback(
    (from: string | null) => {
      const all = linesRef.current;
      const bot = from ? all.find((l): l is BotLine => l.id === from && l.roll === "bot") : undefined;
      const question = bot ? questionOf(all, bot) : null;
      const trad = bot ? threadThrough(all, bot.id) : threadOf(all);
      const vy = question ? question.vy : contextOn ? readView() : null;
      const own = question ? question.text : draft.trim();
      // A question's own picture goes with its request as the pen made it (kept in this tab); "Tyck till" takes the one waiting.
      const bild = question ? (pictures.current.get(question.id) ?? null) : attachment;
      const form: RequestForm = {
        from: bot ? "svar" : "tyck",
        phase: trad.length ? "utkast" : "redo",
        note: null,
        typ: "onskemal",
        rubrik: trad.length ? "" : headingFrom(own),
        text: own,
        sammanfattning: "",
        forslag: "",
        vy,
        bild,
        vem: "",
        tried: false,
      };
      if (!bot && attachment) setAttachment(null);
      if (!bot && own) setDraft("");
      setRequest(form);
      setOpen(true);
      if (!trad.length) return;
      void draftRequest(trad, vy).then(
        (d) => setRequest((r) => (r && r.phase === "utkast" ? { ...r, phase: "redo", typ: d.typ, rubrik: r.rubrik || d.rubrik || headingFrom(own), sammanfattning: d.sammanfattning, forslag: d.forslag } : r)),
        (error) =>
          setRequest((r) =>
            r && r.phase === "utkast"
              ? { ...r, phase: "redo", rubrik: r.rubrik || headingFrom(own), note: error instanceof BotError && error.fel.kod === "saknas" ? "Boten kan inte skriva utkast här ännu; skriv själv." : "Boten kunde inte skriva ett utkast; skriv själv." }
              : r,
          ),
      );
    },
    [contextOn, draft, attachment, setOpen],
  );

  const updateRequest = useCallback((change: Partial<RequestForm>) => setRequest((r) => (r ? { ...r, ...change } : r)), []);

  const cancelRequest = useCallback(() => {
    // What came from the field below comes back to it: his words and his picture.
    if (request?.from === "tyck") {
      if (request.text && !draft.trim()) setDraft(request.text);
      if (request.bild && !attachment) setAttachment(request.bild);
    }
    setRequest(null);
  }, [request, draft, attachment]);

  const submitRequest = useCallback(async () => {
    const form = request;
    if (!form || form.phase !== "redo") return;
    const vem = (name || form.vem).trim();
    const rubrik = form.rubrik.trim() || headingFrom(form.text);
    if (!vem || !rubrik || !(form.text.trim() || form.sammanfattning.trim())) {
      setRequest({ ...form, tried: true });
      return;
    }
    setRequest({ ...form, phase: "skickar" });
    try {
      await sendRequest({
        vem,
        typ: form.typ,
        rubrik,
        text: form.text.trim(),
        vy: form.vy,
        sammanfattning: form.sammanfattning.trim(),
        forslag: form.forslag.trim(),
        bild: form.bild?.url ?? null,
      });
      setName(vem);
      setRequest(null);
      setLines((all) => [...all, { id: newId("info"), roll: "info", text: `Skickat till Jakob: ”${rubrik}”`, href: "/onskemal/", link: "Se alla önskemål" }]);
      toast({ tone: "ok", title: "Skickat till Jakob", detail: rubrik });
      void requests.reload();
    } catch (error) {
      setRequest({ ...form, phase: "redo" });
      toast({ tone: "bad", title: "Önskemålet skickades inte", detail: error instanceof BotError ? error.fel.text : "Försök igen om en stund." });
    }
  }, [request, name, setName, toast, requests]);

  const value = useMemo<BotState>(
    () => ({
      enabled,
      fake,
      open,
      setOpen,
      width,
      setWidth,
      level,
      setLevel,
      view,
      contextOn,
      setContextOn,
      lines,
      busy,
      draft,
      setDraft,
      ask,
      stop,
      retry,
      clear,
      attachment,
      setAttachment,
      taking,
      takePicture,
      editor,
      editPicture,
      closeEditor,
      request,
      startRequest,
      updateRequest,
      cancelRequest,
      submitRequest,
      name,
      setName,
      underlag,
    }),
    [enabled, fake, open, setOpen, width, setWidth, level, setLevel, view, contextOn, setContextOn, lines, busy, draft, ask, stop, retry, clear, attachment, taking, takePicture, editor, editPicture, closeEditor, request, startRequest, updateRequest, cancelRequest, submitRequest, name, setName, underlag],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
