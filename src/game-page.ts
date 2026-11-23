// Page code of game.html: blackjack on top of the dealer's film in the 3D scene (?dealer=<id>, or the console's Dealer menu).
//
// Three parts meet here and stay apart. The engine (game/, in the lab server behind /api/game) owns rules, shuffle, card
// values and money. The 3D scene (src/scene3d-*.ts) owns the picture and the film queue. This page owns the bets in progress
// and the order of things: it sends a command, turns the answer into film beats, lets the film play, and shows each total
// when its card has landed. Seats are 1–7, seat 1 at camera left.
//
// The look is the game's own. The studio's Casino view plays another one calibrated in its Scen view: ?forval=<preset> and
// scene keys in the address (src/game-look.ts); without them the page is as before.
//
// The game plays only takes with a verdict (judgedBank in src/game-director.ts): Jakob's, or a provisional one given in his place.
// The one exception is a talk film, a rest take on request, which is played only when the dealer says its line (src/speech-lines.ts).
// ?trad=<id> (Karta's Prova i Casino) narrows them to one tree's films (below, treeCut); ?komposition=<id> plays several trees
// put together (below, composition).
import {DEALER, buildGraph, effectOf, type Graph} from './clip-graph.ts';
import {createScene, DEFAULTS, type SceneState} from './scene3d-view.ts';
import {readRegister} from './scene3d-room.ts';
import {FILM, cameraFromContract, filmPixel, filmToScene, sceneToSpot, solveCamera, spotToScene, viewUnder, type FilmCamera} from './scene3d-geometry.ts';
import {createLayout, slotOf} from './game-table.ts';
import {tableGeometry} from './card-plan.ts';
import {GAME_OWN, OWN_WORDS} from './game-own.ts';
import {cardRecords, judgedBank, speakMoments, talkOn} from './game-director.ts';
import {cardsChoice, cardWords, createFilm, type FilmPlayers, type Said} from './game-film.ts';
import {chipsFor, mountOverlay, type Action, type Anchors} from './game-overlay.ts';
import {mountPanel} from './game-panel.ts';
import {exitView, type ExitView} from './scene3d-exit.ts';
import {tableView, tableCards, cardFaces, shownBy, shownFor, lineOf, betTotal, handKey, mayAsk, collector, stageOf, CHIP_VALUES, DEALER_KEY, type PageState, type Settled} from './game-view.ts';
import type {Snapshot} from '../game/session.ts';
import type {MouthPatch, PatchRegister} from './speech-patch.ts';

const THEMES = ['noir', 'scout', 'smaragd', 'bordeaux', 'midnatt']; // the console's themes, Scout's own (game.css)
const $ = (id: string) => document.getElementById(id)!, stage = $('stage'), picture = $('picture'), canvas = $('view') as HTMLCanvasElement, failBox = $('fail');
const fail = (message: string): never => { failBox.textContent = message; throw Error(message); };
const read = async (url: string, what: string) => { const res = await fetch(url).catch(() => null); if (!res?.ok) fail(`${what} kunde inte läsas (${url}).`); return res!.json(); };
const query = new URLSearchParams(location.search);
// Two framings, both by turning and zooming from the film camera's own place (exact for a flat film). Lying: the whole table
// with all seven rings. Standing (a stage narrower than tallBelow): the film's width is locked to the picture's, the view is
// zoomed in on seats 2–6, each ring whole inside the picture's width, her head and those rings inside a picture as short as
// 1.33 times its width, and it turns toward the seat in play. Where the console stands follows the stage's shape (placeConsole
// marks the stage, game.css lays it out): standing, under the picture; lying on a stage lower than sideBelow (a phone on its
// side), at the picture's right; else over the picture's lower edge. The film before the game (src/game-intro.ts) ends in these framings, so the
// two change together.
const FRAMING = {wide: {pitch: GAME_OWN.pitch, zoom: GAME_OWN.zoom}, tall: {pitch: -4.4, zoom: 1.55}, tallBelow: 0.8, sideBelow: 540, turnShare: 0.6, turnLimit: 40};
function placeConsole() {
  const box = stage.getBoundingClientRect(), standing = box.width / Math.max(1, box.height) < FRAMING.tallBelow;
  stage.classList.toggle('tall', standing); stage.classList.toggle('side', !standing && box.height < FRAMING.sideBelow); // the picture box follows at once (game.css)
  return standing;
}
placeConsole(); // before the film before the game is laid, so that it is laid in the picture the game will have
// A film before the game (src/game-intro.ts): ?intro=noir-3 lays the short noir trailer over the stage, with Spela and Hoppa över,
// and fades into the game when it ends (Jakob 2026-11-13: "så att man övergår till henne i URL:en på vercel. kanske genom en ny
// knapp"). It is laid before anything is read, so that it covers the first picture, and the game is built under it. The film's last
// frame is the game's own picture in the room Monaco with life in the room, so the address asks for room=monaco and roomLife=1 too.
// Until it is over she says nothing and the chat is still (introOn, in render): the press on Spela is also what lets her be heard.
const INTROS: Record<string, {film: string; poster: string}> = {'noir-3': {film: 'assets/films/intro/noir-3/film-2.mp4', poster: 'assets/films/intro/noir-3/poster.jpg'}};
const introAsked = INTROS[query.get('intro') ?? ''] as {film: string; poster: string} | undefined;
let introOn = !!introAsked, introOver = () => { introOn = false; }, introLead = () => {};
if (introAsked) void import('./game-intro.ts').then(m => m.createIntro(stage, canvas, {...introAsked, onLead: () => introLead()})).catch(() => null).then(() => introOver());
stage.dataset.theme = THEMES.includes(query.get('tema') ?? '') ? query.get('tema')! : 'noir';
// The server keeps one session per table name; a second tab or a test opens game.html?table=<name> and plays its own.
const table = /^[a-z0-9-]{1,40}$/.test(query.get('table') ?? '') ? `?table=${query.get('table')}` : '';
// A look from the studio (src/game-look.ts). Its module is read only when the address holds more than the game's own words,
// so the page without them reads and does exactly what it did before. ?inbaddad=1 (the Casino view shows the game in a
// frame) hides nothing: the frame shows none of what this page shows, and src/preview-ui.ts keeps a framed page from
// taking the lab tab by itself. The game's own words: src/game-own.ts OWN_WORDS.
const forval = query.get('forval');
const lookAsked = [...query.keys()].some(word => !OWN_WORDS.includes(word) && !['kort', 'cardBack', 'cardFace'].includes(word)); // kort, cardBack, cardFace: how the card in her hand is shown (below), not a look
// The dealers the game offers, each with her own films. ?dealer=paow (the studio's word, which the Casino view passes on) or the
// choice remembered from the console's Dealer menu; without either the first dealer (DEALER in src/clip-graph.ts: Paow).
const DEALERS = [{id: 'paow', label: 'Paow', note: 'Ny dealer, inte alla filmer än', thumb: 'assets/anchors/paow-vila-ung-2/anchor.png'}];
const dealerMemory = (() => { try { return localStorage.getItem('dealer.dealer'); } catch { return null; } })();
let dealer = DEALERS.find(d => d.id === query.get('dealer'))?.id ?? DEALERS.find(d => d.id === dealerMemory)?.id ?? DEALER;
const nameOf = (id: string) => DEALERS.find(d => d.id === id)?.label ?? id;
// One tree (?trad=<id>, Karta's Prova i Casino; Jakob 2026-11-23): her films cut to that tree's (src/dealer-trees.ts cutBank,
// from GET /api/trees?dealer=<id>&trad=<id>, tools/dealer-tree.ts treeCut). The tree's anchor at the shoe is played as the shoe,
// a take placed in no tree (Borta) follows, a take of another tree never plays, and a card the tree has no film for is laid
// without a hand. An unknown tree, a tree without films or no answer is said on the page, and the game plays as without the
// word. Without the word the game plays the trees that are spelas (src/dealer-trees.ts gameBank, from GET /api/trees?dealer=
// <id>&spel=1, tools/dealer-tree.ts gameCut): one such tree exactly as ?trad=<id> plays it; with several, the takes placed only
// in a tree being built or resting are left out, so that a tree's films do not leak into the plain game before he lets it play.
// A take of no tree stays. The copy on the net has no such list: its frozen bank carries the cut it was built with (gameCuts),
// and with neither the game plays all her judged films, saying nothing.
const treeWord = query.get('trad');
const treeRead = Promise.all([fetch(`api/trees?dealer=${encodeURIComponent(dealer)}&${treeWord === null ? 'spel=1' : `trad=${encodeURIComponent(treeWord)}`}`).then(async res => ({status: res.status, answer: await res.json().catch(() => null)}), () => null),
  import('./dealer-trees.ts').catch(() => null)]);
