// Page code of vinklar.html, a trial (Jakob 2026-11-18): the scene with its table and room, a camera that can be carried
// around the dealer, and the same deal as two films, one from the front and one from the side, running in step. The film
// that is shown follows the camera's angle, with a cross-fade where one takes over from the other. The question the page
// answers: do the two films bind together, or does it jump? Nothing here saves anything, and neither the scene page nor
// the game is changed: the scene is built by its own createScene and the films are added to it as a prop.
//
// The address's words: vinkel (degrees, 0 = the bank's camera, positive toward her left), t (seconds into the deal; the
// deal then stands still there), byte (the angle where the film from the side takes over), toning (degrees the cross-fade
// takes, 0 = a cut), spegel=1 (the film from the side also mirrored, on the other side).
import * as T from 'three';
import {GEOMETRY_WORD, GEOMETRY_WORDS} from './card-plan.ts';
import {createFilmLayers} from './scene3d-film.ts';
import {FILM, cameraFromContract, solveCamera} from './scene3d-geometry.ts';
import {createFanLight} from './scene3d-light.ts';
import {readRegister} from './scene3d-room.ts';
import {createScene} from './scene3d-view.ts';
import {BEHIND_EDGE, CHANGE, FILMS, FILM_FPS, behind, drawOrder, follow, frameOf, frameTime, loopTime, orbitView, reach, rigMatrix, settingFor, showing, weightedShader, weights, withMirrors, wordNumber, type AngleFilm} from './angle-plan.ts';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const $ = (id: string) => document.getElementById(id)!;
const panel = $('panel'), line = $('rad'), canvas = $('view') as HTMLCanvasElement, stage = $('stage');
const fail = (message: string) => { panel.append(el('p', {className: 'error', textContent: message})); line.textContent = message; line.classList.add('warn'); throw Error(message); };
const read = async (url: string, what: string) => { const res = await fetch(url).catch(() => null); if (!res?.ok) fail(`${what} kunde inte läsas (${url}).`); return res!.json(); };
const decimal = (v: number, digits = 0) => v.toFixed(digits).replace('.', ',');

// The bank's camera as a real lens (src/table-lens.ts) is the scene's camera only under the geometry 'lens', which the
// scene reads from the address (src/card-plan.ts). The trial is about that camera, so the word is put in the address when
// it is missing; geometri=kontrakt in the address keeps the contract's camera, to compare.
const query = new URLSearchParams(location.search);
if (!query.has(GEOMETRY_WORD)) { query.set(GEOMETRY_WORD, Object.keys(GEOMETRY_WORDS).find(word => GEOMETRY_WORDS[word] === 'lens')!); history.replaceState(null, '', `${location.pathname}?${query}`); }

const [contract, placements, register] = await Promise.all([read('data/scene-contract.json', 'Scenkontraktet'), read('api/placements', 'Placeringsplanen'), read('data/scene-rooms.json', 'Rumsregistret')]);
const scene = createScene(canvas, stage, {contract, plan: placements.plan ?? placements, urls: {plate: 'assets/scene/room.png', panorama: 'assets/scene/panorama-vegas.jpg', la: 'assets/scene/panorama-la.jpg', skog: 'assets/scene/panorama-skog.jpg'}, rooms: readRegister(register).rooms, onChange: () => {}, onMissingRoom: () => {}});
// The camera is carried by the page: no aim of the scene's own, no sway.
Object.assign(scene.state, {mode: 'lean', aim: false, sway: false});

// ---- what he sets ----------------------------------------------------------------------------------------------------
const front = FILMS[0], side = FILMS[1];
const look = {
  mirrors: query.get('spegel') === '1',
  angle: 0,
  change: wordNumber(query.get('byte'), front.angle + 1, side.angle - 1, front.angle + CHANGE.share * (side.angle - front.angle)), // degrees, between the first two films
  fade: wordNumber(query.get('toning'), 0, side.angle - front.angle, CHANGE.fade),
};
// Every film has its planes from the start, the mirrored twins too; the ones in use are the films of the list `active`.
const all = withMirrors(FILMS, true);
let active: AngleFilm[] = [], order: number[] = [], range = {lo: 0, hi: 0};
function choose() { active = withMirrors(FILMS, look.mirrors); order = drawOrder(active); range = reach(active); look.angle = Math.min(range.hi, Math.max(range.lo, look.angle)); }
choose(); look.angle = wordNumber(query.get('vinkel'), range.lo, range.hi, 0);
const share = () => (look.change - front.angle) / (side.angle - front.angle);

