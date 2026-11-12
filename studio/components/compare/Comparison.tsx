"use client";

// <Comparison edge={edge} a={take} b={take} role="primar" takes={edgeTakes} onPick={(side, id) => …} />
// Two takes of one edge as flat films: A the candidate, B the primary. Side by side, or in the same place (key X switches
// between them; both stay loaded and in step, which is the best way to see a difference). One transport for both: both
// start on the same frame (from the start, or aligned on the landing frame when both have one), ±1 frame moves both,
// one speed, one loop. While they play A leads and B is kept with it (lib/sync.ts follow): nudged when a frame or more
// off, sought when far off, held on its first or last frame where it has none. Under them: what differs in facts, and
// Jakob's decision for A ("Primär" makes A the take that plays on the edge).
import { Columns2, Layers } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Edge, Take } from "../../../src/clip-graph.ts";
import { takeNames } from "../../lib/names.ts";
import { ROLE_LABEL, compareFacts, type PartnerRole } from "../../lib/review.ts";
import { canAlignLanding, clampFrame, filmRange, follow, partnerFrame, partnerPosition, type Align, type Clip } from "../../lib/sync.ts";
import { verdictOf } from "../../lib/verdict.ts";
import { FilmPlayer, ownsKeys, Transport, type FilmMark, type FilmPlayerHandle } from "../player";
import { DecisionBar, TakeChip } from "../takes";
import { Badge, Kbd, SegmentedControl, Select, Tooltip, cn } from "../ui";

type Side = "a" | "b";

/** How far ahead of where B should be a seek aims, for the time the seek itself takes (seconds of B's play). */
const SEEK_LEAD = 0.08;
/** A side's header and the gap under it, in px. */
const HEADER = 40;
/** The films' row is never lower than this (px) when they need more: the page scrolls to the decision instead. */
const MIN_ROW = 400;

const clipOf = (take: Take, player: FilmPlayerHandle | null): Clip | null => {
  const range = player?.range() ?? filmRange(take.frames, take.segment);
  return range ? { fps: take.fps ?? 30, range, speed: take.speed || 1, landing: take.landingFrame } : null;
};

/** What the page can read while it plays (data-* on the stage): both frames on screen, the frame B should show, the largest difference. */
type Stats = { max: number; samples: number; same: number; one: number; more: number; seeks: number };
const freshStats = (): Stats => ({ max: 0, samples: 0, same: 0, one: 0, more: 0, seeks: 0 });