// Several trees put together (?komposition=<id>, Karta's Komposition; Jakob 2026-11-23): each tree plays its own films from its
// own anchors, a share says how often each is chosen, and where two trees meet a bridge is played (src/composition.ts, from
// GET /api/compositions?dealer=<id>&komposition=<id>, tools/dealer-composition.ts). The lab's only: the word is read when it is
// there, ?trad= goes first, and a composition that cannot be read, or whose trees have different hands (Jakob 2026-11-23: such
// trees are not put together), is said on the page while the game plays as without the word.
const compositionWord = treeWord === null ? query.get('komposition') : null;
const compositionRead = compositionWord === null ? null : Promise.all([fetch(`api/compositions?dealer=${encodeURIComponent(dealer)}&komposition=${encodeURIComponent(compositionWord)}`).then(async res => ({status: res.status, answer: await res.json().catch(() => null)}), () => null),
  import('./composition.ts').catch(() => null)]);

const [contract, placements, bank, first, register, lookCode, presetAnswer, treeAnswer, compositionAnswer] = await Promise.all([read('data/scene-contract.json', 'Scenkontraktet'), read('api/placements', 'Placeringsplanen'), read('api/clip-bank', 'Klippbanken'), read(`api/game${table}`, 'Spelet'), read('data/scene-rooms.json', 'Rumsregistret'),
  lookAsked ? import('./game-look.ts').catch(() => null) : null, forval ? fetch(`api/scene-presets/${encodeURIComponent(forval)}`).then(res => res.ok ? res.json() : null, () => null) : null, treeRead, compositionRead]);
const registered = readRegister(register).rooms, roomIds = lookCode ? [...lookCode.BUILT_ROOMS, ...registered.map(r => r.id)] : [];
// The look over the game's own settings: with a preset its whole look, else the address's keys; {} when none is asked for.
// What could not be used is said in one line on the page, and the game plays with its own look in its place.
const look = lookCode?.readLook(query, roomIds) ?? null, preset = lookCode && look?.forval ? lookCode.presetFrom(presetAnswer, roomIds) : null;
const asked: Partial<SceneState> = lookCode && look ? lookCode.lookState(DEFAULTS, preset?.state ?? null, look.keys, id => registered.find(r => r.id === id)?.blur ?? lookCode.BUILT_BLUR[id] ?? 11) : {};
const lookNote = lookCode && look ? lookCode.lookNotice(look.asked, !!preset, [...look.ignored, ...(preset?.dropped ?? [])]) : forval !== null ? 'Förvalet kunde inte läsas: spelet visar sitt eget utseende.' : null;
// The table's geometry (src/card-plan.ts), one for the scene and the lying cards: the address's word, else the one the preset
// was saved with (Casino's, when Jakob chose Bred lins in Scen and pressed Använd i Casino; Jakob 2026-11-21), else Standard.
const geometry = tableGeometry(location.search, preset?.geometri ?? null);
// The 360-degree rooms Jakob has let into the game (game: true in data/scene-rooms.json); a new room is tried in the lab first,
// and a look that chooses one is shown with it.
const panoramas = registered.filter(r => r.game || r.id === asked.room);
// ?fan=<px>: one fan step for every seat, for trying values; 0 and 1 are the scene's fan shadow when a look is read.
const fanWord = query.get('fan'), fanStep = fanWord !== null && Number.isFinite(Number(fanWord)) && !(lookCode && ['0', '1'].includes(fanWord)) ? Math.max(0, Math.min(80, Number(fanWord))) : null;
// The tree's cut (treeRead above, src/dealer-trees.ts treePlay), or in plain words why the game plays as without it; without
// the word, the played trees' cut (gameBank), without a line.
const treeCut = treeWord === null ? {bank: treeAnswer[1]?.gameBank(bank, treeAnswer[0], dealer) ?? bank, line: null as string | null}
  : treeAnswer[1]?.treePlay(bank, treeWord, treeAnswer[0], nameOf(dealer)) ?? {bank, line: `Trädet "${treeWord.slice(0, 40)}" kunde inte läsas. Spelet spelar som vanligt, med alla hennes filmer.`};
// The composition's cut (compositionRead above, src/composition.ts compositionPlay), or in plain words why the game plays as
// without it. With one, the bank the page plays from is its home tree's: the tree the hand rests in, with the rest and talk films.
const compositionCode = compositionAnswer?.[1] ?? null;
const composition = compositionWord === null ? {cut: null, line: null as string | null}
  : compositionCode?.compositionPlay(compositionWord, compositionAnswer![0], nameOf(dealer)) ?? {cut: null, line: `Kompositionen "${compositionWord.slice(0, 40)}" kunde inte läsas. Spelet spelar som vanligt, med alla hennes filmer.`};