// ---- the films: one element a file, all kept to one clock -----------------------------------------------------------------
type Media = {path: string; video: HTMLVideoElement; texture: T.VideoTexture; ready: boolean};
const medias = new Map<string, Media>();
function mediaOf(path: string): Media {
  let m = medias.get(path); if (m) return m;
  const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto'; video.loop = true; video.src = path;
  const texture = new T.VideoTexture(video); texture.colorSpace = T.NoColorSpace; texture.minFilter = texture.magFilter = T.LinearFilter; texture.generateMipmaps = false; // as the scene's own films (createPlayers)
  const made: Media = m = {path, video, texture, ready: false}; medias.set(path, made);
  video.addEventListener('loadeddata', () => { made.ready = true; for (const rig of rigs) if (rig.media === made) rig.layers.setTexture(texture); });
  video.addEventListener('seeked', () => { texture.needsUpdate = true; });
  video.addEventListener('error', () => { line.textContent = `Filmen kunde inte läsas: ${path}`; line.classList.add('warn'); });
  return made;
}
const still = query.get('t') !== null;
const clock = {at: 0, playing: !still, last: NaN, duration: 0};
let wantedAt = wordNumber(query.get('t'), 0, 600, 0); // where the address puts the deal, taken up when the films' length is known
function tick(now: number) {
  const list = [...medias.values()];
  if (!clock.duration && list.length && list.every(m => m.ready && m.video.duration > 0)) {
    clock.duration = Math.round(Math.min(...list.map(m => m.video.duration)) * FILM_FPS) / FILM_FPS; clock.at = Math.min(wantedAt, clock.duration - 1 / FILM_FPS); built();
  }
  if (!clock.duration) return;
  if (clock.playing && Number.isFinite(clock.last)) clock.at = loopTime(clock.at + Math.min(0.25, Math.max(0, now - clock.last)), clock.duration);
  clock.last = now;
  for (const {video} of list) {
    if (clock.playing) {
      if (video.paused) void video.play().catch(() => {});
      const rule = follow(behind(clock.at, video.currentTime, clock.duration));
      if (rule.seek && !video.seeking) video.currentTime = clock.at;
      if (video.playbackRate !== rule.rate) video.playbackRate = rule.rate;
    } else {
      if (!video.paused) video.pause();
      const at = frameTime(frameOf(clock.at)); if (Math.abs(video.currentTime - at) > 1e-3 && !video.seeking) video.currentTime = at;
    }
  }
}

// ---- the films in the scene: each on its own two surfaces, turned to its own angle --------------------------------------
// The film shader's fan light is the scene's own piece (src/scene3d-light.ts) with the fan off.
const fan = createFanLight();
type Rig = {film: AngleFilm; media: Media; group: T.Group; eye: T.PerspectiveCamera; vp: T.Matrix4; layers: ReturnType<typeof createFilmLayers>; fade: {value: number}};
const rigs: Rig[] = all.map(film => {
  const vp = new T.Matrix4(), layers = createFilmLayers(vp, fan.uniforms), fade = {value: 1};
  for (const mesh of [layers.body, layers.table]) {
    const material = mesh.material as T.ShaderMaterial, weighted = weightedShader(material.fragmentShader);
    if (!weighted) fail('Scenens filmlager har ändrats så att provsidan inte kan tona mellan filmerna (src/angle-plan.ts, weightedShader).');
    material.fragmentShader = weighted!; material.uniforms.angleFade = fade; material.needsUpdate = true;
  }
  const s = scene.state; layers.setKey({lo: s.keyLo, hi: s.keyHi, shadow: s.shadow, above: s.shadowAbove}); layers.setEdge(s.edgeClean); // the scene's own key
  const group = new T.Group(), eye = new T.PerspectiveCamera(); group.matrixAutoUpdate = false; group.add(layers.body, layers.table, eye);
  return {film, media: mediaOf(film.path), group, eye, vp, layers, fade};
});
const holder = new T.Group(); holder.add(...rigs.map(rig => rig.group));
let orbitDistance = 0; // from the film camera to her line along the floor, scene units
scene.addProp({group: holder, build(edgeZ: number, scale: number) {
  // Her line: BEHIND_EDGE behind the table's edge. Each film's upright plane stands on it (the scene's own film stands its
  // plane on the edge; here the two films must share the line they turn about, or she would shift sideways at the change).
  const camera = scene.status().camera, solved = solveCamera(camera), pivotZ = edgeZ - BEHIND_EDGE * scale; orbitDistance = -pivotZ;
  for (const rig of rigs) {
    rig.layers.place(pivotZ, true, false, scale);
    rig.eye.fov = solved.fovYDeg; rig.eye.aspect = FILM.width / FILM.height; rig.eye.position.set(0, camera.heightM, 0); rig.eye.rotation.set(-solved.pitch, 0, 0, 'YXZ'); rig.eye.updateProjectionMatrix();
    rig.group.matrix.fromArray(rigMatrix(rig.film, pivotZ)); rig.group.updateMatrixWorld(true);
    rig.vp.multiplyMatrices(rig.eye.projectionMatrix, rig.eye.matrixWorldInverse);
  }
}});

