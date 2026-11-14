// Plays the game's beats as film: the dealer deals when the engine says so and rests in between.
//
// A step of the game is a chain of beats (src/game-director.ts). The clip bank picks a take per beat and where to cut it
// (resolveRound); this file hands the chain to the scene's film queue, with what the rendered cards need for each part: the
// card the film carries (its landing quad and its value) and the cards already lying on the table. Between steps it plays the
// rest loop the lab uses (pickIdle). The film queue itself belongs to the 3D scene (players.play in src/scene3d-film.ts).
//
// What she says: a talk film (a rest take on request, with sound) is played whole at rest, before a step's chain of cards or after
// it (speakMoments), or between rounds (say). A line without a film is said at the same moment, in the chat only.
import {resolveRound, pickIdle, idleRange, idleExit, effectOf, IDLE_RULE, type FilmEffect, type Graph, type Take, type Segment} from './clip-graph.ts';
import {CARRY, type CardRecord} from './card-overlay.ts';
import {slotOf, slotLabel, slotFilm, type Layout, type Pt, type TableCards} from './game-table.ts';
import {hubChain, planBeats, SEAT_HUB, STAND_IN_FILM, type Beat, type FilmSignal} from './game-director.ts';
import {placeLines, type MouthPatch} from './speech-patch.ts';

// What this file uses of the scene's film queue.
// frame: a film whose picture is not the standard frame (the entrance and the exit, drawn behind the table) says so in its
// record as motion.frame; the scene reads it from the part (FilmFrame in src/scene3d-film.ts).
// model: the film model the picture was made with (filmModel), for the scene's colour matching between models; left out when unknown.
// rest: the part is the rest loop's (rest()), which the scene never plays faster; a talk film is no rest in this sense (it has sound).
// mouth: a line said over this part from a mouth patch (src/scene3d-mouth.ts); begin is called as its sound begins, or with false
// when it could not be laid (its text then stands in the chat).
// effect: what the scene does while the part plays, from the film's record (FilmEffect in src/clip-graph.ts): a rest film's only.
export type Mouth = {patch: MouthPatch; base: string};
export type FilmPart = {path: string; start?: number; end?: number | null; rate?: number; track?: unknown; cards?: Record<string, unknown>; frame?: unknown; fps?: number; sound?: boolean; model?: string; rest?: boolean; mouth?: Mouth & {begin?: (said: boolean) => void}; effect?: FilmEffect};
/** A take's effect as a part carries it; nothing when the record asks for none. */
export const effectPart = (take: Take | null | undefined): {effect?: FilmEffect} => { const effect = effectOf(take?.motion); return effect ? {effect} : {}; };
const frameOf = (take: Take | null | undefined) => (take?.motion?.motion as {frame?: unknown} | undefined)?.frame ?? null;
// A film that is not 30 frames a second says so in the bank (take.fps); its frame numbers are its own.
const fpsOf = (take: Take | null | undefined) => typeof take?.fps === 'number' && take.fps > 0 && take.fps !== 30 ? {fps: take.fps} : {};
/**
 * The film model a take's picture was made with: its motion record's source.model ("wan3", "kling-4"). Not the order's job.model,
 * which names a cut ("utsnitt") for a take cut out of an older film. A talk film is its rest film with a new mouth
 * (speech.restFilm), so its picture, and its model, is that film's. Null when the bank does not say.
 */
export function filmModel(take: Take | null | undefined, takes: Record<string, Take> = {}): string | null {
  const own = (t: Take | null | undefined) => { const m = (t?.motion?.source as {model?: unknown} | undefined)?.model; return typeof m === 'string' && m.trim() ? m.trim() : null; };
  const rest = (take?.motion as {speech?: {restFilm?: unknown}} | null | undefined)?.speech?.restFilm;
  return (typeof rest === 'string' ? own(takes[rest]) : null) ?? own(take);
}
export type FilmPlayers = {
  play(parts: FilmPart[], options?: {loop?: boolean; cut?: boolean; onPart?(index: number): void; onEnd?(): void}): unknown;
  hurry(rate: number): void; preload?(paths: string[]): void;
  /** Stops the film on screen where it stands (true) or lets it run on (false); the next play() lets it run by itself. */
  toggle?(force?: boolean): void;
};
export type Placed = {quad: Pt[]; back: boolean; target: string; shoeDraw: number};
/**
 * The frame from which a turned card shows its face, by its track: the first face-up frame after the last face-down one (the edge-on
 * frames between them still hide it). Null without a track, or when the track never turns the card face up.
 */