const homeTree = composition.cut ? composition.cut.home ?? composition.cut.trees[0]?.tree ?? null : null;
const playedBank = composition.cut && compositionCode && homeTree ? compositionCode.treeBank(bank, composition.cut, homeTree) : treeCut.bank;
const plan = placements.plan ?? placements, judged = judgedBank(playedBank), graphs = new Map<string, Graph>(), layout = createLayout(plan, {fan: fanStep, geometry});
const graphOf = (id: string) => { let g = graphs.get(id); if (!g) { g = buildGraph(judged, {dealer: id}); graphs.set(id, g); } return g; };
const graph = graphOf(dealer);
// A rest film can ask the scene to show another room for a moment (FilmEffect in src/clip-graph.ts: the champagne film's flash turns
// the room into the gambling den). The scene must have that room to do it, though it is no room the player can choose: it is given
// to the scene and left out of the Miljö menu.
const effectRooms = new Set(Object.values(judged.motions ?? {}).map(m => effectOf(m)?.room).filter((id): id is string => !!id));
const sceneRooms = registered.filter(r => panoramas.includes(r) || effectRooms.has(r.id));
// What she says: the talk film of a line, from src/speech-lines.ts (read once, beside the page; without it she says everything as
// text, as before). ?tal=av, the look key, keeps her silent and the module is never asked.
type Spoken = {key: string; clip: string; text: string};
type SpeechLines = {PHASE_LINE?: Record<string, string>; spokenFilm(takes: unknown[], dealer: string, keyOrPhase: string, options?: {voice?: string}): Spoken | null; chatReply(takes: unknown[], dealer: string, written: string, count?: number, options?: {voice?: string}): Spoken | null};
const talking = talkOn((asked as {tal?: unknown}).tal ?? query.get('tal')), VOICE = {voice: 'Paow'}; // her own voice (data/speech.json), Jakob 2026-11-13
let lines: SpeechLines | null = null;
if (talking) void import('./speech-lines.ts').then(m => { lines = m as unknown as SpeechLines; }).catch(() => {});
const restTakes = () => film.graph.edge['IDLE>IDLE']?.takes ?? [];
/** Her talk film for a line's key or a phase, or null: no film (the chat shows the text it always did), or her lines are off. */
const spokenOf = (keyOrPhase: string): Spoken | null => talking && lines ? lines.spokenFilm(restTakes(), dealer, keyOrPhase, VOICE) : null;

// ── the picture: the 3D scene, seen a little from above so that all seven bet rings and the bar have room ──
// The scene fills the picture box (#picture). On a larger screen that is the whole stage and the console lies over its lower edge;
// on a phone it is the part of the stage the console leaves free (frame, below), so that nothing of the console covers the table.
const scene = createScene(canvas, picture, {contract, plan, urls: {plate: 'assets/scene/room.png', panorama: 'assets/scene/panorama-vegas.jpg', la: 'assets/scene/panorama-la.jpg', skog: 'assets/scene/panorama-skog.jpg'}, rooms: sceneRooms, onChange: () => {}, onMissingRoom: () => {}, geometry});
// The framings (FRAMING) stand at the top, where the stage is told its shape before the film before the game is laid.
// A look's pitch and zoom are its lying framing; its yaw, dy and dz are where the view comes to rest (all 0 in the game's own).
const lying = {pitch: asked.pitch ?? FRAMING.wide.pitch, zoom: asked.zoom ?? FRAMING.wide.zoom}, home = {yaw: asked.yaw ?? 0, dy: asked.dy ?? 0, dz: asked.dz ?? 0};
const fixed = query.has('pitch') || query.has('zoom');
let tall = false, aimed = home.yaw; // aimed: the yaw the view is easing toward, degrees
function frame() {
  const now = placeConsole(); // and the scene follows the picture box (scene.resize, below)
  if (now !== tall || !framed) { tall = now; framed = true; if (!fixed) scene.set(tall ? FRAMING.tall : lying); if (!tall) { aimed = home.yaw; scene.set({yaw: home.yaw}); } }
  scene.resize();
}
let framed = false;
// The rooms the player can choose between (the console's Bord menu): the register's rooms that are in the game, then the two
// built rooms. Each with the blur that suits it and the room sound it is heard with. The choice is kept in the browser.
const ROOMS = [
  ...panoramas.map(r => ({id: r.id, label: r.label, note: r.note, blur: r.blur, sound: r.sound})),
  {id: 'hall', label: 'Spelhallen', note: 'En spelhall med spelautomater och låg rök', blur: 11, sound: 'hall'}, {id: 'salong', label: 'Salongen', note: 'En stillsam salong', blur: 11, sound: 'salong'},
].map(r => ({...r, thumb: `assets/scene/thumbs/room-${r.id}.jpg`}));
const soundOf = (id: string) => ROOMS.find(r => r.id === id)?.sound ?? null;
const remembered = (() => { try { return localStorage.getItem('dealer.room'); } catch { return null; } })();
let room = ROOMS.find(r => r.id === (asked.room ?? query.get('room') ?? remembered))?.id ?? GAME_OWN.room;
// The drawn cards and how the card in her hand is shown (cardsChoice in src/game-film.ts): the address's cards= and kort= first, then
// the saved scene preset, then the player's remembered choice, then on. A saved look must survive an old browser setting.
const cardsMemory = (() => { try { return localStorage.getItem('dealer.cards'); } catch { return null; } })();
const cardsNow = cardsChoice({address: (look?.keys as {cards?: boolean} | undefined)?.cards, preset: preset?.state.cards, kort: query.get('kort'), memory: cardsMemory, inHand: asked.cardInHand});
scene.set({format: GAME_OWN.format, room: room as never, blur: ROOMS.find(r => r.id === room)!.blur, tray: GAME_OWN.tray, cards: GAME_OWN.cards, pitch: Number(query.get('pitch') ?? FRAMING.wide.pitch), zoom: Number(query.get('zoom') ?? FRAMING.wide.zoom)});
// The look over the game's own settings, before the first picture. A room of it that the menu does not offer (a built room
// of the lab) is shown all the same, and the menu marks none. The table is built by now, so the room is changed with a cut,
// and the look's own way of changing rooms holds from then on.
if (Object.keys(asked).length) { scene.set({...asked, roomShift: 'cut'}); if (asked.roomShift) scene.set({roomShift: asked.roomShift}); room = asked.room ?? room; }
scene.set({cards: cardsNow.cards}); // over the look: see cardsNow
// The page's one line: which tree it plays (or why none), and what of the look could not be used.
const pageNote = [treeCut.line, composition.line, lookNote].filter(Boolean).join(' · ');
if (pageNote) { const note = Object.assign(document.createElement('p'), {textContent: pageNote}); note.setAttribute('role', 'status');
  note.style.cssText = 'position:absolute;left:50%;top:12px;transform:translateX(-50%);z-index:30;margin:0;max-width:min(92%,680px);padding:6px 14px;border:1px solid rgba(226,191,109,.32);border-radius:999px;background:rgba(8,7,6,.84);color:#f6eedc;font-size:13px;pointer-events:none'; stage.append(note); }