// ---- every drawn frame: the clock, the camera's place and each film's weight --------------------------------------------
const written = cameraFromContract(contract);
let shownText = '';
function frame() {
  tick(performance.now() / 1000);
  const camera = scene.status().camera, view = settingFor(orbitView(orbitDistance, look.angle), camera, camera.source === 'lens' ? written : null);
  Object.assign(scene.state, {dx: view.dx, dz: view.dz, yaw: view.yaw, dy: 0, pitch: 0});
  const weightOf = weights(look.angle, active, share(), look.fade);
  for (const rig of rigs) {
    const i = active.findIndex(f => f.id === rig.film.id), w = i < 0 ? 0 : weightOf[i], on = w > 0 && rig.media.ready;
    rig.fade.value = w; rig.layers.body.visible = rig.layers.table.visible = on;
    if (i >= 0) { rig.layers.body.renderOrder = 5 + order[i] * 0.2; rig.layers.table.renderOrder = 5.1 + order[i] * 0.2; } // the scene's own film has 5 and 6; its smoke 7
  }
  // the line: which film, the angle, the frame
  const main = showing(weightOf, order), both = weightOf.filter(w => w > 0).length > 1, frames = clock.duration ? Math.round(clock.duration * FILM_FPS) : 0;
  const seen = [...medias.values()].map(m => frameOf(m.video.currentTime)), apart = clock.duration > 0 && !clock.playing && new Set(seen).size > 1;
  const which = both ? `Tonar: ${active.filter((_, i) => weightOf[i] > 0).map(f => `${f.name} ${decimal(100 * weightOf[active.indexOf(f)])} %`).join(' + ')}` : `Visar: ${active[main]?.name ?? '–'}`;
  const text = !clock.duration ? 'Läser filmerna …' : `${which} · ${decimal(look.angle, 1)}° · ruta ${frameOf(clock.at) + 1}/${frames}${apart ? ` · filmerna står på olika rutor (${seen.map(f => f + 1).join(' och ')})` : ''}`;
  if (text !== shownText) { shownText = line.textContent = text; }
  sync();
}
scene.onFrame(frame);

