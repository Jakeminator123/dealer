// Page code of scene3d.html: reads the contract, the placement plan and the clip bank, builds the control panel
// and wires mouse and keyboard to the scene. Everything is read only; nothing here saves anything.
import {buildGraph, resolveRound, type Step} from './clip-graph.ts';
import {createScene, DEFAULTS, type SceneState} from './scene3d-view.ts';
import type {Part} from './scene3d-film.ts';
import type {CardTrack} from './scene3d-geometry.ts';
import type {RoomId} from './scene3d-room.ts';

const query = new URLSearchParams(location.search), bare = query.get('ui') === '0';
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const $ = (id: string) => document.getElementById(id)!;
const panel = $('panel'), hudBox = $('hud'), canvas = $('view') as HTMLCanvasElement, stage = $('stage');
if (bare) document.body.classList.add('noui');
const fail = (message: string) => { panel.append(el('p', {className: 'error', textContent: message})); hudBox.replaceChildren(el('span', {className: 'chip warn', textContent: message})); throw Error(message); };
const read = async (url: string, what: string) => { const res = await fetch(url).catch(() => null); if (!res?.ok) fail(`${what} kunde inte läsas (${url}). Sidan gissar inga värden.`); return res!.json(); };

const [contract, placements, bank] = await Promise.all([read('data/scene-contract.json', 'Scenkontraktet'), read('api/placements', 'Placeringsplanen'), read('api/clip-bank', 'Klippbanken')]);
type Clip = {id: string; video: string};
const clips: Clip[] = Object.entries((bank.media ?? {}) as Record<string, {video?: string | null}>).filter(([, m]) => typeof m.video === 'string').map(([id, m]) => ({id, video: m.video!})).sort((a, b) => a.id.localeCompare(b.id));
// Rounds through the clip bank. The bank's own rule cuts each film (resolveRound): a deal stops on the frame its return was
// generated from, so the hand does not lift and jump back at the join. A round with a step that cannot be played is left out.
const graph = buildGraph(bank), deal: Step = {from: 'READY', to: 'P4.C1', take: 'pamela-p4-c1-plan-deal-02'};
const round = (label: string, steps: Step[]): {label: string; parts: Part[]} => { const segments = resolveRound(graph, steps); return {label, parts: segments.every(s => s.video) ? segments.map(s => ({path: s.video!, start: s.start, end: s.end})) : []}; };
const rounds = [round('Runda P4: giv → retur till vila', [deal, {from: 'P4.C1', to: 'IDLE', take: 'pamela-p4-c1-plan-return-idle-01'}]), round('Runda P4: giv → retur till redo', [deal, {from: 'P4.C1', to: 'READY', take: 'pamela-p4-c1-plan-return-ready-01'}]),
  round('Runda P4: vila → redo → giv → vila', [{from: 'IDLE', to: 'READY', take: 'pamela-idle-ready-entry-01'}, deal, {from: 'P4.C1', to: 'IDLE', take: 'pamela-p4-c1-plan-return-idle-01'}])].filter(r => r.parts.length);
const partsOf = (choice: string): Part[] => rounds[Number(choice.slice(6))]?.parts ?? [{path: clips.find(c => c.id === choice)!.video}];
if (!clips.length) fail('Klippbanken innehåller inga filmer.');

const first = clips.find(c => c.id === query.get('clip'))?.id ?? (rounds.length ? 'round:0' : clips[0].id);
const missing = new Set<RoomId>(), setters: Partial<Record<keyof SceneState, (value: never) => void>> = {};
const scene = createScene(canvas, stage, {contract, plan: placements.plan ?? placements, urls: {plate: 'assets/scene/room.png', panorama: 'assets/scene/panorama-vegas.jpg', la: 'assets/scene/panorama-la.jpg', skog: 'assets/scene/panorama-skog.jpg'}, onChange: () => { sync(); hud(); void followTrack(); }, onMissingRoom: room => { missing.add(room); hud(); }});
const state = scene.state;
for (const [key, value] of query) if (key in DEFAULTS) { const k = key as keyof SceneState, base = DEFAULTS[k]; (state as Record<string, unknown>)[k] = typeof base === 'number' ? Number(value) : typeof base === 'boolean' ? value === '1' : value; }
if (bare) state.format = 'fill';

