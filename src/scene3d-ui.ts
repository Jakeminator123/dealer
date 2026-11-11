// Page code of scene3d.html: reads the contract, the placement plan and the clip bank, builds the control panel
// and wires mouse and keyboard to the scene. Everything is read only; nothing here saves anything.
import {createScene, DEFAULTS, type SceneState} from './scene3d-view.ts';
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
const CHAIN = ['pamela-p4-c1-plan-deal-02', 'pamela-p4-c1-plan-return-idle-01'], chain = CHAIN.map(id => clips.find(c => c.id === id)).filter((c): c is Clip => !!c);
if (!clips.length) fail('Klippbanken innehåller inga filmer.');

const missing = new Set<RoomId>(), setters: Partial<Record<keyof SceneState, (value: never) => void>> = {};
const scene = createScene(canvas, stage, {contract, plan: placements.plan ?? placements, urls: {plate: 'assets/scene/room.png', panorama: 'assets/scene/panorama-vegas.jpg'}, onChange: () => { sync(); hud(); void followTrack(); }, onMissingRoom: room => { missing.add(room); hud(); }});
const state = scene.state;
for (const [key, value] of query) if (key in DEFAULTS) { const k = key as keyof SceneState, base = DEFAULTS[k]; (state as Record<string, unknown>)[k] = typeof base === 'number' ? Number(value) : typeof base === 'boolean' ? value === '1' : value; }
if (bare) state.format = 'fill';

// ---- card track of the clip on screen: focus can follow the card ---------------------------------
const tracks = new Map<string, CardTrack | null>(); let trackedPath = '';
async function followTrack() {
  const path = scene.players.path; if (path === trackedPath) return; trackedPath = path;
  const id = /^assets\/motions\/([a-z0-9-]+)\/source\.mp4$/.exec(path)?.[1];
  scene.setTrack(id ? tracks.get(id) ?? null : null); if (!id || tracks.has(id)) return; // never the previous clip's track on this clip's frames
  tracks.set(id, await fetch(`assets/tracking/${id}/card-track.json`).then(r => r.ok ? r.json() : null).catch(() => null));
  if (scene.players.path === path) { scene.setTrack(tracks.get(id) ?? null); hud(); }
}

// ---- heads-up line ---------------------------------------------------------------------------------
const decimal = (v: number, digits = 2) => v.toFixed(digits).replace('.', ',');
function hud() {
  const s = scene.status(), chip = (text: string, tone = '') => el('span', {className: `chip ${tone}`, textContent: text}), id = /motions\/([^/]+)\//.exec(scene.players.path)?.[1] ?? 'läser film…';
  const added = [state.focus !== 'off' && 'fokus', state.fan && 'fläktskugga'].filter(Boolean);
  hudBox.replaceChildren(chip(id),
    s.view === 'moved' ? chip('Kameran är flyttad: 2,5D-närmevärde, inte filmens sanning', 'warn') : s.view === 'turned' ? chip('Bara vridning/zoom: filmen är geometriskt exakt', 'ok') : chip('Hemvy: filmen pixel för pixel', 'ok'),
    s.camera.source === 'contract' ? chip(`Kamera: planens (kontraktet) · skala k = ${decimal(s.camera.scale)} skattad`) : chip('Kamera: egen skattning, inte uppmätt', 'warn'),
    added.length ? chip(`Utöver v1: ${added.join(' + ')}`) : chip('Som kontrollpunkt v1'),
    ...(s.focus ? [chip(`Skärpan ligger på ${s.focus.what}${Number.isFinite(s.focus.distance) ? ` · ${decimal(s.focus.distance)} m` : ''}${(state.focus === 'card' || state.focus === 'follow') && !s.focus.tracked ? ' · klippet saknar kortspårning' : ''}`)] : []),
    ...(missing.has(state.room) ? [chip('Miljöns bild saknas på servern', 'warn')] : []));
}