export function Comparison({
  edge,
  a,
  b,
  role,
  takes,
  onPick,
}: {
  edge: Edge;
  a: Take;
  b: Take;
  role: PartnerRole | null;
  /** Every take of the edge with a film: the pickers' choices. */
  takes: readonly Take[];
  onPick: (side: Side, id: string) => void;
}) {
  const refA = useRef<FilmPlayerHandle>(null);
  const refB = useRef<FilmPlayerHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"side" | "same">("side");
  const [shown, setShown] = useState<Side>("a");
  const [align, setAlign] = useState<Align>("start");
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [frameA, setFrameA] = useState(0);
  const [frameB, setFrameB] = useState(0);
  const [holdB, setHoldB] = useState<"before" | "after" | null>(null);
  const names = useMemo(() => takeNames(edge.takes), [edge.takes]);
  const nameOf = (t: Take) => names.get(t.id) ?? t.id;

  const landingOk = useMemo(() => {
    const ca = clipOf(a, null);
    const cb = clipOf(b, null);
    return !!ca && !!cb && canAlignLanding(ca, cb);
  }, [a, b]);
  const alignNow: Align = align === "landing" && landingOk ? "landing" : "start";

  // What the loop and the handlers read, current without new listeners.
  const cur = useRef({ a, b, align: alignNow });
  cur.current = { a, b, align: alignNow };
  const lastA = useRef<number | null>(null);
  const lastB = useRef<number | null>(null);
  const holdRef = useRef<"before" | "after" | null>(null);
  const stats = useRef<Stats>(freshStats());
  // The pair goes round its loop together: A stops on its last frame, both are put on their first, both play again.
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const restarting = useRef(false);
  const wanted = useRef(false); // play was asked for and not taken back
  // The films' row is no taller than the films need at their width: what is left goes below, not around them.
  const [rowHeight, setRowHeight] = useState<number | null>(null);
  const [aspect, setAspect] = useState(1.5);

  const clips = () => {
    const A = refA.current;
    const B = refB.current;
    const ca = clipOf(cur.current.a, A);
    const cb = clipOf(cur.current.b, B);
    return A && B && ca && cb ? { A, B, ca, cb } : null;
  };

  /** B to the frame it shows beside A's frame, paused. */
  const placeB = useCallback(async (fa: number) => {
    const c = clips();
    if (!c) return;
    const p = partnerFrame(c.ca, c.cb, fa, cur.current.align);
    setHoldB(p.hold);
    await c.B.cue(p.frame);
  }, []);

  /** Both to one of A's frames, paused. */
  const cueBoth = useCallback(
    async (f: number) => {
      const c = clips();
      if (!c) return;
      const fa = clampFrame(f, c.ca.range);
      await Promise.all([c.A.cue(fa), placeB(fa)]);
    },
    [placeB],
  );

  const play = useCallback(async (round = false) => {
    const c = clips();
    if (!c) return;
    wanted.current = true;
    let fa = c.A.frame();
    if (fa >= c.ca.range.end || fa < c.ca.range.start) fa = c.ca.range.start;
    await cueBoth(fa);
    if (!wanted.current) return; // paused while they were put in place
    if (!round) stats.current = freshStats();
    c.B.setRate(c.B.baseRate());
    const p = partnerFrame(c.ca, c.cb, fa, cur.current.align);
    void c.A.play({ restart: false });
    if (!p.hold) void c.B.play({ restart: false });
  }, [cueBoth]);

  const pause = useCallback(() => {
    wanted.current = false;
    refA.current?.pause();
    refB.current?.pause();
    if (restarting.current) {
      restarting.current = false;
      setPlaying(false);
    }
  }, []);
  const toggle = useCallback(() => (refA.current?.playing() || restarting.current ? pause() : void play()), [pause, play]);

  /** A started or stopped. Stopped on its last frame with the loop on: both go round together, and it counts as still playing. */
  const onPlayingA = useCallback(
    (now: boolean) => {
      const A = refA.current;
      const end = A?.range()?.end;
      if (!now && loopRef.current && A && end !== undefined && A.frame() >= end) {
        restarting.current = true;
        void play(true).finally(() => (restarting.current = false));
        return;
      }
      if (now || !restarting.current) setPlaying(now);
    },
    [play],
  );
  const step = useCallback((n: number) => void cueBoth((refA.current?.frame() ?? 0) + n), [cueBoth]);

  // A stopped (by a click, or at its end without loop): both are put on the frame A stopped at, exactly (a video can show
  // one more frame after it is paused, so the frame is read from its time, not from the last one reported).
  useEffect(() => {
    if (playing) return;
    refB.current?.pause();
    const A = refA.current;
    if (A) void cueBoth(Math.floor(A.position() + 1e-6));
  }, [playing, cueBoth]);

  // A new pair, or a new alignment: B to A's frame.
  useEffect(() => {
    if (!refA.current?.playing()) void placeB(refA.current?.frame() ?? 0);
  }, [a.id, b.id, alignNow, placeB]);

  // While they play: keep B with A, and measure how far apart the frames on screen are.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let busy = false;
    let quietUntil = 0;
    let prevA: number | null = null;
    const tick = () => {
      const c = clips();
      if (c && !busy && !restarting.current) {
        const { A, B, ca, cb } = c;
        const { align } = cur.current;
        const expected = partnerPosition(ca, cb, A.position(), align);
        const act = follow({ expected, actual: B.position(), rate: B.rate(), base: B.baseRate(), fps: cb.fps, range: cb.range, playing: B.playing() });
        if (act.action === "rate") B.setRate(act.rate);
        else if (act.action === "hold") {
          busy = true;
          void B.cue(act.frame).finally(() => (busy = false));
        } else if (act.action === "seek") {
          busy = true;
          stats.current.seeks++;
          quietUntil = performance.now() + 400;
          const lead = Math.round(cb.fps * B.baseRate() * SEEK_LEAD);
          void B.cue(clampFrame(act.frame + lead, cb.range))
            .then(() => (A.playing() ? B.play({ restart: false }) : undefined))
            .finally(() => (busy = false));
        }
        // The frames on screen: A's, B's, and the one B should show beside A's.
        const fa = lastA.current;
        const fb = lastB.current;
        if (fa !== null && fb !== null) {
          const p = partnerFrame(ca, cb, fa, align);
          if (p.hold !== holdRef.current) {
            holdRef.current = p.hold;
            setHoldB(p.hold);
          }
          const jumped = prevA !== null && Math.abs(fa - prevA) > 3;
          prevA = fa;
          if (jumped) quietUntil = performance.now() + 400; // A went round its loop: B is sought, not measured
          if (!p.hold && !busy && performance.now() > quietUntil) {
            const d = Math.abs(p.frame - fb);
            const s = stats.current;
            s.samples++;
            s.max = Math.max(s.max, d);
            if (d === 0) s.same++;
            else if (d === 1) s.one++;
            else s.more++;
          }
          const el = stage.current;
          if (el) {
            el.dataset.aFrame = String(fa);
            el.dataset.bFrame = String(fb);
            el.dataset.bExpected = String(p.frame);
            el.dataset.sync = JSON.stringify(stats.current);
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  // Keys: Space plays, ← → one frame (Shift: ten), X switches A and B in the same place, Esc goes back to side by side.
  const swap = useCallback(() => {
    setMode((m) => {
      if (m === "side") {
        setShown("b");
        return "same";
      }
      setShown((s) => (s === "a" ? "b" : "a"));
      return m;
    });
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || ownsKeys(event.target, event.key)) return;
      if (event.key === " ") toggle();
      else if (event.key === "ArrowLeft" || event.key === "ArrowRight") step((event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 10 : 1));
      else if (event.key === "x" || event.key === "X") swap();
      else if (event.key === "Escape" && mode === "same") setMode("side");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, step, swap, mode]);

  const same = mode === "same";
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      const column = same ? width : (width - 16) / 2;
      setRowHeight(Math.round((same ? 0 : HEADER) + column / aspect));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [same, aspect]);

  const ca = clipOf(a, refA.current);
  const cb = clipOf(b, refB.current);
  const marks: FilmMark[] = [];
  if (a.landingFrame !== null) marks.push({ frame: a.landingFrame, label: "Landning A", kind: "landing" });
  if (ca && cb && b.landingFrame !== null && alignNow === "start") {
    const at = Math.round(partnerPosition(cb, ca, b.landingFrame + 0.5, "start") - 0.5);
    if (at >= ca.range.start && at <= ca.range.end && at !== a.landingFrame) marks.push({ frame: at, label: "Landning B", kind: "chapter" });
  }
  const facts = compareFacts(a, b);
  const options = takes.map((t) => ({ value: t.id, label: nameOf(t), hint: verdictOf(t).label }));

  const side = (which: Side): ReactNode => {
    const take = which === "a" ? a : b;
    const ref = which === "a" ? refA : refB;
    const visible = !same || shown === which;
    const f = which === "a" ? frameA : frameB;
    return (
      <section
        key={which}
        aria-label={which === "a" ? "A, kandidaten" : "B, att jämföra mot"}
        aria-hidden={!visible || undefined}
        className={cn("flex min-h-0 min-w-0 flex-col gap-2", same && "[grid-area:1/1]", same && !visible && "pointer-events-none opacity-0", same && visible && "z-10")}
      >
        <header className={cn("flex h-8 min-w-0 items-center gap-2", same && "hidden")}>
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-md text-sm font-bold", which === "a" ? "bg-brass text-brass-ink" : "bg-overlay text-ink ring-1 ring-line-strong")}>
            {which.toUpperCase()}
          </span>
          <Select aria-label={which === "a" ? "Tagning A" : "Tagning B"} size="sm" value={take.id} onChange={(id) => onPick(which, id)} options={options} className="w-52 min-w-0 shrink" />
          <TakeChip take={take} size="sm" />
          {which === "b" && role && role !== "vald" ? (
            <span className="truncate text-xs text-faint">{role === "primar" ? "kantens Primär" : `${ROLE_LABEL[role].toLowerCase()} · ingen Primär satt`}</span>
          ) : which === "a" ? (
            <span className="truncate text-xs text-faint">kandidaten</span>
          ) : null}
        </header>
        <FilmPlayer
          ref={ref}
          src={take.media.video ?? null}
          fps={take.fps}
          frames={take.frames}
          range={take.segment}
          speed={take.speed}
          rate={rate}
          onRateChange={setRate}
          loop={false}
          controls={false}
          onToggle={toggle}
          label={which === "a" ? "Film A" : "Film B"}
          className="min-h-0 flex-1"
          onFrame={(n) => {
            if (which === "a") {
              lastA.current = n;
              setFrameA(n);
            } else {
              lastB.current = n;
              setFrameB(n);
            }
          }}
          onPlayingChange={which === "a" ? onPlayingA : undefined}
          onLoaded={which === "a" ? (info) => info.width && info.height && setAspect(info.width / info.height) : undefined}
          overlay={
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2.5">
              {same ? (
                <span className="flex items-center gap-2 rounded-md bg-black/60 px-2.5 py-1.5 text-sm font-semibold text-ink backdrop-blur-sm">
                  <span className={cn("grid size-6 place-items-center rounded-sm text-xs font-bold", which === "a" ? "bg-brass text-brass-ink" : "bg-ink text-canvas")}>{which.toUpperCase()}</span>
                  {nameOf(take)}
                  <TakeChip take={take} size="sm" />
                </span>
              ) : (
                <span />
              )}
              <span className="rounded-xs bg-black/60 px-1.5 py-0.5 text-2xs text-ink tabular-nums backdrop-blur-sm">
                ruta {f}
                {which === "b" && holdB ? <span className="text-anmarkning"> · {holdB === "before" ? "väntar på start" : "slut"}</span> : null}
              </span>
            </div>
          }
        />
      </section>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-5 pb-4 pt-4 [scrollbar-gutter:stable]">
      {same ? (
        <div role="radiogroup" aria-label="Visas" className="flex h-8 shrink-0 items-center justify-center gap-2">
          {(["a", "b"] as const).map((which) => {
            const take = which === "a" ? a : b;
            const on = shown === which;
            return (
              <button
                key={which}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setShown(which)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors duration-150",
                  on ? "border-brass/70 bg-brass/12 text-ink" : "border-line-strong bg-raised text-dim hover:text-ink",
                )}
              >
                <span className={cn("grid size-5 place-items-center rounded-xs text-2xs font-bold", which === "a" ? "bg-brass text-brass-ink" : "bg-ink text-canvas")}>{which.toUpperCase()}</span>
                {nameOf(take)}
                <TakeChip take={take} size="sm" />
              </button>
            );
          })}
          <span className="ml-2 flex items-center gap-1.5 text-xs text-faint">
            <Kbd>X</Kbd> byter
          </span>
        </div>
      ) : null}
      <div
        ref={stage}
        data-compare
        // As tall as the films need at their width, and on a small screen never under MIN_ROW (the page scrolls instead).
        style={{ maxHeight: rowHeight ?? undefined, minHeight: rowHeight ? Math.min(rowHeight, MIN_ROW) : MIN_ROW }}
        className={cn("grid flex-1 gap-4", same ? "grid-cols-1" : "grid-cols-2")}
      >
        {side("a")}
        {side("b")}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface px-3 py-2">
        <Transport
          className="min-w-[520px] flex-1"
          playing={playing}
          onToggle={toggle}
          onStep={step}
          onSeek={(f) => void cueBoth(f)}
          frame={frameA}
          range={ca?.range ?? null}
          frames={a.frames}
          rate={rate}
          onRate={setRate}
          loop={loop}
          onLoop={setLoop}
          marks={marks}
        />
        <span aria-hidden className="h-5 w-px bg-line-strong" />
        <Tooltip content={landingOk ? "Var de börjar visas samtidigt" : "Landningen går bara när båda tagningarna har en landningsruta"}>
          <span>
            <SegmentedControl
              label="Samma ruta"
              size="sm"
              value={alignNow}
              onChange={setAlign}
              options={[
                { value: "start", label: "Från start" },
                { value: "landing", label: "Vid landning", disabled: !landingOk },
              ]}
            />
          </span>
        </Tooltip>
        <SegmentedControl
          label="Visning"
          size="sm"
          value={mode}
          onChange={(m) => {
            setMode(m);
            if (m === "same") setShown("a");
          }}
          options={[
            { value: "side", label: "Sida vid sida", icon: <Columns2 />, title: "A och B bredvid varandra" },
            {
              value: "same",
              label: (
                <>
                  Samma plats <Kbd className="h-4 min-w-4 px-1 text-[10px]">X</Kbd>
                </>
              ),
              icon: <Layers />,
              title: "A och B på samma plats: X byter mellan dem",
            },
          ]}
        />
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-4">
        <section aria-label="Skillnader" className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3">
          <h2 className="text-xs font-medium uppercase tracking-[0.06em] text-faint">Fakta</h2>
          <dl className="grid grid-cols-[auto_auto_auto] items-baseline justify-start gap-x-8 gap-y-1 text-sm">
            <span />
            <span className="text-2xs font-semibold text-brass">A</span>
            <span className="text-2xs font-semibold text-dim">B</span>
            {facts.map((row) => (
              <div key={row.key} className="contents">
                <dt className="text-faint">{row.label}</dt>
                <dd className={cn("truncate tabular-nums", row.differs ? "font-medium text-ink" : "text-dim")}>{row.a}</dd>
                <dd className={cn("truncate tabular-nums", row.differs ? "font-medium text-ink" : "text-dim")}>
                  {row.differs ? row.b : <span className="text-faint">samma</span>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-label="Beslut för A" className="flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-surface px-4 py-3">
          <h2 className="flex min-w-0 items-center gap-2 text-xs text-faint">
            <span className="font-medium uppercase tracking-[0.06em]">Beslut för A</span>
            <Badge tone="brass">{nameOf(a)}</Badge>
            <span className="truncate">Primär: A spelas på den här filmen i stället för B</span>
          </h2>
          <DecisionBar take={a} compact />
        </section>
      </div>
    </div>
  );
}