// ---- card track of the clip on screen: focus can follow the card ---------------------------------
const tracks = new Map<string, CardTrack | null>(); let trackedPath = '';
async function followTrack() {
  const path = scene.players.path; if (path === trackedPath) return; trackedPath = path;
  const id = /^assets\/motions\/([a-z0-9-]+)\/source\.mp4$/.exec(path)?.[1];
  scene.setTrack(id ? tracks.get(id) ?? null : null); if (!id || tracks.has(id)) return; // never the previous clip's track on this clip's frames
  const json = (url: string) => fetch(url).then(r => r.ok ? r.json() : null).catch(() => null), track = await json(`assets/tracking/${id}/card-track.json`);
  // the clip bank's frames where the card is drawn in front of the hand (card-overlay.ts overridesOf reads them off the track)
  const overrides = Object.values((bank.media ?? {}) as Record<string, {video?: string | null; overrides?: string | null}>).find(m => m.video === path && m.overrides)?.overrides;
  if (track && overrides) track.cardInFront = (await json(overrides))?.cardInFront ?? [];
  tracks.set(id, track);
  if (scene.players.path === path) { scene.setTrack(tracks.get(id) ?? null); hud(); }
}

// ---- heads-up line ---------------------------------------------------------------------------------
const decimal = (v: number, digits = 2) => v.toFixed(digits).replace('.', ',');
function hud() {
  const s = scene.status(), chip = (text: string, tone = '') => el('span', {className: `chip ${tone}`, textContent: text}), id = /motions\/([^/]+)\//.exec(scene.players.path)?.[1] ?? 'läser film…';
  const added = [state.focus !== 'off' && 'fokus', state.fan && 'fläktskugga', state.tray && 'markerbräde', state.cards && (state.cardMethod === 'scene' ? 'kort i scenen' : 'kort i filmrutan'), state.clock && 'klocka', state.dust > 0 && 'luft', state.flicker && 'ljusskifte', (state.filmBright !== 1 || state.filmWarm !== 0) && 'ljuskalibrering'].filter(Boolean);
  hudBox.replaceChildren(chip(id),
    s.view === 'moved' ? chip('Kameran är flyttad: 2,5D-närmevärde, inte filmens sanning', 'warn') : s.view === 'turned' ? chip('Bara vridning/zoom: filmen är geometriskt exakt', 'ok') : chip('Hemvy: filmen pixel för pixel', 'ok'),
    s.camera.source === 'contract' ? chip(`Kamera: planens (kontraktet) · skala k = ${decimal(s.camera.scale)} skattad`) : chip('Kamera: egen skattning, inte uppmätt', 'warn'),
    added.length ? chip(`Utöver v1: ${added.join(' + ')}`) : chip('Som kontrollpunkt v1'),
    ...(s.focus ? [chip(`Skärpan ligger på ${s.focus.what}${Number.isFinite(s.focus.distance) ? ` · ${decimal(s.focus.distance)} m` : ''}${(state.focus === 'card' || state.focus === 'follow') && !s.focus.tracked ? ' · klippet saknar kortspårning' : ''}`)] : []),
    ...(s.cards.error ? [chip('Renderade kort kunde inte läsas in: ' + s.cards.error, 'warn')] : state.cards && s.cards.loading ? [chip('Läser in kortritaren…')] : state.cards && !s.cards.tracked ? [chip('Klippet saknar kortspårning: filmens färgyta visas', 'warn')] : []),
    ...(missing.has(state.room) ? [chip('Miljöns bild saknas på servern', 'warn')] : []));
}