// Under a film before the game the room's own film waits (roomLife off until the lead, roomLifeBack): it was read and played for
// the whole of that film without being seen, the heaviest thing on a phone beside the dealer's film, and begun at the lead the
// room starts from its beginning, where its people sit as in the film's last picture.
const lifeAsked = introOn && scene.state.roomLife === true; if (lifeAsked) scene.set({roomLife: false});
let lifeBack = !lifeAsked; const roomLifeBack = () => { if (lifeBack) return; lifeBack = true; scene.set({roomLife: true}); scene.restartRoomLife(); };
// Her own slow sway (dealerLife) is none under a film before the game, and comes in over SWAY_IN_MS once the game has taken over
// (swayIn, and the frame loop below). The sway is counted on the scene's clock, so with it the game had her where the film had not
// left her, differently at every visit: 5 px to the side of the film's last picture at computer size in one measured visit and 0
// in another (her face; 2026-11-14). The film's last picture is the game's picture without the sway.
const SWAY_IN_MS = 4000, swayAsked = introOn ? scene.state.dealerLife : 0; let swayFrom: number | null = null;
if (swayAsked > 0) scene.set({dealerLife: 0});
const swayIn = () => { if (swayAsked > 0 && swayFrom === null && scene.state.dealerLife === 0) swayFrom = performance.now(); };
scene.rebuild(); scene.start();
new ResizeObserver(frame).observe(stage); frame();
const film = createFilm(scene.players as unknown as FilmPlayers, graph, layout, path => fetch(path).then(res => res.ok ? res.json() : null));
// A composition: each of its trees as a graph of its own (the home tree's is the page's own), and the composer that chooses among them.
if (composition.cut && compositionCode && homeTree) { const cut = composition.cut;
  film.compose({composer: compositionCode.createComposer(cut), graphs: Object.fromEntries(cut.trees.map(t => [t.tree, t.tree === homeTree ? graph : buildGraph(judgedBank(compositionCode.treeBank(bank, cut, t.tree)), {dealer})]))}); }
// The round's tempo (Jakob 2026-11-23: "spela upp dealerklipp i 1.5x eller 2x ... sparas i en komposition"): the composition's
// goes before the look's key filmTempo, and is set as that key, so the scene's queue plays the round's films with it
// (players.tempo; rest and speech keep their speed). A tree's own tempo, and a film's own speed (the bank's playbackSpeed),
// are laid on its films by the film player (src/game-film.ts filmRate: speed times tempo, the tempo never past 2×).
{ const cut = composition.cut, code = compositionCode;
  if (cut && code) scene.set({filmTempo: code.tempoOf(cut, null, scene.state.filmTempo)});
  film.tempo = {round: () => scene.state.filmTempo, tree: id => cut && code && cut.trees.some(t => t.tree === id && t.tempo !== undefined) ? code.tempoOf(cut, id, scene.state.filmTempo) : null}; }
// A bounded local A/B trial for silent card moves; speech and idle keep their own timing.
if (query.has('dealTempo')) film.dealTempo = Number(query.get('dealTempo'));
film.calm = introOn; // under the film before the game she only rests calmly: the film ends with her at rest
// How the card in her hand is shown (src/game-film.ts Carry) is a word in the address only, for the lab and for recordings:
// kort=hand (the drawn card in her hand, overriding the scene switch), kort=liggande (the film's own card in her hand, the
// drawn card once it lies), kort=matt (the film's card recoloured in her hand).
film.carry = cardsNow.carry;
// The film card's own colours recoloured (src/game-film.ts CardWords), a lab trial for recordings and Jakob's own eye: cardBack=dark,
// cardFace=paper. Without them the game is as before.
film.words = cardWords(query);
// Her lines over the films that play (src/scene3d-mouth.ts, src/speech-patch.ts): the mouth patches of data/speech-patches.json in her
// voice and the game's language, each record checked against the register's sha256 and its film against the bank's file, and read
// ahead by the scene. A step lays a line over the first of its films that has its patch (src/game-film.ts); without the register, or
// with her lines off, she speaks as before.
type Mouth = {patch: MouthPatch; base: string};
const mouths: Mouth[] = [], mouthLayer = (scene as unknown as {mouth?: {preload(parts: Mouth[]): void; state(part: Mouth): string}}).mouth ?? null;
const sha256 = async (data: ArrayBuffer) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('');
const lineKey = (keyOrPhase: string) => lines?.PHASE_LINE?.[keyOrPhase] ?? keyOrPhase.toLowerCase();
const mouthFor = (keyOrPhase: string) => mouths.find(m => m.patch.dealer === dealer && m.patch.line.key === lineKey(keyOrPhase)) ?? null;
if (talking && mouthLayer) void fetch('data/speech-patches.json').then(res => res.ok ? res.json() : null).then(async (register: PatchRegister | null) => {
  for (const entry of register?.patches ?? []) { if (entry.voice !== VOICE.voice || entry.language !== 'sv') continue;
    const res = await fetch(entry.path).catch(() => null), data = res?.ok ? await res.arrayBuffer() : null; if (!data || await sha256(data) !== entry.sha256) continue;
    const patch = JSON.parse(new TextDecoder().decode(data)) as MouthPatch;
    const files = Object.values((bank.motions ?? {}) as Record<string, {source?: {path?: string; sha256?: string}} | null>); // a take cut out of a film names the film's file
    if (!files.some(m => m?.source?.path === patch.film.path && m.source.sha256 === patch.film.sha256)) continue; // made over another file than the bank's
    mouths.push({patch, base: entry.path.replace(/patch\.json$/, '')}); }
  mouthLayer.preload(mouths);
}).catch(() => {});
film.mouths = () => mouths.filter(m => m.patch.dealer === dealer && mouthLayer?.state(m) === 'ready');

// ── state ──
let snapshot: Snapshot = first, paid: Snapshot | null = null; // snapshot: the round on the table. paid: the engine's state after that round was collected.
const page: PageState = {stage: 'BETTING', busy: false, dealerPlays: false, bets: {}, last: null, chip: 25, balance: snapshot.balance, shown: {}, settled: null, line: null, error: null};
// A round found in progress or settled when the page opens (the server keeps the session; a reload): its cards are laid out without
// film, the hole card closed until the engine turns it, and the controls are those of the phase the engine is in (stageOf, mayAsk).
page.stage = stageOf(snapshot);
if (page.stage !== 'BETTING') { const table = tableCards(snapshot); film.set({table, records: cardRecords(table, cardFaces(snapshot)), lying: [...table.hands.flatMap(h => h.cards), ...table.dealer]}); }
// Under a film before the game her rest stands on its first picture from the start (hold): that picture is the one the film ends
// in, and standing, her film is not played under a film that covers it (on a phone three films ran at once, two of them unseen).
else film.rest(introOn ? {hold: true} : {});

