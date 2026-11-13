// Plays the game's beats as film: the dealer deals when the engine says so and rests in between.
//
// A step of the game is a chain of beats (src/game-director.ts). The clip bank picks a take per beat and where to cut it
// (resolveRound); this file hands the chain to the scene's film queue, with what the rendered cards need for each part: the
// card the film carries (its landing quad and its value) and the cards already lying on the table. Between steps it plays the
// rest loop the lab uses (pickIdle). The film queue itself belongs to the 3D scene (players.play in src/scene3d-film.ts).
import {resolveRound, pickIdle, idleRange, idleExit, IDLE_RULE, type Graph, type Take, type Segment} from './clip-graph.ts';
import type {CardRecord} from './card-overlay.ts';
import {slotOf, slotLabel, type Layout, type Pt, type TableCards} from './game-table.ts';
import {planBeats, type Beat, type FilmSignal} from './game-director.ts';

// What this file uses of the scene's film queue.
// frame: a film whose picture is not the standard frame (the entrance and the exit, drawn behind the table) says so in its
// record as motion.frame; the scene reads it from the part (FilmFrame in src/scene3d-film.ts).
export type FilmPart = {path: string; start?: number; end?: number | null; rate?: number; track?: unknown; cards?: Record<string, unknown>; frame?: unknown; fps?: number; sound?: boolean};
const frameOf = (take: Take | null | undefined) => (take?.motion?.motion as {frame?: unknown} | undefined)?.frame ?? null;
// A film that is not 30 frames a second says so in the bank (take.fps); its frame numbers are its own.
const fpsOf = (take: Take | null | undefined) => typeof take?.fps === 'number' && take.fps > 0 && take.fps !== 30 ? {fps: take.fps} : {};
export type FilmPlayers = {
  play(parts: FilmPart[], options?: {loop?: boolean; cut?: boolean; onPart?(index: number): void; onEnd?(): void}): unknown;
  hurry(rate: number): void; preload?(paths: string[]): void;
};
export type Placed = {quad: Pt[]; back: boolean; target: string; shoeDraw: number};

/** The lying cards as the card layer takes them: each on its own place in the layout, closed if its record says so. */
export function placedCards(table: TableCards, records: CardRecord[], lying: number[], layout: Layout): Placed[] {
  return lying.flatMap(shoeDraw => { const slot = slotOf(table, shoeDraw); return slot ? [{quad: layout.quad(slot), back: records.find(r => r.shoeDraw === shoeDraw)?.faceDown === true, target: slotLabel(slot), shoeDraw}] : []; });
}
/** What the card layer needs for one beat: the lying cards, every card's value, and for the film's own card where it lands. */
export function cardOptions(beat: Pick<Beat, 'own' | 'lying'>, table: TableCards, records: CardRecord[], layout: Layout): Record<string, unknown> {
  const base = {placed: placedCards(table, records, beat.lying, layout), cards: records};
  if (!beat.own) return base;
  const material = layout.material(beat.own.slot);
  return {...base, land: layout.quad(beat.own.slot), target: beat.own.label, shoeDraw: beat.own.shoeDraw, bend: material.bend, gloss: material.gloss};
}