// ---- the panel ---------------------------------------------------------------------------------------------------------
const sliders: (() => void)[] = [];
function slider(label: string, unit: string, digits: number, bounds: () => {lo: number; hi: number; step: number}, get: () => number, set: (v: number) => void) {
  const input = el('input', {type: 'range'}), out = el('output');
  const show = () => { const b = bounds(); input.min = String(b.lo); input.max = String(b.hi); input.step = String(b.step); const v = get(); if (Number(input.value) !== v) input.value = String(v); out.textContent = `${decimal(v, digits)}${unit}`; };
  input.addEventListener('input', () => { set(Number(input.value)); show(); });
  sliders.push(show); show();
  return el('label', {className: 'row'}, label, input, out);
}
const playButton = el('button', {type: 'button'}), mirrorBox = el('input', {type: 'checkbox', checked: look.mirrors});
function toggle(force?: boolean) { clock.playing = force ?? !clock.playing; clock.last = NaN; }
playButton.addEventListener('click', () => toggle());
mirrorBox.addEventListener('change', () => { look.mirrors = mirrorBox.checked; choose(); });
let shownState = '';
function sync() {
  const state = `${look.angle}|${look.change}|${look.fade}|${look.mirrors}|${clock.playing}|${frameOf(clock.at)}|${clock.duration}`; if (state === shownState) return; shownState = state;
  playButton.textContent = clock.playing ? 'Pausa' : 'Spela'; for (const show of sliders) show();
}
panel.append(
  el('h1', {textContent: 'Vinkelprov'}),
  el('p', {className: 'sub', textContent: 'Samma giv som två filmer: framifrån och från sidan. Dra i bilden eller använd piltangenterna för att se åt sidan.'}),
  el('fieldset', {}, el('legend', {textContent: 'Kamera'}),
    slider('Vinkel', '°', 1, () => ({...range, step: 0.5}), () => look.angle, v => { look.angle = v; }),
    el('div', {className: 'btns'}, ...([['Framifrån', () => front.angle], ['Vid bytet', () => look.change], ['Från sidan', () => side.angle]] as [string, () => number][]).map(([textContent, angle]) => { const b = el('button', {type: 'button', textContent}); b.addEventListener('click', () => { look.angle = angle(); }); return b; }))),
  el('fieldset', {}, el('legend', {textContent: 'Bytet mellan filmerna'}),
    slider('Byte vid', '°', 0, () => ({lo: front.angle + 1, hi: side.angle - 1, step: 1}), () => look.change, v => { look.change = v; }),
    slider('Toning', '°', 0, () => ({lo: 0, hi: 30, step: 1}), () => look.fade, v => { look.fade = v; }),
    el('p', {className: 'note', textContent: 'Toning 0° är ett rakt klipp.'}),
    el('label', {className: 'check'}, mirrorBox, 'Spegelvänd filmen till andra sidan')),
  el('fieldset', {}, el('legend', {textContent: 'Given'}),
    el('div', {className: 'btns'}, playButton),
    slider('Ruta', '', 0, () => ({lo: 1, hi: Math.max(1, Math.round(clock.duration * FILM_FPS)), step: 1}), () => frameOf(clock.at) + 1, v => { toggle(false); clock.at = (v - 1) / FILM_FPS; })),
);
// Called when the films' length is known: the frame slider gets its bounds.
function built() { shownState = ''; }

// ---- mouse and keyboard -----------------------------------------------------------------------------------------------
// Dragging the picture to the left carries the camera to the right, as when a thing is turned by hand; the arrows carry the camera.
const within = (v: number) => Math.min(range.hi, Math.max(range.lo, v));
let drag: {x: number; from: number} | null = null;
canvas.addEventListener('pointerdown', e => { drag = {x: e.clientX, from: look.angle}; canvas.setPointerCapture(e.pointerId); (document.activeElement as HTMLElement | null)?.blur?.(); }); // a slider used before lets go of the arrows
canvas.addEventListener('pointermove', e => { if (drag) look.angle = within(Math.round((drag.from - (e.clientX - drag.x) * 90 / canvas.clientWidth) * 2) / 2); });
for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, () => { drag = null; });
canvas.addEventListener('dblclick', () => { look.angle = 0; });
addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement && e.target.type === 'range' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return; // a slider takes its own arrows
  if (e.code === 'Space') { if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement) return; e.preventDefault(); toggle(); } // a button or a box takes its own space
  else if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') { e.preventDefault(); look.angle = within(look.angle + (e.code === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 5 : 1)); }
});
new ResizeObserver(() => scene.resize()).observe(stage);

// ---- start -------------------------------------------------------------------------------------------------------------
scene.rebuild(); scene.start();
// For a look from outside (tools/lab-look.ts facts) and for the console; not an interface for other pages.
Object.assign(window, {vinkelprov: {scene, fakta: () => ({vinkel: look.angle, byte: look.change, toning: look.fade, spegel: look.mirrors, kamera: scene.status().camera.source, rad: line.textContent,
  filmer: active.map((f, i) => ({id: f.id, vinkel: f.angle, vikt: Number(weights(look.angle, active, share(), look.fade)[i].toFixed(3))})),
  rutor: [...medias.values()].map(m => ({fil: m.path.split('/').pop(), redo: m.ready, ruta: frameOf(m.video.currentTime) + 1, bredd: m.video.videoWidth, hojd: m.video.videoHeight})), spelar: clock.playing, tid: Number(clock.at.toFixed(3))})}});