// ── commands to the engine ──
async function send(command: Record<string, unknown>): Promise<Snapshot | null> {
  page.error = null;
  try {
    const res = await fetch(`api/game/command${table}`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({...command, requestId: crypto.randomUUID(), expectedVersion: (paid ?? snapshot).ver})});
    const data = await res.json(); if (!res.ok) throw Error(data.error?.message ?? 'Spelet svarade inte.');
    return data as Snapshot;
  } catch (error) { page.error = (error as Error).message; render(); return null; }
}
// The settled round's collect, sent once: asked when the round is settled (present) and again by Ny runda if that answer has not come.
const collect = collector(send);
// Plays one answered step: film first, the totals as the cards land, then the engine's state as it is.
async function present(next: Snapshot, dealerPlays: boolean) {
  const table = tableCards(next);
  const settle = next.events.find(e => e.type === 'settle') as Settled | undefined;
  // The stakes leave the balance at once; what the round pays back shows when its film has played.
  if (page.stage === 'BETTING') { page.balance -= betTotal(page.bets); page.stage = 'ROUND'; }
  page.shown = shownFor(page.shown, snapshot, next); // a total stays with its own hand through a split (src/game-view.ts)
  snapshot = next; page.busy = true; page.dealerPlays = dealerPlays;
  // Her lines in this step (the engine's speak signals): each with its talk film when there is one, written in the chat as she begins it.
  spoken.clear();
  // A line with neither a talk film nor a mouth patch is the chat's own; with a patch and no film it is written as the patch says it.
  const moments = speakMoments(next.events), saying = (key: string, beat?: Said['beat']): Said[] => { const talk = spokenOf(key), part = talk && film.talkPart(talk.clip), over = mouthFor(key); if (!(talk && part) && !over) return [];
    const text = talk && part ? talk.text : over!.patch.line.text; spoken.add(key); return [{key: lineKey(key), part: talk && part ? part : null, begin: () => chat?.say(text), ...(beat ? {beat} : {})}]; };
  // The engine says 'double' after the card it deals (game/presentation.ts), but the line belongs to the step's beginning, where the
  // other product says it (600 ms into the reach for the shoe), so it goes with the lines before the chain. When the dealer plays her
  // hand she says so ("Dealern spelar.": the phase DEALER, which the engine gives no line of its own): last, with the hole card's turn.
  const early = moments.after.filter(key => key === 'double'), later = moments.after.filter(key => key !== 'double');
  const said = {before: [...[...moments.before, ...early].flatMap(key => saying(key)), ...(dealerPlays ? saying('DEALER', 'REVEAL') : [])], after: later.flatMap(key => saying(key))};
  render();
  const result = await film.play(next.events, {table, records: cardRecords(table, cardFaces(next))}, beat => {
    if (beat.kind !== 'DEAL' && beat.kind !== 'REVEAL' && beat.kind !== 'PLACE') return;
    const event = next.events.find(e => (e.type === 'deal' || e.type === 'reveal') && e.shoeDraw === beat.own!.shoeDraw), shown = event && shownBy(event);
    if (shown) { page.shown[shown.key] = shown; render(); }
    if (heard.table && beat.own) sound?.card(beat.kind === 'REVEAL' ? 'turn' : 'land', {pan: beat.own.slot.owner === 'P' ? panOf(beat.own.slot.seat) : 0});
  }, said);
  gaps.push(...result.gaps); gaps.splice(0, Math.max(0, gaps.length - 40));
  page.busy = false; page.balance = next.balance; page.line = lineOf(next.events) ?? page.line;
  if (settle || next.view.round?.phase === 'settled') {
    page.stage = 'SETTLED'; page.settled = settle ?? page.settled; render();
    // What the round pays back reaches the balance when it is collected; the cards stay on the table until the next round.
    if (settle) settleChips(settle);
    paid = await collect(next.view.roundId); if (paid) page.balance = paid.balance;
  }
  render();
}

const round = () => snapshot.view.round;
// A chip let go over the felt lands in the nearest bet ring: past the rail the player only has to throw it roughly right.
function nearestSeat(clientX: number, clientY: number): number | null {
  const at = scene.pick(clientX, clientY); if (!at) return null;
  let best: {seat: number; distance: number} | null = null;
  for (const spot of scene.spots().bets) { const distance = Math.hypot(spot.x - at.x, spot.s - at.s); if (!best || distance < best.distance) best = {seat: Number(spot.id.slice(1)), distance}; }
  return best?.seat ?? null;
}
// Every control asks mayAsk (src/game-view.ts) first: it does only what the overlay offers it now, however it is pressed.
const controls: Parameters<typeof mountOverlay>[1] = {
  aim: nearestSeat,
  chip(value) { page.chip = value; render(); },
  bet(seat, value = page.chip) {
    if (!mayAsk(snapshot, page, 'bet')) return;
    const now = (page.bets[seat] ?? []).reduce((a, b) => a + b, 0);
    if (now + value > snapshot.limits.max || betTotal(page.bets) + value > page.balance) return;
    if (heard.table) sound?.chip(page.bets[seat]?.length ? 'stack' : 'felt', {height: page.bets[seat]?.length ?? 0, pan: panOf(seat)});
    page.bets[seat] = [...(page.bets[seat] ?? []), value]; order.push(seat); render();
    film.expect(Object.keys(page.bets).map(Number)); // her entry films are fetched now, not at Dela ut (src/game-film.ts expect)
  },
  // A chip picked up from a ring: the last one laid there. It leaves the order of laying too, so that Ångra still takes the latest.
  take(seat) {
    if (!mayAsk(snapshot, page, 'take') || !page.bets[seat]?.length) return;
    page.bets[seat] = page.bets[seat].slice(0, -1); if (!page.bets[seat].length) delete page.bets[seat];
    const at = order.lastIndexOf(seat); if (at >= 0) order.splice(at, 1); if (heard.table) sound?.chip('take', {pan: panOf(seat)}); render();
  },
  undo() { if (!mayAsk(snapshot, page, 'undo')) return; const seat = order.pop(); if (seat === undefined) return; page.bets[seat] = page.bets[seat].slice(0, -1); if (!page.bets[seat].length) delete page.bets[seat]; render(); },
  clear() { if (!mayAsk(snapshot, page, 'clear')) return; page.bets = {}; order.length = 0; render(); },
  rebet() { if (!mayAsk(snapshot, page, 'rebet') || !page.last) return; page.bets = Object.fromEntries(Object.entries(page.last).map(([seat, chips]) => [seat, [...chips]])); order.length = 0; for (const [seat, chips] of Object.entries(page.bets)) for (const _ of chips) order.push(Number(seat)); render(); film.expect(Object.keys(page.bets).map(Number)); },
  async deal() {
    if (!mayAsk(snapshot, page, 'deal')) return;
    panel.close(); // an open menu closes when the round begins
    const bets = Object.entries(page.bets).map(([seat, chips]) => ({seat: Number(seat), main: chips.reduce((a, b) => a + b, 0)}));
    // The rest on screen plays to its end and the deal follows it, with no rest queued between (src/game-film.ts leave); the loop
    // goes on if the engine does not answer. The same in every step below.
    page.busy = true; render(); film.leave();
    const next = await send({op: 'start', bets}); if (!next) { page.busy = false; render(); film.rest(); return; }
    page.last = page.bets; page.shown = {}; page.settled = null; page.line = null;
    await present(next, false);
  },
  async act(action: Action) {
    const r = round(); if (!mayAsk(snapshot, page, action) || !r || r.activeSeat === null) return;
    page.busy = true; render(); film.leave();
    const next = await send({op: 'act', seat: r.activeSeat, handIndex: r.active, action, roundId: snapshot.view.roundId, turnSeq: snapshot.view.turnSeq}); if (!next) { page.busy = false; render(); film.rest(); return; }
    await present(next, next.view.round?.phase === 'settled' || next.view.round?.phase === 'dealer');
  },
  async insurance(take: boolean) {
    if (!mayAsk(snapshot, page, 'insurance')) return; page.busy = true; render(); film.leave();
    const next = await send({op: 'insurance', roundId: snapshot.view.roundId, take}); if (!next) { page.busy = false; render(); film.rest(); return; }
    await present(next, next.view.round?.phase === 'settled');
  },
  async next() {
    if (!mayAsk(snapshot, page, 'next')) return; page.busy = true; render();
    const next = paid ?? await collect(snapshot.view.roundId); page.busy = false; if (!next) { render(); return; }
    snapshot = next; paid = null; Object.assign(page, {stage: 'BETTING', bets: {}, shown: {}, settled: null, line: null, balance: next.balance}); order.length = 0; taken.clear(); chips?.clearWinnings();
    film.set({table: {hands: [], dealer: []}, records: [], lying: []}); render();
  },
};
const overlay = mountOverlay(stage, controls);
const order: number[] = []; // the seats the chips were laid on, in order, for Ångra