// ---- control panel ---------------------------------------------------------------------------------
// What the three animations are in the room that is showing.
const THREE: Record<string, string> = {
  salong: 'Här: en stående klocka, damm i lampornas ljus, och pendeln till höger som flimrar till.',
  panorama: 'Här: en stående klocka, damm, och ett neonrör som flimrar till medan salen dämpas lite.',
  la: 'Här: en stående klocka, damm i kvällsljuset, och ett moln som går för solen i några sekunder.',
  skog: 'Här: en stående klocka, pollen och fallande löv, och ett moln som går för solen i några sekunder.',
  hall: 'Här: en stående klocka, damm och rök, och spelhallens egna ljus.',
  kuliss: 'Här: en stående klocka, damm, och ljuset som dämpas mjukt i några sekunder.',
  plat: 'Här finns inget rum att ställa klockan i; damm syns bara framför dealern och ljuset dämpas mjukt.'};
function sync() { const three = document.getElementById('three'); if (three) three.textContent = THREE[state.room] ?? '';
  for (const [key, set] of Object.entries(setters)) (set as (v: unknown) => void)(state[key as keyof SceneState]); const play = document.getElementById('play'); if (play) play.textContent = scene.players.paused ? 'Spela' : 'Pausa'; }
function build() {
  const group = (title: string, ...kids: Node[]) => panel.append(el('fieldset', {}, el('legend', {textContent: title}), ...kids));
  const note = (html: string) => el('p', {className: 'note', innerHTML: html});
  const slider = (label: string, key: keyof SceneState, min: number, max: number, step: number, unit = '', then: () => void = () => scene.apply()) => {
    const out = el('output'), input = el('input', {type: 'range', min: String(min), max: String(max), step: String(step)}), show = (v: number) => `${decimal(v, step < 0.01 ? 3 : step < 1 ? 2 : 0)}${unit}`;
    input.addEventListener('input', () => { (state as Record<string, unknown>)[key] = Number(input.value); out.textContent = show(Number(input.value)); then(); });
    setters[key] = ((v: number) => { input.value = String(v); out.textContent = show(v); }) as never; return el('label', {className: 'row'}, el('span', {textContent: label}), input, out);
  };
  const check = (label: string, key: keyof SceneState) => { const input = el('input', {type: 'checkbox'}); input.addEventListener('change', () => scene.set({[key]: input.checked}));
    setters[key] = ((v: boolean) => { input.checked = v; }) as never; return el('label', {className: 'check'}, input, el('span', {textContent: label})); };
  const choice = <K extends keyof SceneState>(key: K, options: [SceneState[K], string][], then: (value: SceneState[K]) => void = value => scene.set({[key]: value} as Partial<SceneState>), rows = false) => {
    const box = el('div', {className: rows ? 'seg rows' : 'seg'}), buttons = options.map(([value, text]) => { const b = el('button', {type: 'button', textContent: text}); b.addEventListener('click', () => then(value)); box.append(b); return [value, b] as const; });
    setters[key] = ((v: SceneState[K]) => buttons.forEach(([value, b]) => b.setAttribute('aria-pressed', String(value === v)))) as never; return box;
  };
  const button = (text: string, onclick: () => void, id = '') => el('button', {type: 'button', textContent: text, onclick, id});
  const live = () => hud();

  panel.append(el('h1', {textContent: '3D-scen · bakgrund och bord'}), el('p', {className: 'sub', textContent: 'Pamelas 2D-film i ett 3D-rum med 3D-bord. Dra i bilden, rulla för zoom, dubbelklicka för hemvy.'}));
  group('Miljö', choice('room', [['salong', '3D-salong'], ['panorama', 'Las Vegas'], ['la', 'Skyline'], ['skog', 'Skog'], ['hall', 'Spelhall'], ['kuliss', 'Kuliss'], ['plat', 'V6-plåt']], room => scene.set({room, blur: ({salong: 11, panorama: 5, la: 6, skog: 6, hall: 11, kuliss: 9, plat: 8})[room]}), true),
    slider('Oskärpa längst bort', 'blur', 0, 30, 0.5, ' px', live), check('Oskärpan växer med avståndet (3D-salongen)', 'depthBlur'), slider('Full oskärpa efter', 'dofRange', 0.5, 12, 0.1, ' m', live),
    note('<b>3D-salong</b>: byggd geometri, äkta parallax. <b>Las Vegas</b>, <b>Skyline</b> och <b>Skog</b>: 360°-bilder runt kameran, exakta vid vridning men utan parallax. <b>Kuliss</b>: V6-plåten som ett plan bakom dealern. <b>V6-plåt</b>: dagens platta bild, fast i rutan.'));
  group('Fokus (styrs av filmen)', choice('focus', [['off', 'Av'], ['dealer', 'Dealern'], ['follow', 'Följ given'], ['card', 'Kortet'], ['manual', 'Eget']]),
    slider('Eget avstånd', 'focusDistance', 0.3, 12, 0.01, ' m', live), slider('Skärpedjup', 'tolerance', 0, 0.8, 0.01, '', live),
    note('<b>Av</b> är kontrollpunkt v1: bord och film alltid skarpa. Med fokus på blir allt oskarpt efter sitt avstånd till skärpeplanet, även bordet och dealern. <b>Följ given</b> flyttar skärpan till kortet från att det lämnar skon tills det ligger still, och sedan tillbaka till dealern; hennes ansikte blir då lite mjukt. Styrkan är reglaget "Oskärpa längst bort".'));
  const three = el('p', {className: 'note', id: 'three'});
  group('Tre rörelser i rummet', check('Klocka som visar rätt tid', 'clock'), slider('Luft: damm eller löv', 'dust', 0, 1, 0.01, '', live),
    check('Ljuset skiftar till ibland', 'flicker'), slider('Ungefär var', 'flickerEvery', 4, 90, 1, ' s', live), slider('Hur djupt', 'flickerStrength', 0, 1, 0.01, '', live),
    el('div', {className: 'btns'}, button('Alla tre på', () => scene.set({clock: true, dust: 0.7, flicker: true})), button('Alla tre av', () => scene.set({clock: false, dust: 0, flicker: false}))), three,
    note('Samma tre i varje miljö, i den form som passar den. Det som svävar finns både bakom dealern och mellan dig och henne; nära kameran blir ett korn en stor, svag skiva. Skiftet bestäms av klockan, så det går att förutse.'));
  group('Ljus', slider('Ljus i rummet', 'exposure', 0.3, 2, 0.05, '', live), slider('Dealerns ljusstyrka', 'filmBright', 0.6, 1.4, 0.01), slider('Dealerns värme', 'filmWarm', -0.2, 0.2, 0.005), slider('Rummets ljus runt dealern', 'wrap', 0, 1.5, 0.05, '', live),
    check('Fläktskugga över dealer och bord', 'fan'), slider('Fläktens styrka', 'fanStrength', 0, 0.4, 0.01, '', live), slider('Sekunder per blad', 'fanPeriod', 2, 12, 0.5, ' s', live),
    note('Fläkten är en långsam trebladig fläkt under en lampa över bordet; skuggan läggs ovanpå filmen och ska hållas svag. Rummet och filmen ställs var för sig tills de ser ut att stå i samma ljus. Dealerns reglage ändrar bara filmens nivå och färgton, inte varifrån ljuset kommer. 1,00 och 0,00 är filmen som den är. <b>Rummets ljus runt dealern</b> lägger det rum som syns bakom henne som ett svagt ljus längs hennes kontur, så att hon ser ut att stå i rummet och inte framför det; 0 är av.'));
  group('Kamera', choice('mode', [['look', 'Titta runt'], ['lean', 'Luta / flytta']]), slider('Vrid sidled', 'yaw', -60, 60, 0.5, '°', live), slider('Vrid höjdled', 'pitch', -35, 25, 0.5, '°', live), slider('Zoom', 'zoom', 0.45, 2.5, 0.01, '×', live),
    slider('Flytta sidled', 'dx', -0.9, 0.9, 0.005, ' m', live), slider('Flytta höjd', 'dy', -0.3, 0.5, 0.005, ' m', live), slider('Flytta djup', 'dz', -0.5, 0.8, 0.005, ' m', live),
    check('Håll blicken på dealern vid flytt', 'aim'), check('Gunga kameran automatiskt', 'sway'),
    el('div', {className: 'btns'}, button('Hemvy (filmkameran)', () => scene.home()), button('Mobilvy', () => { scene.home(); scene.set({format: 'mob', pitch: -9, zoom: 1}); }), button('Grannstol (bryter)', () => { scene.home(); scene.set({mode: 'lean', dx: 0.55}); })),
    note('<b>Titta runt</b> vrider kameran på stället: det är exakt för en 2D-film. <b>Luta / flytta</b> ändrar kamerans plats: rummet och bordet är äkta 3D, filmen är två platta ytor och börjar ljuga ju längre du går.'));
  group('Format', choice('format', [['desk', 'Dator 1764×1174'], ['mob', 'Mobil 9:16'], ['fill', 'Fyll fönstret']]));
  const select = el('select'); select.append(...rounds.map((r, i) => el('option', {value: `round:${i}`, textContent: r.label})), ...clips.map(c => el('option', {value: c.id, textContent: c.id}))); select.value = first;
  select.addEventListener('change', () => { scene.players.toggle(false); void scene.players.load(partsOf(select.value)); });
  group('Film', select, el('div', {className: 'btns'}, button('Pausa', () => scene.players.toggle(), 'play'), button('−1 ruta', () => void scene.players.step(-1)), button('+1 ruta', () => void scene.players.step(1))),
    check('Vik filmen mot bordet (händer och kort följer filten)', 'fold'), check('Visa hjälplinjer (filmruta, vikning, filmens bordsyta)', 'guides'),
    slider('Skuggor', 'shadow', 0, 1.6, 0.05), slider('Nyckel låg', 'keyLo', 0, 0.5, 0.01), slider('Nyckel hög', 'keyHi', 0.5, 1.2, 0.01));
  const logo = el('input', {type: 'text', value: state.logo, maxLength: 28}); logo.addEventListener('input', () => scene.set({logo: logo.value})); setters.logo = ((v: string) => { if (document.activeElement !== logo) logo.value = v; }) as never;
  const pick = (key: 'cardRank' | 'cardSuit', options: [string, string][]) => { const s = el('select'); s.append(...options.map(([value, text]) => el('option', {value, textContent: text}))); s.addEventListener('change', () => scene.set({[key]: s.value})); setters[key] = ((v: string) => { s.value = v; }) as never; return s; };
  group('Kort', check('Renderade kort i stället för filmens färgyta', 'cards'), choice('cardMethod', [['scene', 'I scenen (3D)'], ['film', 'I filmrutan (2D)']]),
    slider('Kortets storlek', 'cardScale', 1, 2.5, 0.05, '×', live), el('div', {className: 'seg'}, pick('cardRank', ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'].map(r => [r, r])), pick('cardSuit', [['spades', 'Spader'], ['hearts', 'Hjärter'], ['diamonds', 'Ruter'], ['clubs', 'Klöver']])),
    note('<b>I scenen</b>: kortet är ett föremål på bordet under filmen. Filmens eget kort (och kortet i skons fönster) nycklas bort, så filmens fingrar ligger över det renderade kortet och deras skuggor faller på det. Ljuset tas från filmens kort i varje ruta, glansen från rummet; i rörelse blir kortet oskarpt som handen. <b>I filmrutan</b>: den tidigare vägen, där labbets kortritare ritar kortet in i filmrutan. Var kortet är och vilken sida som syns kommer i båda fallen ur spårningen och placeringsplanen. Valören här är bara för provet: i spelet bestämmer Scout den.'));
  group('Bord', check('Markerbräde försänkt vid dealern', 'tray'), el('label', {className: 'row two'}, el('span', {textContent: 'Logotext'}), logo), choice('felt', [['green', 'Grön'], ['blue', 'Blå'], ['vin', 'Vinröd'], ['svart', 'Svart']]),
    note('Filt, linjer, kortrutor och logga är en enda platt bild sedd rakt uppifrån. Kortrutorna kommer ur placeringsplanen (endast läst). Bordets form och tryckets layout är provisoriska.'),
    el('label', {className: 'row two'}, el('span', {textContent: 'Ljus i relingen'}), choice('railLight', [['off', 'Av'], ['steady', 'Fast'], ['breathe', 'Andas'], ['chase', 'Löper']])),
    choice('railColour', [['gold', 'Guld'], ['white', 'Vitt'], ['cyan', 'Turkos'], ['magenta', 'Rosa']]), check('Mugghållare i relingen', 'cups'),
    note('<b>Ljus i relingen</b>: en ljuslinje längs filtens kant med sitt sken på filten. <b>Andas</b> sväller långsamt, <b>Löper</b> låter en ljus sträcka gå relingen runt. Syns mest när vyn vrids eller backar; i hemvyn bara vid relingens ändar. <b>Mugghållare</b>: en mässingsring mellan varje plats.'));
  let timer = 0; const scale = slider('Skala k', 'scale', 1, 2.6, 0.05, '×', () => { clearTimeout(timer); timer = window.setTimeout(() => scene.rebuild(), 120); }), shown = setters.scale as unknown as (v: number) => void;
  setters.scale = ((v: number) => shown(v > 0 ? v : scene.status().camera.scale)) as never;
  group('Filmkamera och skala', choice('lens', [['plan', 'Planens kamera (kontrakt)'], ['estimate', 'Dealerns lins (skattad)']], lens => { scene.home(); scene.set({lens, scale: 0}); }), scale,
    note('Hemvyn är filmen oavsett kamera. Kameran styr hur filttrycket, bordet och rummet ligger i perspektiv och hur vridning och parallax ser ut. <b>Planens kamera</b> läses ur data/scene-contract.json och passar kortrutorna; kontraktet säger självt att dealern inte är ritad med den linsen. <b>Dealerns lins</b> är en skattning ur dealerns proportioner och ögonhöjd, inte uppmätt. <b>k</b> är hur många gånger större dealerns värld är än planens kort; kontraktet skattar 1,8–2,5.'));
}

// ---- mouse and keyboard ------------------------------------------------------------------------------
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
let drag: {x: number; y: number; from: SceneState} | null = null;
canvas.addEventListener('pointerdown', e => { drag = {x: e.clientX, y: e.clientY, from: {...state}}; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y, perPixel = 45 / canvas.clientHeight;
  if (state.mode === 'look') { state.yaw = clamp(drag.from.yaw + dx * perPixel, -60, 60); state.pitch = clamp(drag.from.pitch + dy * perPixel, -35, 25); }
  else { state.dx = clamp(drag.from.dx - dx * 0.0016, -0.9, 0.9); state.dy = clamp(drag.from.dy + dy * 0.0016, -0.3, 0.5); }
  sync(); hud(); });
for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); state.zoom = clamp(state.zoom * Math.exp(-e.deltaY * 0.0012), 0.45, 2.5); sync(); hud(); }, {passive: false});
canvas.addEventListener('dblclick', () => scene.home());
addEventListener('keydown', e => { if (e.target instanceof HTMLInputElement && e.target.type === 'text' || e.target instanceof HTMLSelectElement) return;
  if (e.code === 'Space') { e.preventDefault(); scene.players.toggle(); } else if (e.code === 'ArrowRight') void scene.players.step(1); else if (e.code === 'ArrowLeft') void scene.players.step(-1); });
new ResizeObserver(() => scene.resize()).observe(stage);

// ---- start ---------------------------------------------------------------------------------------------
if (!bare) build();
scene.rebuild(); scene.start();
const ready = scene.players.load(partsOf(first)).then(() => true, error => fail((error as Error).message));
// For the proof recorder and for debugging from the console; not an interface for other pages.
Object.assign(window, {scene3d: {scene, ready, clips, rounds}});