export function faceFrame(track: unknown): number | null {
  const frames = (track as {frames?: {side?: string}[]} | null)?.frames; if (!Array.isArray(frames)) return null;
  let back = -1; frames.forEach((f, i) => { if (f?.side === 'BACK') back = i; });
  const at = frames.findIndex((f, i) => i > back && f?.side === 'FRONT'); return at >= 0 ? at : null;
}

/** The lying cards as the card layer takes them: each on its own place in the layout, closed if its record says so. */
export function placedCards(table: TableCards, records: CardRecord[], lying: number[], layout: Layout): Placed[] {
  return lying.flatMap(shoeDraw => { const slot = slotOf(table, shoeDraw); return slot ? [{quad: layout.quad(slot), back: records.find(r => r.shoeDraw === shoeDraw)?.faceDown === true, target: slotLabel(slot), shoeDraw}] : []; });
}
// How the card the film carries is shown while it is in her hand (src/scene3d-deal.ts, carry): 'object' (the drawn card in her hand:
// what the game does, CARRY in src/card-overlay.ts; the address's kort=hand), 'film' (the film's own card while carried, the drawn
// card from the frame it lies: kort=liggande), 'matte' (the film's card recoloured while carried: kort=matt). The cards already
// lying are drawn either way: a film lays one card and the next film does not show it.
export type Carry = 'object' | 'film' | 'matte';
// The film card's own colours recoloured in its pixels (src/scene3d-deal.ts backOf, faceOf: lab trials, "pålägg" and "underlägg"), as a
// word in the address asks for them: cardBack=dark, cardFace=paper. Without a word the part says nothing and the card layer's line holds.
export type CardWords = {back?: 'dark' | 'film'; face?: 'paper' | 'film'};
const oneOf = <T extends string>(value: string | null, words: readonly T[]): T | null => words.includes(value as T) ? value as T : null;
export const cardWords = (q: {get(name: string): string | null}): CardWords => { const back = oneOf(q.get('cardBack'), ['dark', 'film'] as const), face = oneOf(q.get('cardFace'), ['paper', 'film'] as const);
  return {...(back ? {back} : {}), ...(face ? {face} : {})}; };
/**
 * Whether the drawn cards are on, and how the card in her hand is shown, from who has a say (Jakob 2026-11-13 through the main
 * agent: a switch that turns itself on again when the frame reloads is what "bara går inte" sounds like). First a word in the
 * address: cards (1 or 0, as a link or a recording writes it) and kort (liggande, matt, hand; a kort word without cards means the
 * cards are on). Then the player's own choice in the game's menu, remembered in the browser (memory: 'on' or 'off'). Then on. A
 * look's preset has no say: every saved look carried cards on, so it turned the cards on again for whoever had not chosen. The
 * menu has one switch for the cards and none for how the card in her hand is shown (Jakob 2026-11-13: "Jag vill bara att det ska
 * bli en linje"): without a kort word it is the game's line (CARRY in src/card-overlay.ts). A browser that still
 * remembers 'lying', from the hours the menu had a second switch, reads as on.
 */
export function cardsChoice(o: {address?: boolean; kort?: string | null; memory?: string | null}): {cards: boolean; carry: Carry} {
  const word = ({liggande: 'film', matt: 'matte', hand: 'object'} as Record<string, Carry>)[o.kort ?? ''], remembered = o.memory === 'off' ? false : o.memory === 'on' || o.memory === 'lying' ? true : undefined;
  return {cards: o.address ?? (word ? true : undefined) ?? remembered ?? true, carry: word ?? CARRY};
}
/** What the card layer needs for one beat: the lying cards, every card's value, and for the film's own card where it lands and how it is carried. */
export function cardOptions(beat: Pick<Beat, 'own' | 'lying'>, table: TableCards, records: CardRecord[], layout: Layout, carry: Carry = CARRY, words: CardWords = {}): Record<string, unknown> {
  // carry goes with every part, also one that carries no card (a rest, a line, a return): the shoe's window is shown by it too
  const base = {placed: placedCards(table, records, beat.lying, layout), cards: records, carry, ...words};
  if (!beat.own) return base;
  const material = layout.material(beat.own.slot);
  return {...base, land: layout.quad(beat.own.slot), target: beat.own.label, shoeDraw: beat.own.shoeDraw, bend: material.bend, gloss: material.gloss};
}