// ── the console's menus (src/game-panel.ts): the room and the dealer, music and sound ──
// Sound is src/sound.ts's (the page Ljud tunes it), read the first time a menu is opened; everything is silent until the player
// switches something on. panOf: where a seat is heard, left to right.
type Sound = {unlock(): void; chip(kind: string, options?: object): void; card(kind: string, options?: object): void; ambience(room: string | null): void; music?(track: string | null): void; set(patch: object): void};
let sound: Sound | null = null, soundAsked: Promise<void> | null = null;
const heard = {table: false, ambience: false, track: null as string | null, music: 0.6}, panOf = (seat: number) => (seat - 4) / 3 * 0.8;
const loadSound = () => soundAsked ??= import('./sound.ts').then((m: {createSound(): Sound; MUSIC?: {id: string; label: string; note: string}[]}) => { sound = m.createSound(); sound.set({music: heard.music}); panel.set({tracks: m.MUSIC ?? []}); }).catch(() => {});
const withSound = (act: (s: Sound) => void) => void loadSound().then(() => { if (sound) { sound.unlock(); act(sound); } });
const panel = mountPanel(overlay.root.querySelector<HTMLElement>('.go-bar')!, ROOMS, DEALERS, {
  open() { void loadSound(); },
  room(id) {
    const next = ROOMS.find(r => r.id === id); if (!next || id === room || page.busy || page.stage === 'ROUND') return;
    room = id; // a look from the studio leaves the room the game remembers alone
    if (forval === null) try { localStorage.setItem('dealer.room', id); } catch { /* a private window keeps nothing */ }
    if (asked.roomShift === 'cut') scene.set({roomShift: 'cut', room: id, blur: next.blur} as never); // a look that changes rooms with a cut
    else scene.set({roomShift: GAME_OWN.roomShift, room: id, blur: next.blur} as never); // the background shimmers and changes under the shimmer
    if (heard.ambience) sound?.ambience(soundOf(id)); panel.set({room: id});
  },
  // She leaves, the table stands empty, the dealer chosen comes in (the same one again when she is chosen). Only the bank's judged
  // films play (src/game-film.ts swap): a dealer without one for leaving or coming is cut out or in, and the gap is kept with the others.
  async dealer(id) {
    const next = DEALERS.find(d => d.id === id) ?? DEALERS.find(d => d.id === dealer)!;
    if (page.busy || page.stage === 'ROUND') return;
    page.busy = true; page.error = 'Dealern byts …'; comeHome = false; panel.set({changing: true}); render(); chat?.say('Tack för mig. Lycka till vid bordet!');
    // The table stands empty for a moment. An entrance that shows her whole body is watched from where the camera stands, backed
    // away (its film begins with the empty table); before one that begins at the table the camera comes home.
    const away = (arrive: {frame?: unknown}[]) => new Promise<void>(resolve => { const whole = arrive.some(p => (p.frame as {layer?: string} | null | undefined)?.layer === 'BEHIND_TABLE');
      if (!whole) { comeHome = true; shot = null; } setTimeout(resolve, whole ? 700 : 1500); });
    const changed = next.id !== dealer, change = await film.swap(away, changed ? graphOf(next.id) : null), played = change.played;
    gaps.push(...change.gaps); gaps.splice(0, Math.max(0, gaps.length - 40));
    shot = null;
    if (changed && played) { dealer = next.id; chat?.dealer(next.label); panel.set({dealer});
      try { localStorage.setItem('dealer.dealer', dealer); } catch { /* a private window keeps nothing */ }
      const address = new URL(location.href); address.searchParams.set('dealer', dealer); history.replaceState(null, '', address); }
    page.busy = false; page.error = played ? null : 'Det finns ingen film för dealerbytet än.'; panel.set({changing: false}); if (played) chat?.say('Hej! Nu är det jag som delar ut.'); render();
  },
  music(track) { heard.track = track; panel.set({track}); withSound(s => s.music?.(track)); },
  level(music) { heard.music = music; panel.set({music}); sound?.set({music}); },
  table(on) { heard.table = on; panel.set({table: on}); if (on) withSound(s => s.chip('stack', {height: 1, pan: 0})); },
  ambience(on) { heard.ambience = on; panel.set({ambience: on}); withSound(s => s.ambience(on ? soundOf(room) : null)); },
  // Off: nothing is drawn over the film, lying cards included; the film's own coloured cards show and the round plays as before.
  cards(on) { scene.set({cards: on}); panel.set({cards: on}); remember(on ? 'on' : 'off'); },
});
panel.set({room, dealer, cards: scene.state.cards});
// The menu's choice is kept also under a preset; a word in the address still wins over it when the page is opened (cardsNow).
function remember(value: 'on' | 'off') { try { localStorage.setItem('dealer.cards', value); } catch { /* a private window keeps nothing */ } }
// Jakob's chip tray (assets/props/tray.glb, local media) takes the place of the built tray when it can be read; game.html?tray=built keeps the built one.
// A trial, game.html?bricka=hus: the tray holds the house's own chips (src/game3d-tray.ts), a lost bet is carried into it and winnings out of it.
type HouseTray = {mouth(value: number, taking: boolean): {x: number; y: number; s: number}; add(value: number): boolean; remove(value: number): boolean};
let houseTray: HouseTray | null = null; const taken = new Set<number>(); // the seats whose chips the house has taken this round
if (query.get('bricka') === 'hus') void import('./game3d-tray.ts').then(m => { const tray = m.createHouseTray(scene); scene.notch(tray.notch); scene.addProp(tray); houseTray = tray; }).catch(() => {});
else if (query.get('tray') !== 'built') void import('./game3d-props.ts').then(async m => { const tray = await m.loadTray(scene); scene.notch(tray.notch); scene.addProp(tray); }).catch(() => {});
// When a round is settled: a seat that got back less than it staked loses its chips to the tray, and what a seat got back
// beyond its stake is carried out of the tray and set down beside the bet. Only in the trial with the house's tray.
function settleChips(settle: Settled) {
  const tray = houseTray; if (!tray || !chips || !settle) return;
  const seats = new Map<number, {stake: number; returned: number}>();
  for (const hand of settle.hands) { const s = seats.get(hand.seat) ?? {stake: 0, returned: 0}; s.stake += hand.stake; s.returned += hand.returned; seats.set(hand.seat, s); }
  const now = seconds(), into = (value: number) => tray.mouth(value, false), outOf = (value: number) => tray.mouth(value, true);
  for (const [seat, s] of seats) {
    if (s.returned < s.stake) { taken.add(seat); chips.send(seat, into, now, value => { tray.add(value); }); if (s.returned > 0) chips.pay(seat, chipsFor(s.returned, [...CHIP_VALUES]), outOf, now + 0.7, value => { tray.remove(value); }); }
    else if (s.returned > s.stake) chips.pay(seat, chipsFor(s.returned - s.stake, [...CHIP_VALUES]), outOf, now, value => { tray.remove(value); });
  }
}
// The chips in the rings are 3D objects on the table when the module can be read; until then, and if it cannot, the overlay draws them flat.
type Spot3 = {x: number; y: number; s: number};
type Chips = {set(bets: Record<number, number[]>, now: number): void; update(now: number): boolean; send(seat: number, to: (value: number) => Spot3, now: number, arrive: (value: number) => void): void;
  pay(seat: number, values: number[], from: (value: number) => Spot3, now: number, leave: (value: number) => void): void; clearWinnings(): void};