export function createFilm(players: FilmPlayers, graph: Graph, layout: Layout, readJson: (path: string) => Promise<unknown>, random: () => number = Math.random) {
  let table: TableCards = {hands: [], dealer: []}, records: CardRecord[] = [], lying: number[] = [];
  let token = 0, resting: Take | null = null; const played: string[] = [], tracks = new Map<string, Promise<unknown>>();
  const trackOf = (take: Take | null) => { const path = take?.media.track; if (!path) return Promise.resolve(null); let hit = tracks.get(path); if (!hit) { hit = readJson(path).catch(() => null); tracks.set(path, hit); } return hit; };
  // Each plan card's centre in film pixels: the clip bank uses them to say how far a shared seat film's card is moved.
  const places: Record<string, Pt> = {};
  for (let seat = 0; seat <= 7; seat++) for (const index of [0, 1]) places[`${seat ? `P${seat}` : 'D'}.C${index + 1}`] = layout.centre({owner: seat ? 'P' : 'D', seat, hand: 0, hands: 1, index});

  // ── rest: short clips that all begin and end on the same frame, one after the other until a step takes over ──
  function rest() {
    const mine = ++token, pick = pickIdle(graph.edge['IDLE>IDLE']?.takes ?? [], played, random());
    if (!pick?.take.media.video) { resting = null; return; }
    const take = pick.take, range = idleRange(take.frames ?? 90);
    resting = take; played.push(take.id); played.splice(0, Math.max(0, played.length - 12));
    void trackOf(take).then(track => { if (mine !== token) return;
      players.play([{path: take.media.video!, start: range.start, end: range.end, ...fpsOf(take), track, cards: cardOptions({own: null, lying}, table, records, layout)}], {onEnd: () => { if (mine === token) rest(); }}); });
  }

  // A card whose deal has no film that can be played (none made, or the only take rejected) is laid without a hand.
  const filmless = (target: string) => !resolveRound(graph, [{from: 'READY', to: target}], {places})[0]?.video;
  /**
   * Plays one step of the game. signals: the engine's signals for the step. next: the table and card values after it.
   * landed(beat) is called when a beat's film has ended (a dealt card lies there, the hole card is open); a beat without
   * a playable film lands at once, in order. Resolves when the chain has played; the rest loop then goes on with the new table.
   */
  async function play(signals: FilmSignal[], next: {table: TableCards; records: CardRecord[]}, landed: (beat: Beat, index: number) => void = () => {}): Promise<{gaps: string[]; beats: Beat[]}> {
    const mine = ++token, leaving = resting; resting = null;
    const beats = planBeats(next.table, lying, signals, filmless);
    table = next.table; records = next.records;
    // PLACE beats have no edge; the others are resolved as one chain, so each deal is cut where its return begins.
    const filmed = beats.map((b, i) => b.step ? i : -1).filter(i => i >= 0), resolved: Segment[] = resolveRound(graph, filmed.map(i => beats[i].step!), {places});
    const segments: (Segment | null)[] = beats.map(() => null); filmed.forEach((i, k) => { segments[i] = resolved[k]; });
    const gaps = beats.flatMap((b, i) => b.kind === 'PLACE' ? [`${b.own!.label}: ingen spelbar film, kortet läggs utan hand`] : !segments[i]?.video ? [`${segments[i]?.id}: ${segments[i]?.gap ?? 'ingen film'}`] : []);
    const loaded = await Promise.all(segments.map(s => trackOf(s?.video ? s.take : null)));
    if (mine !== token) return {gaps, beats};
    // A hole card that is turned later in this chain stays closed and without a value until that beat.
    const turn = beats.findIndex(b => b.kind === 'REVEAL'), hole = turn >= 0 ? beats[turn].own!.shoeDraw : null;
    const closed = hole === null ? records : records.map(r => r.shoeDraw === hole ? {...r, r: null, s: null, faceDown: true} : r);
    const parts: FilmPart[] = [], beatOf: number[] = [];
    segments.forEach((s, i) => { if (!s?.video) return; beatOf.push(i); parts.push({path: s.video, start: s.start, end: s.end, track: loaded[i], cards: cardOptions(beats[i], table, i < turn ? closed : records, layout), frame: frameOf(s.take), ...fpsOf(s.take)}); });
    let done = 0; // beats landed so far, in order
    const land = (upTo: number) => { for (; done < upTo; done++) { const beat = beats[done]; if (beat.own && beat.kind !== 'DEAL' && !lying.includes(beat.own.shoeDraw)) lying = [...lying, beat.own.shoeDraw]; landed(beat, done); } };
    if (!parts.length) { land(beats.length); rest(); return {gaps, beats}; }
    await new Promise<void>(resolve => {
      // A calm rest clip is cut at once; a gesture is played out faster, so that it lands, and the chain starts after it.
      const cut = !leaving || idleExit(leaving) === 'CUT'; if (!cut) players.hurry(IDLE_RULE.exitRate);
      players.preload?.(parts.map(p => p.path));
      players.play(parts, {cut, onPart: index => { if (mine === token) land(beatOf[index]); }, onEnd: () => { if (mine === token) land(beats.length); resolve(); }});
    });
    if (mine === token) rest();
    return {gaps, beats};
  }
  /**
   * The dealer is changed: she stands up and leaves, the table stands empty (away() is awaited then, and is given the film
   * that comes next; the page may change what it shows), and a dealer comes in and sits down. True when rest has begun again; false when the bank has no film to
   * leave with or to arrive with, and nothing is played then. Only between rounds: no card lies on the table. `own`: films
   * the page brings itself, played instead of the bank's (a stand-in while the bank has no approved film for the change).
   */
  async function swap(away: (arrive: FilmPart[]) => void | Promise<void> = () => {}, own: {leave?: FilmPart[]; arrive?: FilmPart[]} | null = null): Promise<boolean> {
    const part = (s: Segment | undefined): FilmPart[] => s?.video ? [{path: s.video, start: s.start, end: s.end, track: null, frame: frameOf(s.take), ...fpsOf(s.take)}] : [];
    const banked = (from: string, to: string) => part(resolveRound(graph, [{from, to}], {places})[0]); // the bank's own film comes first; the page's stands in where the bank has none
    let leave = banked('IDLE', 'AWAY'), arrive = banked('AWAY', 'IDLE'); if (!leave.length) leave = own?.leave ?? []; if (!arrive.length) arrive = own?.arrive ?? [];
    if (!leave.length || !arrive.length) return false;
    const mine = ++token, leaving = resting; resting = null;
    const run = (parts: FilmPart[], cut: boolean) => new Promise<void>(resolve => players.play(parts, {cut, onEnd: resolve}));
    const cut = !leaving || idleExit(leaving) === 'CUT'; if (!cut) players.hurry(IDLE_RULE.exitRate);
    players.preload?.([...leave, ...arrive].map(p => p.path));
    await run(leave, cut); if (mine !== token) return true;
    await away(arrive); if (mine !== token) return true;
    await run(arrive, true); if (mine === token) rest();
    return true;
  }
  return {
    play, rest, swap,
    set(next: {table: TableCards; records: CardRecord[]; lying: number[]}) { table = next.table; records = next.records; lying = [...next.lying]; rest(); },
    get lying() { return [...lying]; },
  };
}