// A line she says in a step: its talk film (null: text only) and what is done when she begins it (the page writes it in the chat).
// key: the line's key (data/speech.json), by which a mouth patch over one of the step's films is found. beat: the kind of beat the
// line belongs to when that is not the chain's first ('REVEAL': the dealer's line goes with the hole card's turn).
export type Said = {part: FilmPart | null; begin(): void; key?: string; beat?: Beat['kind']};

export function createFilm(players: FilmPlayers, bank: Graph, layout: Layout, readJson: (path: string) => Promise<unknown>, random: () => number = Math.random) {
  let graph = bank; // whose films: another dealer at the table is another graph (use)
  let table: TableCards = {hands: [], dealer: []}, records: CardRecord[] = [], lying: number[] = [];
  let token = 0, resting: Take | null = null, carry: Carry = CARRY, words: CardWords = {}, calmOnly = false, heldRest: number | null = null; const played: string[] = [], tracks = new Map<string, Promise<unknown>>();
  let mouths: () => Mouth[] = () => []; // the mouth patches the page has read and may lay now, asked for as a step begins
  const modelOf = (take: Take | null | undefined) => { const model = filmModel(take, graph.takes); return model ? {model} : {}; };
  const trackOf = (take: Take | null) => { const path = take?.media.track; if (!path) return Promise.resolve(null); let hit = tracks.get(path); if (!hit) { hit = readJson(path).catch(() => null); tracks.set(path, hit); } return hit; };
  // Each plan card's centre in film pixels: the clip bank uses them to say how far a shared seat film's card is moved.
  const places: Record<string, Pt> = {};
  for (let seat = 0; seat <= 7; seat++) for (const index of [0, 1]) places[`${seat ? `P${seat}` : 'D'}.C${index + 1}`] = layout.centre({owner: seat ? 'P' : 'D', seat, hand: 0, hands: 1, index});

  // ── rest: short clips that all begin and end on the same frame, one after the other until a step takes over ──
  /**
   * The next rest film. how.cut: shown at once from its first frame, instead of after the rest that plays (the queue's own cut).
   * how.hold: it stands on that first frame, which is the pose every rest and every talk film begins in, until the next film is
   * played or release() lets it run: a line said then begins in the very picture that is seen, and nothing has moved under a
   * film that ends in that pose.
   */
  function rest(how: {cut?: boolean; hold?: boolean} = {}) {
    // calmOnly (the page's, while a film plays before the game): only rests where she holds still, so that she sits as the film
    // ends: calm ones that may be cut (a calm rest marked cut: false is one where she turns her head or looks round the table),
    // else any calm one, else whatever she has.
    const rests = graph.edge['IDLE>IDLE']?.takes ?? [], calm = calmOnly ? rests.filter(t => t.idle?.calm === true) : [], still = calm.filter(t => t.idle?.cut !== false);
    const mine = ++token, pick = pickIdle(still.length ? still : calm.length ? calm : rests, played, random());
    if (!pick?.take.media.video) { resting = null; return; }
    const take = pick.take, range = idleRange(take.frames ?? 90);
    resting = take; played.push(take.id); played.splice(0, Math.max(0, played.length - 24)); /* long enough for the last gestures (IDLE_RULE.gestureMemory) */ heldRest = how.hold === true ? mine : null;
    void trackOf(take).then(track => { if (mine !== token) return;
      players.play([{path: take.media.video!, start: range.start, end: range.end, ...fpsOf(take), ...modelOf(take), ...effectPart(take), rest: true, track, cards: cardOptions({own: null, lying}, table, records, layout, carry, words)}], {onEnd: () => { if (mine === token) rest(); }, ...(how.cut === true ? {cut: true} : {}), ...(how.hold === true ? {onPart: () => { if (mine === token && heldRest === mine) players.toggle?.(true); }} : {})}); });
  }
  /** Lets a held rest run on (rest({hold: true})); nothing happens when another film has been played since, or none was held. */
  function release() { if (heldRest !== null && heldRest === token) players.toggle?.(false); heldRest = null; }

  // A card whose deal has no film that can be played (none made, or the only take rejected) is laid without a hand.
  const filmless = (target: string) => !resolveRound(graph, [{from: 'READY', to: target}], {places})[0]?.video;
  // A seat film whose return to rest has no film: the hand goes back to the shoe and from there to rest (planBeats).
  const toRest = (film: string) => !!resolveRound(graph, [{from: film, to: 'IDLE'}], {places})[0]?.video;
  // A card on the dealer's SEAT_HUB is dealt from that pose only when its four films can be played (hubChain). The game's graph
  // holds judged takes only (judgedBank), so these are judged too.
  const fromHub = (hub: string, film: string) => !!hubChain(graph, hub, film, places);
  /** A talk film as a part of the queue: the whole film, at rest, with the cards lying as they lie, and with sound. */
  function talkPart(clip: string): FilmPart | null {
    const take = graph.takes[clip];
    if (!take?.media.video || take.kind !== 'IDLE' || !take.idle?.onRequest || take.stage !== 'DONE' || take.decision === 'REJECTED') return null;
    return {path: take.media.video, start: 0, end: null, ...fpsOf(take), ...modelOf(take), track: null, cards: cardOptions({own: null, lying}, table, records, layout, carry, words), sound: true};
  }
  /**
   * Plays one step of the game. signals: the engine's signals for the step. next: the table and card values after it.
   * landed(beat) is called when a beat's film has ended (a dealt card lies there, the hole card is open); a beat without
   * a playable film lands at once, in order. Resolves when the chain has played; the rest loop then goes on with the new table.
   */
  async function play(signals: FilmSignal[], next: {table: TableCards; records: CardRecord[]}, landed: (beat: Beat, index: number) => void = () => {}, said: {before?: Said[]; after?: Said[]} = {}): Promise<{gaps: string[]; beats: Beat[]}> {
    const mine = ++token, leaving = resting; resting = null;
    const standIn = STAND_IN_FILM[graph.dealer] ?? {}, beats = planBeats(next.table, lying, signals, filmless, toRest, standIn, SEAT_HUB[graph.dealer] ?? {}, fromHub);
    table = next.table; records = next.records;
    // PLACE beats have no edge; the others are resolved as one chain, so each deal is cut where its return begins.
    const filmed = beats.map((b, i) => b.step ? i : -1).filter(i => i >= 0), resolved: Segment[] = resolveRound(graph, filmed.map(i => beats[i].step!), {places});
    const segments: (Segment | null)[] = beats.map(() => null); filmed.forEach((i, k) => { segments[i] = resolved[k]; });
    const gaps = beats.flatMap((b, i) => b.kind === 'PLACE' ? [`${b.own!.label}: ingen spelbar film, kortet läggs utan hand`] : !segments[i]?.video ? [`${segments[i]?.id}: ${segments[i]?.gap ?? 'ingen film'}`]
      : b.kind === 'DEAL' && b.own && b.step!.to !== slotFilm(b.own.slot) && standIn[slotFilm(b.own.slot)] === b.step!.to ? [`${b.own.label}: nödlösning, given med ${b.step!.to}s film, kortet ritat på sin egen plats`] : []);
    const loaded = await Promise.all(segments.map(s => trackOf(s?.video ? s.take : null)));
    if (mine !== token) return {gaps, beats};
    // A hole card that is turned later in this chain stays closed and without a value until that beat.
    const turn = beats.findIndex(b => b.kind === 'REVEAL'), hole = turn >= 0 ? beats[turn].own!.shoeDraw : null;
    const closed = hole === null ? records : records.map(r => r.shoeDraw === hole ? {...r, r: null, s: null, faceDown: true} : r);
    const parts: FilmPart[] = [], beatOf: number[] = [], shows: (number | null)[] = [];
    segments.forEach((s, i) => { if (!s?.video) return; beatOf.push(i);
      // the hole card's turn lands (its value and the dealer's total are shown) when its face shows in the film, not when the film ends
      const face = beats[i].kind === 'REVEAL' ? faceFrame(loaded[i]) : null; shows.push(face !== null && face > s.start && (s.end === null || face < s.end) ? (face - s.start) / (s.fps || 30) : null); parts.push({path: s.video, start: s.start, end: s.end, track: loaded[i], cards: cardOptions(beats[i], table, i < turn ? closed : records, layout, carry, words), frame: frameOf(s.take), ...fpsOf(s.take), ...modelOf(s.take)}); });
    let done = 0; // beats landed so far, in order
    const land = (upTo: number) => { for (; done < upTo; done++) { const beat = beats[done]; if (beat.own && beat.kind !== 'DEAL' && !lying.includes(beat.own.shoeDraw)) lying = [...lying, beat.own.shoeDraw]; landed(beat, done); } };
    // What she says before the cards and after them: the talk films around the chain, each line begun as its film begins.
    const before = said.before ?? [], after = said.after ?? [];
    // A line due before the chain is said over the first of its films that has a mouth patch for it (placeLines in src/speech-patch.ts:
    // the patch lies inside the part's cut, its sound begins at most 8 s after the line's own part, one line a part). Its talk film is then not
    // played, and its chat line is written as its sound begins. The others are said as before.
    const ready = mouths(), over = new Set<Said>(), chain = parts.map((p, k) => ({path: p.path, start: p.start, end: p.end, fps: p.fps ?? 30, frames: segments[beatOf[k]]?.take?.frames ?? null}));
    const due = (t: Said) => ({key: t.key ?? '', from: t.beat ? Math.max(0, beatOf.findIndex(b => beats[b].kind === t.beat)) : 0});
    if (ready.length) placeLines(before.map(due), chain, ready.map(m => m.patch)).forEach((at, k) => { if (!at) return; const t = before[k], m = ready.find(x => x.patch === at.patch)!;
      parts[at.part] = {...parts[at.part], mouth: {...m, begin: () => t.begin()}}; over.add(t); });
    const talkBefore = before.filter(t => t.part && !over.has(t)), talkAfter = after.filter(t => t.part);
    for (const t of talkBefore) t.part = {...t.part!, cards: cardOptions({own: null, lying}, table, turn >= 0 ? closed : records, layout, carry, words)};
    for (const t of talkAfter) t.part = {...t.part!, cards: cardOptions({own: null, lying: [...new Set([...lying, ...beats.filter(b => b.own).map(b => b.own!.shoeDraw)])]}, table, records, layout, carry, words)};
    for (const t of before) if (!t.part && !over.has(t)) t.begin();
    const all = [...talkBefore.map(t => t.part!), ...parts, ...talkAfter.map(t => t.part!)], lead = talkBefore.length;
    const silentAfter = () => { for (const t of after) if (!t.part) t.begin(); };
    if (!all.length) { land(beats.length); silentAfter(); rest(); return {gaps, beats}; }
    await new Promise<void>(resolve => {
      // A calm rest clip is cut at once; a gesture is played out faster, so that it lands, and the chain starts after it.
      const cut = !leaving || idleExit(leaving) === 'CUT'; if (!cut) players.hurry(IDLE_RULE.exitRate);
      players.preload?.(all.map(p => p.path));
      let afterBegun = false;
      players.play(all, {cut, onPart: index => { if (mine !== token) return;
        if (index < lead) { talkBefore[index].begin(); return; }
        if (index < lead + parts.length) { land(beatOf[index - lead]); const at = shows[index - lead], beat = beatOf[index - lead] + 1; if (at !== null) setTimeout(() => { if (mine === token) land(beat); }, at * 1000); return; }
        land(beats.length); if (!afterBegun) { afterBegun = true; silentAfter(); } talkAfter[index - lead - parts.length].begin(); },
      onEnd: () => { if (mine === token) { land(beats.length); if (!afterBegun) silentAfter(); } resolve(); }});
    });
    if (mine === token) rest();
    return {gaps, beats};
  }
  /**
   * The dealer is changed: she stands up and leaves, the table stands empty (away() is awaited then, and is given the film
   * that comes next; the page may change what it shows), and a dealer comes in and sits down. True when rest has begun again; false when the bank has no film to
   * leave with or to arrive with, and nothing is played then. Only between rounds: no card lies on the table. `own`: films
   * the page brings itself, played instead of the bank's (a stand-in while the bank has no approved film for the change).
   * next: another dealer comes in, with her own films (her graph); then a side without a film is a cut (she is cut out, or the
   * table cut to her at rest), and true means she is at the table. Without next the same dealer leaves and comes back.
   */
  async function swap(away: (arrive: FilmPart[]) => void | Promise<void> = () => {}, own: {leave?: FilmPart[]; arrive?: FilmPart[]} | null = null, next: Graph | null = null): Promise<boolean> {
    const part = (s: Segment | undefined): FilmPart[] => s?.video ? [{path: s.video, start: s.start, end: s.end, track: null, frame: frameOf(s.take), ...fpsOf(s.take), ...modelOf(s.take)}] : [];
    const banked = (of: Graph, from: string, to: string) => part(resolveRound(of, [{from, to}], {places})[0]); // the bank's own film comes first; the page's stands in where the bank has none
    let leave = banked(graph, 'IDLE', 'AWAY'), arrive = banked(next ?? graph, 'AWAY', 'IDLE'); if (!leave.length) leave = own?.leave ?? []; if (!arrive.length) arrive = own?.arrive ?? [];
    if (!next && (!leave.length || !arrive.length)) return false;
    const mine = ++token, leaving = resting; resting = null;
    const run = (parts: FilmPart[], cut: boolean) => parts.length ? new Promise<void>(resolve => players.play(parts, {cut, onEnd: resolve})) : Promise.resolve();
    const cut = !leaving || idleExit(leaving) === 'CUT'; if (!cut && leave.length) players.hurry(IDLE_RULE.exitRate);
    players.preload?.([...leave, ...arrive].map(p => p.path));
    await run(leave, cut); if (mine !== token) return true;
    if (leave.length) { await away(arrive); if (mine !== token) return true; } // without a film she leaves no empty table to wait at
    if (next) { graph = next; played.length = 0; }
    await run(arrive, true); if (mine === token) rest();
    return true;
  }
  /**
   * She says one line between steps: its talk film, whole and with sound, when she rests (no step is playing), then rest again.
   * False when there is no film for it or a step is playing; the page then shows the line as text only.
   */
  function say(clip: string, begin: () => void = () => {}): boolean {
    const part = talkPart(clip); if (!part || resting === null) return false;
    const mine = ++token, leaving = resting; resting = null;
    const cut = idleExit(leaving) === 'CUT'; if (!cut) players.hurry(IDLE_RULE.exitRate);
    players.play([part], {cut, onPart: () => { if (mine === token) begin(); }, onEnd: () => { if (mine === token) rest(); }});
    return true;
  }
  return {
    play, rest, release, swap, say, talkPart,
    /** Whether a rest asked for with hold still stands (nothing has been played since, and it has not been let go). */
    get held() { return heldRest !== null && heldRest === token; },
    /** How the carried card is shown from the next step on (Carry). */
    set carry(next: Carry) { carry = next; }, get carry() { return carry; },
    /** The film card's colours recoloured from the next step on (CardWords; {} as filmed). */
    set words(next: CardWords) { words = next; }, get words() { return words; },
    /** Only calm rest films from the next pick on (true), or the whole rotation with its gestures (false). */
    set calm(next: boolean) { calmOnly = next; }, get calm() { return calmOnly; },
    /** The mouth patches that may be laid on a step's films, asked for as each step begins (the page's, read and ready). */
    set mouths(next: () => Mouth[]) { mouths = next; },
    /** Another dealer's films from now on (she has come to the table); rest goes on with hers. */
    use(next: Graph) { graph = next; tracks.clear(); played.length = 0; },
    get graph() { return graph; },
    set(next: {table: TableCards; records: CardRecord[]; lying: number[]}) { table = next.table; records = next.records; lying = [...next.lying]; rest(); },
    get lying() { return [...lying]; },
  };
}