let chips: Chips | null = null;
const seconds = () => performance.now() / 1000;
void import('./game3d-chips.ts').then(m => { const made = m.createChips(scene); if (asked.chipGloss !== undefined) made.setGloss(asked.chipGloss); scene.addProp(made); chips = made; stage.classList.add('chips3d'); render(); }).catch(() => {});
// The table chat as a dummy (src/game-chat.ts; game.html?chatt=0 leaves it out). The dealer's lines follow the round's phases and how it ended.
type Chat = {phase(phase: string, said?: string | null): void; say(text: string): void; dealer(name: string): void};
let chat: Chat | null = null, chatPhase = '', chatLine: string | null = null;
// What she answers a player is the speech's ready answer when it has one (its film plays as she answers), else the dummy's own.
const answer = (typed: string, n: number) => { const talk = talking && lines ? lines.chatReply(restTakes(), dealer, typed, n, VOICE) : null; if (!talk || !film.talkPart(talk.clip)) return null; film.say(talk.clip); return talk.text; };
if (query.get('chatt') !== '0') void import('./game-chat.ts').then(m => { chat = m.mountChat(stage, {name: nameOf(dealer), answer}); render(); }).catch(() => {});
// The lines of this step that her speech says (their own words replace the chat's for the phase and for how the round ended), and
// the gaps the film met (for the console and the proof recorder).
const spoken = new Set<string>(), gaps: string[] = [];
/** The chat's line for a phase she has entered: her talk film's words when she has one (and the film for a new round), else the dummy's. */
function phaseLine(phase: string): string | null | undefined {
  const talk = spokenOf(phase); if (!talk || !film.talkPart(talk.clip)) return undefined;
  if (phase !== 'BETTING') return null; // said as its film plays, with the engine's own signal for it (present)
  return film.say(talk.clip, () => chat?.say(talk.text)) ? null : talk.text; // a new round: she says it now, or the chat does when a step is playing
}
const render = () => { const view = tableView(snapshot, page);
  panel.set({canChange: !page.busy && page.stage !== 'ROUND'});
  if (chat && !introOn) { if (view.phase !== chatPhase) { chatPhase = view.phase; chat.phase(view.phase, phaseLine(view.phase)); } if (page.line !== chatLine) { chatLine = page.line; if (page.line && view.phase === 'SETTLED' && !settledSpoken()) chat.say(page.line.replace(/<[^>]+>/g, '')); } } chips?.set(Object.fromEntries(view.seats.map(s => [s.seat, taken.has(s.seat) ? [] : s.chips])), seconds()); if (view.phase === 'TURN' || view.phase === 'BETTING') { if (view.phase === 'TURN') byHand = false; aimAt(view.phase === 'TURN' ? snapshot.view.round?.activeSeat ?? null : null); } overlay.render(view); };