// ---- control panel ---------------------------------------------------------------------------------
function sync() { for (const [key, set] of Object.entries(setters)) (set as (v: unknown) => void)(state[key as keyof SceneState]); const play = document.getElementById('play'); if (play) play.textContent = scene.players.paused ? 'Spela' : 'Pausa'; }
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
  const choice = <K extends keyof SceneState>(key: K, options: [SceneState[K], string][], then: (value: SceneState[K]) => void = value => scene.set({[key]: value} as Partial<SceneState>)) => {
    const box = el('div', {className: 'seg'}), buttons = options.map(([value, text]) => { const b = el('button', {type: 'button', textContent: text}); b.addEventListener('click', () => then(value)); box.append(b); return [value, b] as const; });
    setters[key] = ((v: SceneState[K]) => buttons.forEach(([value, b]) => b.setAttribute('aria-pressed', String(value === v)))) as never; return box;
  };
  const button = (text: string, onclick: () => void, id = '') => el('button', {type: 'button', textContent: text, onclick, id});
  const live = () => hud();

  panel.append(el('h1', {textContent: '3D-scen · bakgrund och bord'}), el('p', {className: 'sub', textContent: 'Pamelas 2D-film i ett 3D-rum med 3D-bord. Dra i bilden, rulla för zoom, dubbelklicka för hemvy.'}));
  group('Miljö', choice('room', [['salong', '3D-salong'], ['panorama', 'Panorama'], ['kuliss', 'Kuliss'], ['plat', 'V6-plåt']], room => scene.set({room, blur: ({salong: 11, panorama: 5, kuliss: 9, plat: 8})[room]})),
    slider('Oskärpa längst bort', 'blur', 0, 30, 0.5, ' px', live), check('Oskärpan växer med avståndet (3D-salongen)', 'depthBlur'), slider('Full oskärpa efter', 'dofRange', 0.5, 12, 0.1, ' m', live), slider('Ljus i rummet', 'exposure', 0.3, 2, 0.05, '', live),
    note('<b>3D-salong</b>: byggd geometri, äkta parallax. <b>Panorama</b>: 360°-bild, ingen parallax. <b>Kuliss</b>: V6-plåten som ett plan bakom dealern. <b>V6-plåt</b>: dagens platta bild, fast i rutan.'));
  group('Fokus', choice('focus', [['off', 'Av'], ['dealer', 'Dealern'], ['follow', 'Följ given'], ['card', 'Kortet'], ['manual', 'Eget']]),
    slider('Eget avstånd', 'focusDistance', 0.3, 12, 0.01, ' m', live), slider('Skärpedjup', 'tolerance', 0, 0.8, 0.01, '', live),
    note('<b>Av</b> är kontrollpunkt v1: bord och film alltid skarpa. Med fokus på blir allt oskarpt efter sitt avstånd till skärpeplanet, även bordet och dealern. <b>Följ given</b> flyttar skärpan till kortet från att det lämnar skon tills det ligger still, och sedan tillbaka till dealern; hennes ansikte blir då lite mjukt. Styrkan är reglaget "Oskärpa längst bort".'));
  group('Ljus och rörelse', check('Fläktskugga över dealer och bord', 'fan'), slider('Styrka', 'fanStrength', 0, 0.4, 0.01, '', live), slider('Sekunder per blad', 'fanPeriod', 2, 12, 0.5, ' s', live),
    note('En långsam trebladig fläkt under en lampa över bordet. Filmens eget ljus går inte att ändra, så skuggan läggs ovanpå och ska hållas svag.'));
  group('Kamera', choice('mode', [['look', 'Titta runt'], ['lean', 'Luta / flytta']]), slider('Vrid sidled', 'yaw', -60, 60, 0.5, '°', live), slider('Vrid höjdled', 'pitch', -35, 25, 0.5, '°', live), slider('Zoom', 'zoom', 0.45, 2.5, 0.01, '×', live),
    slider('Flytta sidled', 'dx', -0.9, 0.9, 0.005, ' m', live), slider('Flytta höjd', 'dy', -0.3, 0.5, 0.005, ' m', live), slider('Flytta djup', 'dz', -0.5, 0.8, 0.005, ' m', live),
    check('Håll blicken på dealern vid flytt', 'aim'), check('Gunga kameran automatiskt', 'sway'),
    el('div', {className: 'btns'}, button('Hemvy (filmkameran)', () => scene.home()), button('Mobilvy', () => { scene.home(); scene.set({format: 'mob', pitch: -9, zoom: 1}); }), button('Grannstol (bryter)', () => { scene.home(); scene.set({mode: 'lean', dx: 0.55}); })),
    note('<b>Titta runt</b> vrider kameran på stället: det är exakt för en 2D-film. <b>Luta / flytta</b> ändrar kamerans plats: rummet och bordet är äkta 3D, filmen är två platta ytor och börjar ljuga ju längre du går.'));
  group('Format', choice('format', [['desk', 'Dator 1764×1174'], ['mob', 'Mobil 9:16'], ['fill', 'Fyll fönstret']]));
  const select = el('select'); if (chain.length === CHAIN.length) select.append(el('option', {value: '', textContent: 'Kedja P4: giv → retur till vila'})); select.append(...clips.map(c => el('option', {value: c.id, textContent: c.id})));
  select.addEventListener('change', () => { scene.players.toggle(false); void scene.players.load(select.value ? [clips.find(c => c.id === select.value)!.video] : chain.map(c => c.video)); });
  group('Film', select, el('div', {className: 'btns'}, button('Pausa', () => scene.players.toggle(), 'play'), button('−1 ruta', () => void scene.players.step(-1)), button('+1 ruta', () => void scene.players.step(1))),
    check('Vik filmen mot bordet (händer och kort följer filten)', 'fold'), check('Visa hjälplinjer (filmruta, vikning, filmens bordsyta)', 'guides'),
    slider('Skuggor', 'shadow', 0, 1.6, 0.05), slider('Nyckel låg', 'keyLo', 0, 0.5, 0.01), slider('Nyckel hög', 'keyHi', 0.5, 1.2, 0.01));
  const logo = el('input', {type: 'text', value: state.logo, maxLength: 28}); logo.addEventListener('input', () => scene.set({logo: logo.value})); setters.logo = ((v: string) => { if (document.activeElement !== logo) logo.value = v; }) as never;
  group('Bord', el('label', {className: 'row two'}, el('span', {textContent: 'Logotext'}), logo), choice('felt', [['green', 'Grön'], ['blue', 'Blå'], ['vin', 'Vinröd'], ['svart', 'Svart']]),
    note('Filt, linjer, kortrutor och logga är en enda platt bild sedd rakt uppifrån. Kortrutorna kommer ur placeringsplanen (endast läst). Bordets form och tryckets layout är provisoriska.'));
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
const wanted = clips.find(c => c.id === query.get('clip')), ready = scene.players.load(wanted ? [wanted.video] : chain.length === CHAIN.length ? chain.map(c => c.video) : [clips[0].video]).then(() => true, error => fail((error as Error).message));
// For the proof recorder and for debugging from the console; not an interface for other pages.
Object.assign(window, {scene3d: {scene, ready, clips}});