// ── where things are in the picture ──
// A film pixel on the felt as the scene's own table point (dealer metres: x across, s from the dealer's edge).
// Under the table's lens a card is a real one, 63 mm wide where the contract's is 31.5 mm in the dealer's metres, so the same step is twice as long.
// The dealer's total stands beside the far half of her card there (DEALER_TOTAL_FAR), between the tray and the logo, which under the lens lies just past her cards.
const TOTAL_LEFT = 0.036, TOTAL_LEFT_REAL = 0.072, DEALER_TOTAL_FAR = 0.03; // dealer metres from the first card's centre to the total, a little more than a card's width
const spotOf = (camera: FilmCamera, px: number, py: number) => { const p = filmToScene(camera, px, py); return sceneToSpot(camera, p[0], p[2]); };
function anchors(): Anchors {
  const camera = scene.status().camera, out: Anchors = {bets: {}, hands: {}}, table = tableCards(snapshot);
  for (const spot of scene.spots().bets) { const at = scene.project(spot.x, spot.s); if (at.visible) out.bets[Number(spot.id.slice(1))] = {x: at.x, y: at.y, ring: spot.radius * 2 * at.pxPerM}; }
  // A hand's total stands just left of its first card: the cards fan out to the right, so it is never under them.
  const lens = camera.source === 'lens', pin = (key: string, shoeDraw: number | undefined) => {
    const slot = shoeDraw === undefined ? null : slotOf(table, shoeDraw), centre = slot && layout.centre(slot), spot = centre && spotOf(camera, centre.x, centre.y), at = spot && scene.project(spot.x - (lens ? TOTAL_LEFT_REAL : TOTAL_LEFT), spot.s - (lens && key === DEALER_KEY ? DEALER_TOTAL_FAR : 0));
    if (at?.visible) out.hands[key] = {x: at.x, y: at.y};
  };
  const counts = new Map<number, number>();
  for (const hand of table.hands) { const n = counts.get(hand.seat) ?? 0; counts.set(hand.seat, n + 1); pin(handKey(hand.seat, n), hand.cards[0]); }
  pin(DEALER_KEY, table.dealer[0]);
  return out;
}
// Standing: the view turns toward a seat (most of the way, so the dealer stays in the picture) and eases there.
function aimAt(seat: number | null) {
  const spot = seat === null ? null : scene.spots().bets.find(b => b.id === `P${seat}`), camera = scene.status().camera;
  if (!tall || !spot) { aimed = home.yaw; return; }
  let turn = Math.atan2(-spot.x * camera.scale, solveCamera(camera).edgeDistance - spot.s * camera.scale) * 180 / Math.PI * FRAMING.turnShare;
  // Under the table's lens the view turns about the film camera's own upright (src/scene3d-view.ts updateView), so the angle to the
  // seat is the one its ring has in the film, and the scene reads a yaw as written for the contract's camera (viewUnder), so the
  // turn is given as that camera's: the film then moves as far sideways in the picture as it does today (373 px against 383 at seat 7).
  if (camera.source === 'lens') { const at = filmPixel(camera, spotToScene(camera, spot.x, spot.s)), real = at ? Math.atan2(-(at.x - (FILM.width - 1) / 2), camera.focalPx) * 180 / Math.PI * FRAMING.turnShare : 0;
    turn = viewUnder(cameraFromContract(contract), camera, {yaw: real, pitch: 0, dx: 0, dy: 0, dz: 0}).yaw; }
  aimed = Math.max(-FRAMING.turnLimit, Math.min(FRAMING.turnLimit, turn));
}
// A sideways drag on the picture turns the view by hand (standing: to reach the outer seats; lying: to look around); a double click turns it back.
// shot: the view while a whole-body film is on (the dealer leaving): the camera backs away as she rises (src/scene3d-exit.ts).
// Without it the view eases to the seat in play, to its own tilt and zoom, and the camera to its own place.
let turning: {x: number; yaw: number} | null = null, byHand = false, shot: ExitView | null = null, comeHome = false; // comeHome: she has gone, the camera returns though her film's last frame is still up
const framing = () => tall ? FRAMING.tall : lying;
canvas.addEventListener('pointerdown', e => { turning = {x: e.clientX, yaw: scene.state.yaw}; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!turning) return; const dx = e.clientX - turning.x; if (Math.abs(dx) > 4) byHand = true; if (byHand) scene.state.yaw = Math.max(-FRAMING.turnLimit, Math.min(FRAMING.turnLimit, turning.yaw + dx * 45 / canvas.clientHeight / Math.max(1, scene.state.zoom))); });
for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { turning = null; });
canvas.addEventListener('dblclick', () => { byHand = false; });
scene.onFrame(() => {
  if (swayFrom !== null) { const t = Math.min(1, (performance.now() - swayFrom) / SWAY_IN_MS); scene.state.dealerLife = swayAsked * t * t * (3 - 2 * t); if (t >= 1) swayFrom = null; }
  chips?.update(seconds());
  const whole = scene.players.part?.frame as {layer?: string; rise?: [number, number]; behindUntil?: number} | null | undefined;
  if (whole?.layer === 'BEHIND_TABLE' && !comeHome) shot = exitView(scene.players.frame(), scene.status().camera, framing(), whole.rise, whole.behindUntil !== undefined);
  if (shot) for (const key of ['yaw', 'pitch', 'zoom', 'dy', 'dz'] as const) scene.state[key] += (shot[key] - scene.state[key]) * 0.12;
  else { if (!turning && !byHand && Math.abs(scene.state.yaw - aimed) > 0.02) scene.state.yaw += (aimed - scene.state.yaw) * 0.08;
    if (!fixed) for (const key of ['pitch', 'zoom'] as const) { const left = framing()[key] - scene.state[key]; if (left) scene.state[key] = Math.abs(left) < 0.002 ? framing()[key] : scene.state[key] + left * 0.08; }
    for (const key of ['dy', 'dz'] as const) if (scene.state[key] !== home[key]) scene.state[key] = Math.abs(scene.state[key] - home[key]) < 0.002 ? home[key] : home[key] + (scene.state[key] - home[key]) * 0.9; }
  const host = stage.getBoundingClientRect(), box = scene.canvas.getBoundingClientRect();
  overlay.place({left: box.left - host.left, top: box.top - host.top, width: box.width, height: box.height}, anchors());
});
render();
// The film before the game is over: her gestures may come again, and after a beat (INTRO_BEAT_MS, so that she does not begin to speak in
// the frame the film is gone) she says her opening line; a rest that was held for the film's end and has no line after it runs on.
const INTRO_BEAT_MS = 400;
introOver = () => { film.calm = false; roomLifeBack(); setTimeout(() => { introOn = false; render(); film.release(); swayIn(); }, INTRO_BEAT_MS); };
// The film ends in her rest pose, held for its last 0.75 s. A little before its end (the module's onLead), while the film still
// covers the stage, her rest is started over with a cut from its first frame, which is that pose (every rest film begins on the
// same frame): the cut is not seen, and the fade goes from her to her. Queued instead, the rest that played went on with her head
// turned and her face showed twice in the fade (measured by the trailer session on the wired page). The rest is held on that
// frame until she speaks: running, it had lifted her face 13 px by the end of the fade (30 px on a standing phone, where it
// showed as a double face) and her head hopped 8 px as the talk film, which begins in the same pose, took over. A rest that has
// stood held since the page opened (above) is that picture already, and is left as it is.
introLead = () => { roomLifeBack(); if (introOn && page.stage === 'BETTING' && !page.busy && !film.held) film.rest({cut: true, hold: true}); };
if (!introOn) film.calm = false; // it was over before the page was built (skipped at once)

// How the round ended is said by her speech when it has the line (the settle's speak signal); then the status line is not said again.
function settledSpoken() { return ['blackjack', 'dealerblackjack', 'dealerbust', 'win', 'push', 'lose'].some(key => spoken.has(key)); }
Object.assign(window, {game: {scene, film, page, state: () => snapshot, dealer: () => dealer, gaps, controls, mouths}}); // for the proof recorder and the console; not an interface
// ?diagnos=1: what this browser does with the game, as text on the picture (src/game-diagnosis.ts), for a fault that shows on one
// phone and in no recording. Read only when the address has the word.
if (query.get('diagnos') === '1') void import('./game-diagnosis.ts').then(m => m.createDiagnosis(stage, canvas, () => { const q = scene.players.diagnosis();
  return [`film före spelet ${introOn ? 'på' : 'av'} · ${page.stage}${page.busy ? ' upptagen' : ''} · hållen vila ${film.held ? 'ja' : 'nej'} · luckor ${gaps.length}`,
    `kö: ${q.paused ? 'står' : 'går'} · sträng ${q.strict ? 'JA' : 'nej'} · nekade ${q.stuck} · element ${q.pool}`, `på skärmen: ${q.onScreen ?? 'INGEN FILM'}`, ...(q.awaited ? [`väntad: ${q.awaited}`] : []),
    ...q.elements, ...q.events.slice(-10)]; }, {
  playback: () => { const video = scene.players.current?.video; return video ? {clip: scene.players.path, frame: scene.players.frame(), rate: video.playbackRate, paused: scene.players.paused} : null; },
  toggle: () => scene.players.toggle(),
  step: direction => scene.players.step(direction),
})).catch(() => null);
