// Page code of props.html: the model lab. Jakob's models (data/props.json, assets/props/<id>.glb) one at a time on a
// studio floor, in other looks and in movement; the table also with the dealer's film behind it and the game's room around
// (src/props-stage.ts). A lab on a side track: everything here is read only and worked out in the
// browser while it is looked at. Nothing is written, and nothing the game or the film uses is touched. A look that should
// become real needs a generated texture set of its own per model; what is shown here is derived from the model's own.
//
// The first half is the look logic and has no page in it: which texels of a model's own base colour are its accents, what
// each look makes of a texel, which triangles face the wrong way, and where a movement is at a time.
// tools/props-lab.test.ts runs it under Node. The second half is the page, started only where there is a document.
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {createStage, stageFit, ROOMS, roomKey, keyStrength, turnY, footprint, createShell, createGround, loadPhotoMaps, photoMaterial, type StageFit, type RoomId, type RoomKey, type HandsId, type PhotoMaps} from './props-stage.ts';

// ── what the panel offers ───────────────────────────────────────────────────
export type LookId = 'original' | 'ivory' | 'gold' | 'ivory-gold' | 'lacquer-gold' | 'photo';
export type MotionId = 'still' | 'turn' | 'present' | 'sweep';
export type LightId = 'warm' | 'neutral' | 'cool';
export type StageId = 'alone' | 'scene';
export const STAGES: {id: StageId; label: string; note: string}[] = [
  {id: 'alone', label: 'Ensam', note: 'Modellen ensam på ett golv.'},
  {id: 'scene', label: 'Med dealer och rum', note: 'Bordet med dealern bakom och spelets rum omkring, sett längs spelkamerans siktlinje men längre bak. Ett prov på helheten: hon är spelets vilofilm på en plan skiva bakom bordet, så vrid bara lite. Filmens egen sko är borttagen eftersom bordet har sin egen.'},
];
/** accents: the look has two materials, and "Hur mycket guld" decides where one ends and the other begins. */
export const LOOKS: {id: LookId; label: string; note: string; accents: boolean}[] = [
  {id: 'original', label: 'Som den kom', note: 'Modellens egna bilder, som den kom från Meshy. Formen är förenklad för webben.', accents: false},
  {id: 'ivory', label: 'Elfenben', note: 'Hela föremålet i elfenben. Ytans struktur och lite av originalets ljus och mörker finns kvar.', accents: false},
  {id: 'gold', label: 'Guld', note: 'Hela föremålet i polerat guld.', accents: false},
  {id: 'ivory-gold', label: 'Elfenben och guld', note: 'Det som var guld, mässing eller starkt färgat i originalet blir guld. Resten blir elfenben.', accents: true},
  {id: 'lacquer-gold', label: 'Svart lack och guld', note: 'Samma guld, men resten i blank svart lack, som skon i filmen.', accents: true},
  {id: 'photo', label: 'Fotomaterial', note: 'Rumsstudiens fotograferade material där bordets egen färg är filt, trä eller läder: matt väv i filten, trä med ådring i mahognyns färg och läder med narv. Trycket, mässingen, markerna och skon är som de kom. Gjort för bordet.', accents: false},
];
// The stage's room and how it meets the table (src/props-stage.ts). Each choice's first item is the stage as it was, except the
// light: the studio's light on a table in a room it is not in was wrong, so the room's light is where the stage begins.
export type StageLightId = 'studio' | 'room';
export type FloorId = 'none' | 'room';
export const STAGE_LIGHTS: {id: StageLightId; label: string; note: string}[] = [
  {id: 'studio', label: 'Studions', note: 'Som förut: bordet lyst av labbets neutrala studiorum och en vit lampa snett ovanifrån, inte av rummet som syns.'},
  {id: 'room', label: 'Från rummet', note: 'Bordet lyst av rummet som syns: samma bild ger ljus och speglingar, och en mjuk lampa där bilden är ljusast kastar bordets skugga (rumsstudiens sätt).'},
];
export const FLOORS: {id: FloorId; label: string; note: string}[] = [
  {id: 'none', label: 'Inget', note: 'Som förut: rummet är en bild långt bort, och bordet står på ingenting.'},
  {id: 'room', label: 'Rummets golv', note: 'Rummets bild läggs på ett golv under bordet, och bordet kastar sin skugga där.'},
];
export const HANDS: {id: HandsId; label: string; note: string}[] = [
  {id: 'behind', label: 'Bakom kanten', note: 'Som förut: hela filmen på en skiva bakom bordskanten, så att bordets kant och bricka skär av hennes händer.'},
  {id: 'felt', label: 'På filten', note: 'Filmen viks som i 3D-scenen: överkroppen vid bordskanten, händerna, underarmarna och deras skuggor på bordets filt.'},
];
export const MOTIONS: {id: MotionId; label: string; note: string}[] = [
  {id: 'still', label: 'Stilla', note: 'Föremålet står still.'},
  {id: 'turn', label: 'Snurrar', note: 'Snurrar långsamt runt, ett varv på en knapp halvminut.'},
  {id: 'present', label: 'Visas upp', note: 'Lyfter lite, vänder sig ett varv och sätter sig igen.'},
  {id: 'sweep', label: 'Ljus sveper', note: 'Föremålet står still medan ett ljus rör sig över det, så att glansen syns.'},
];
/** tint: what the room's lamps and the key light are multiplied by, linear red, green, blue. */
export const LIGHTS: {id: LightId; label: string; tint: [number, number, number]}[] = [
  {id: 'warm', label: 'Varmt', tint: [1, 0.82, 0.62]},
  {id: 'neutral', label: 'Neutralt', tint: [1, 1, 1]},
  {id: 'cool', label: 'Kallt', tint: [0.76, 0.87, 1]},
];
export const DEFAULTS = {look: 'original' as LookId, gold: 0.5, gloss: 0.6, motion: 'turn' as MotionId, light: 'neutral' as LightId, exposure: 1, stage: 'alone' as StageId,
  room: 'vegas' as RoomId, stageLight: 'room' as StageLightId, floor: 'none' as FloorId, hands: 'behind' as HandsId};

const MODEL_NAMES: Record<string, string> = {shoe: 'Sko', tray: 'Markerbricka', table: 'Bord'};
/** The Swedish name of a model of data/props.json; a model the page has no name for goes by its id. */
export const modelName = (id: string) => MODEL_NAMES[id] ?? id;
/** The models of data/props.json, in its order: every entry with an id the lab server would serve a file for. stage: where a table has its felt, when the entry says. */
export function propList(data: unknown): {id: string; stage?: StageFit}[] {
  const props = (data as {props?: unknown} | null)?.props;
  return (Array.isArray(props) ? props : []).filter((p): p is {id: string; stage?: unknown} => typeof p?.id === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.id)).map(p => { const stage = stageFit(p.stage); return stage ? {id: p.id, stage} : {id: p.id}; });
}
/** Width × height × depth in metres, as it is written in Swedish. */
export const sizeText = (x: number, y: number, z: number) => `${[x, y, z].map(v => v.toFixed(2).replace('.', ',')).join(' × ')} m`;

// ── which texels are the accents ────────────────────────────────────────────
export const clamp01 = (v: number) => v < 0 ? 0 : v > 1 ? 1 : v;
/** 0 at a and below, 1 at b and above, a straight line between. */
export const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const smooth = (v: number) => v * v * (3 - 2 * v), smoother = (v: number) => v * v * v * (v * (v * 6 - 15) + 10);
const plateau = (v: number, [a, b, c, d]: number[]) => Math.min(ramp(v, a, b), 1 - ramp(v, c, d));

// The rule, in three ranks. Hue in degrees, saturation and value 0–1, all of the texel's sRGB colour as it is stored.
//   1. gold or brass: a yellow hue (full between 30° and 58°, nothing outside 22°–70°) that is neither pale (saturation
//      ramps in over 0.12–0.30) nor dark (value over 0.25–0.50). Scores up to 1.
//   2. brightly coloured, any hue: saturated (0.15–0.50) and light enough to read as a colour (value 0.30–0.50), such as
//      the chips. Scores up to 0.8.
//   3. coloured but dark, such as red wood and green felt: scores up to 0.4, warm hues (−10°–80°) in full and the others
//      at 0.6 of it, so that wood turns before felt.
// Black, grey and white score 0. The slider draws its line through these scores (goldShare).
export const ACCENT = {
  goldHue: [22, 30, 58, 70], goldSaturation: [0.12, 0.30], goldValue: [0.25, 0.50],
  vividSaturation: [0.15, 0.50], vividValue: [0.30, 0.50], vividWeight: 0.8,
  deepWeight: 0.4, warmHue: [-40, -10, 80, 110], coolShare: 0.6,
  soft: 0.05, // half the width of the line between gold and not gold, in score
};
/** How much of an accent a texel of the model's own base colour is, 0–1 (red, green and blue 0–255). */
export function accentScore(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), spread = max - min;
  if (spread <= 0) return 0;
  const value = max / 255, saturation = spread / max;
  const hue = 60 * (max === r ? ((g - b) / spread + 6) % 6 : max === g ? (b - r) / spread + 2 : (r - g) / spread + 4);
  const gold = plateau(hue, ACCENT.goldHue) * ramp(saturation, ACCENT.goldSaturation[0], ACCENT.goldSaturation[1]) * ramp(value, ACCENT.goldValue[0], ACCENT.goldValue[1]);
  const coloured = ramp(saturation, ACCENT.vividSaturation[0], ACCENT.vividSaturation[1]);
  const vivid = ACCENT.vividWeight * coloured * ramp(value, ACCENT.vividValue[0], ACCENT.vividValue[1]);
  const deep = ACCENT.deepWeight * coloured * (ACCENT.coolShare + (1 - ACCENT.coolShare) * plateau(hue > 180 ? hue - 360 : hue, ACCENT.warmHue));
  return Math.max(gold, vivid, deep);
}
/** The share of gold in a texel with that score when the slider stands at amount (0: nothing is gold, 1: everything is). */
export function goldShare(score: number, amount: number): number {
  const line = 1 + ACCENT.soft - clamp01(amount) * (1 + 2 * ACCENT.soft);
  return smooth(ramp(score, line - ACCENT.soft, line + ACCENT.soft));
}

// ── what a look makes of a texel ────────────────────────────────────────────
// colour: sRGB 0–255. rough: roughness before the Glans slider scales it. coat: a clear layer on top. shade and grain: how
// much the model's own light and dark stays in the colour and in the roughness, so that the print, the grain and the
// seams of the original can still be read and the surface is not one flat tone.
type Substance = {colour: [number, number, number]; metal: number; rough: number; coat: number; shade: number; grain: number};
export const SUBSTANCE: Record<'ivory' | 'gold' | 'lacquer', Substance> = {
  ivory: {colour: [234, 211, 168], metal: 0, rough: 0.8, coat: 0.3, shade: 0.2, grain: 0.1},
  gold: {colour: [250, 204, 116], metal: 1, rough: 0.4, coat: 0, shade: 0.14, grain: 0.15},
  lacquer: {colour: [15, 14, 16], metal: 0, rough: 0.4, coat: 1, shade: 0, grain: 0},
};
/** score: accentScore of each texel, 0–255. light: how light the original is there (root of its luma), 0–255. */
export type Analysis = {score: Uint8Array; light: Uint8Array};
export type Painted = {colour: Uint8Array; surface: Uint8Array};
/** Reads a base colour image (RGBA bytes, row after row) once; every look of that model is painted from the result. */
export function analyse(pixels: ArrayLike<number>): Analysis {
  const count = Math.floor(pixels.length / 4), score = new Uint8Array(count), light = new Uint8Array(count);
  for (let i = 0, p = 0; i < count; i++, p += 4) {
    const r = pixels[p], g = pixels[p + 1], b = pixels[p + 2];
    score[i] = Math.round(accentScore(r, g, b) * 255);
    light[i] = Math.round(Math.sqrt((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * 255);
  }
  return {score, light};
}
/**
 * The textures of a look: colour (sRGB, RGBA) and surface (red: clear coat, green: roughness, blue: metalness, the
 * channels three.js reads them from). amount is the "Hur mycket guld" slider and matters to the looks with accents.
 * Pass the previous result as out to paint into the same memory.
 */
export function paintLook(look: LookId, analysis: Analysis, amount: number, out?: Painted): Painted {
  if (look === 'original') throw Error('The original look is the model\'s own material; there is nothing to paint.');
  if (look === 'photo') throw Error('The photo look is the model\'s own material with photographed maps laid on in the shader (photoMaterial); there is nothing to paint.');
  const count = analysis.score.length, colour = out?.colour ?? new Uint8Array(count * 4), surface = out?.surface ?? new Uint8Array(count * 4);
  const base = look === 'lacquer-gold' ? SUBSTANCE.lacquer : SUBSTANCE.ivory, gold = SUBSTANCE.gold;
  const share = new Float32Array(256);
  for (let s = 0; s < 256; s++) share[s] = look === 'ivory' ? 0 : look === 'gold' ? 1 : goldShare(s / 255, amount);
  // Per lightness of the original: each substance's colour and roughness there.
  const table = (substance: Substance) => {
    const t = new Float32Array(256 * 4);
    for (let l = 0; l < 256; l++) { const dark = 1 - l / 255, k = 1 - substance.shade * dark; t[l * 4] = substance.colour[0] * k; t[l * 4 + 1] = substance.colour[1] * k; t[l * 4 + 2] = substance.colour[2] * k; t[l * 4 + 3] = 255 * clamp01(substance.rough + substance.grain * dark); }
    return t;
  };
  const a = table(base), g = table(gold);
  for (let i = 0, p = 0; i < count; i++, p += 4) {
    const w = share[analysis.score[i]], v = 1 - w, l = analysis.light[i] * 4;
    colour[p] = a[l] * v + g[l] * w + 0.5; colour[p + 1] = a[l + 1] * v + g[l + 1] * w + 0.5; colour[p + 2] = a[l + 2] * v + g[l + 2] * w + 0.5; colour[p + 3] = 255;
    surface[p] = 255 * (base.coat * v + gold.coat * w) + 0.5; surface[p + 1] = a[l + 3] * v + g[l + 3] * w + 0.5; surface[p + 2] = 255 * (base.metal * v + gold.metal * w) + 0.5; surface[p + 3] = 255;
  }
  return {colour, surface};
}
/** Glans 0–1 as the factor the painted roughness is multiplied by: 1 (satin) down to 0.1 (mirror). */
export const glossFactor = (gloss: number) => 1 - 0.9 * clamp01(gloss);

// ── triangles that face the wrong way ───────────────────────────────────────
// The thinned meshes hold triangles wound against their own vertex normals. A double-sided material lights such a triangle
// from inside (a dark fleck on a pale look); a single-sided one leaves a hole. The page turns them in memory when it reads
// a model, so every look is judged on a whole surface. The file is not changed.
/** Rewinds every triangle of index (three vertices each) that faces away from the sum of its vertex normals; returns how many. */
export function alignWinding(index: {length: number; [at: number]: number}, positions: ArrayLike<number>, normals: ArrayLike<number>): number {
  let turned = 0;
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t] * 3, b = index[t + 1] * 3, c = index[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const facing = (uy * vz - uz * vy) * (normals[a] + normals[b] + normals[c]) + (uz * vx - ux * vz) * (normals[a + 1] + normals[b + 1] + normals[c + 1]) + (ux * vy - uy * vx) * (normals[a + 2] + normals[b + 2] + normals[c + 2]);
    if (facing < 0) { const keep = index[t + 1]; index[t + 1] = index[t + 2]; index[t + 2] = keep; turned++; }
  }
  return turned;
}

// ── where a movement is at a time ───────────────────────────────────────────
// Seconds and the stage's own unit (the model is scaled so that half its diagonal is 1). Calm on purpose.
export const MOTION = {turnSeconds: 28, presentSeconds: 12, lift: 0.1, sweepSeconds: 10};
/**
 * The pose t seconds after a movement was chosen. yaw: radians the model has turned. lift: how high it floats. sweep: where
 * the travelling light is, −1 (left) to 1 (right). glow: how strongly that light shines, 0–1.
 */
export function motionPose(motion: MotionId, t: number): {yaw: number; lift: number; sweep: number; glow: number} {
  const time = Math.max(0, t), turn = 2 * Math.PI;
  if (motion === 'turn') return {yaw: time / MOTION.turnSeconds * turn % turn, lift: 0, sweep: 0, glow: 0};
  if (motion === 'present') {
    // One round: rest, rise, a full turn that starts while it rises and ends as it sinks, rest. It ends as it began.
    const u = time % MOTION.presentSeconds;
    return {yaw: turn * smoother(ramp(u, 1.6, 9.8)) % turn, lift: MOTION.lift * smooth(ramp(u, 0.8, 3)) * (1 - smooth(ramp(u, 8.4, 10.8))), sweep: 0, glow: 0};
  }
  if (motion === 'sweep') return {yaw: 0, lift: 0, sweep: Math.sin(time / MOTION.sweepSeconds * turn), glow: smooth(ramp(time, 0, 1.2))};
  return {yaw: 0, lift: 0, sweep: 0, glow: 0};
}

// ── the page ────────────────────────────────────────────────────────────────
// The staged table's view. pull: how much further back than the game's camera the view starts, in distances to the dealer. fov:
// its lens, degrees. back: the backed-away view that shows the legs and the floor (eye and aim in the model's metres, from where a
// standing guest would look at the table from a few steps away). blur: how blurred the room is shown without a floor. The
// rooms, how they are turned and how bright they are shown, are ROOMS in src/props-stage.ts.
const STAGE_ROOM = {pull: 1.75, fov: 38, back: {eye: [0, 1.55, 3.4], at: [0, 0.62, -0.1]}, blur: 0.08};
// The room's key: how far from the table it stands (world units; only its direction counts) and the half-size of the box its
// shadow is drawn in (world units, the table's size in the lab plus a margin), its shadow's resolution and softness.
const SUN = {distance: 6, reach: 1.3, mapSize: 2048, radius: 5};
const STAGE = {
  backdrop: 0x0b0c0c, floor: 0x151717, fov: 30, azimuth: 32, elevation: 27, flatElevation: 40, // flat: a model much wider than tall is looked at from higher up
  key: 4, sweep: 3.2, room: 0.5, // light strengths: the key lamp, the travelling light, the room's reflections
  maxTexture: 2048,
};
type Part = {mesh: T.Mesh; original: T.Material; derived: T.MeshPhysicalMaterial | null; analysis: Analysis | null; painted: Painted | null; colour: T.DataTexture | null; surface: T.DataTexture | null; shown: string; plain: boolean; photo: T.MeshStandardMaterial | null};
type Model = {id: string; fit: T.Group; object: T.Object3D; size: T.Vector3; height: number; flat: boolean; triangles: number; turned: number; textureSize: number | null; parts: Part[]};

async function start() {
  const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
  const stage = $('stage'), canvas = $<HTMLCanvasElement>('view'), hudBox = $('hud'), failBox = $('fail');
  const query = new URLSearchParams(location.search);
  if (query.get('ui') === '0') document.body.classList.add('noui');
  const oneOf = <V extends {id: string}>(list: V[], id: string | null, otherwise: V['id']) => list.some(item => item.id === id) ? id as V['id'] : otherwise;
  // Someone who has asked their system for less movement meets the model standing still.
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {model: '', look: oneOf(LOOKS, query.get('look'), DEFAULTS.look), gold: DEFAULTS.gold, gloss: DEFAULTS.gloss, motion: oneOf(MOTIONS, query.get('motion'), calm ? 'still' : DEFAULTS.motion), light: oneOf(LIGHTS, query.get('light'), DEFAULTS.light), exposure: DEFAULTS.exposure, stage: DEFAULTS.stage,
    room: oneOf(ROOMS, query.get('room'), DEFAULTS.room), stageLight: oneOf(STAGE_LIGHTS, query.get('ljus'), DEFAULTS.stageLight), floor: oneOf(FLOORS, query.get('golv'), DEFAULTS.floor), hands: oneOf(HANDS, query.get('hander'), DEFAULTS.hands)};
  let problem = '', loading = '';

  // ── the studio ──
  let renderer: T.WebGLRenderer;
  try { renderer = new T.WebGLRenderer({canvas, antialias: true}); } catch { failBox.textContent = '3D-vyn kunde inte startas i den här webbläsaren (WebGL saknas eller är avstängt).'; throw Error('WebGL is not available.'); }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
  const scene = new T.Scene(); scene.background = new T.Color(STAGE.backdrop); scene.fog = new T.Fog(STAGE.backdrop, 9, 24); scene.environmentIntensity = STAGE.room;
  const camera = new T.PerspectiveCamera(STAGE.fov, 1, 0.05, 80);
  const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 1.6; controls.maxDistance = 8; controls.maxPolarAngle = Math.PI / 2 - 0.04;
  // The floor is far wider than the fog reaches, so it fades into the backdrop instead of ending.
  const floor = new T.Mesh(new T.CircleGeometry(30, 96), new T.MeshStandardMaterial({color: STAGE.floor, roughness: 0.92, metalness: 0, dithering: true})); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
  // The key lamp: a wide soft cone from the upper left that lays a pool of light and the model's shadow on the floor.
  const key = new T.SpotLight(0xffffff, STAGE.key, 0, 0.5, 0.9, 0); key.position.set(-2.6, 5.4, 3.2); key.target.position.set(0, 0.4, 0); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.near = 2; key.shadow.camera.far = 14; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 4;
  // The travelling light of "Ljus sveper": dark until that movement is chosen.
  const sweepLight = new T.DirectionalLight(0xffffff, 0); sweepLight.target.position.set(0, 0.4, 0);
  const holder = new T.Group(); // the model stands in it; the movements turn and lift it
  // The staged room's key: dark until the stage is lit by its room; then it shines from where the room's panorama is brightest.
  const sun = new T.DirectionalLight(0xffffff, 0); sun.castShadow = false; sun.shadow.mapSize.set(SUN.mapSize, SUN.mapSize); sun.shadow.radius = SUN.radius; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  Object.assign(sun.shadow.camera, {left: -SUN.reach, right: SUN.reach, top: SUN.reach, bottom: -SUN.reach, near: 0.1, far: 2 * SUN.distance + 4});
  scene.add(floor, key, key.target, sweepLight, sweepLight.target, sun, sun.target, holder);
  // The room the polish reflects: three.js's neutral room, its lamps tinted by the light preset, as a prefiltered map.
  const pmrem = new T.PMREMGenerator(renderer), rooms = new Map<LightId, T.Texture>();
  function roomOf(id: LightId): T.Texture {
    let texture = rooms.get(id);
    if (!texture) {
      const tint = new T.Color().setRGB(...LIGHTS.find(l => l.id === id)!.tint), room = new RoomEnvironment();
      room.traverse(node => { const material = (node as T.Mesh).material as T.MeshBasicMaterial | undefined; if (material?.isMeshBasicMaterial) material.color.multiply(tint); if ((node as T.PointLight).isPointLight) (node as T.PointLight).color.multiply(tint); });
      texture = pmrem.fromScene(room, 0.04).texture; room.dispose(); rooms.set(id, texture);
    }
    return texture;
  }

  // ── models ──
  const props = await fetch('data/props.json').then(res => res.ok ? res.json() : null).catch(() => null).then(propList);
  if (!props.length) { failBox.textContent = 'Listan över modeller kunde inte läsas (data/props.json). Starta labbet med START.cmd och ladda om.'; throw Error('data/props.json could not be read.'); }
  const models = new Map<string, Promise<Model>>(); let model: Model | null = null;
  const fileOf = (id: string) => `assets/props/${id}.glb`;
  async function load(id: string): Promise<Model> {
    const gltf = await new GLTFLoader().loadAsync(fileOf(id)), object = gltf.scene, parts: Part[] = [];
    let triangles = 0, turned = 0, textureSize: number | null = null;
    object.traverse(node => {
      const mesh = node as T.Mesh; if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = true;
      const original = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material, map = (original as T.MeshStandardMaterial).map;
      triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
      if (mesh.geometry.index && mesh.geometry.attributes.normal) turned += alignWinding(mesh.geometry.index.array, mesh.geometry.attributes.position.array, mesh.geometry.attributes.normal.array);
      if (map?.image) textureSize = Math.max(textureSize ?? 0, (map.image as ImageBitmap).width);
      parts.push({mesh, original, derived: null, analysis: null, painted: null, colour: null, surface: null, shown: '', plain: false, photo: null});
    });
    // Every model is brought to the same size on the stage (half its diagonal is 1), standing on the floor over the centre.
    const box = new T.Box3().setFromObject(object), size = box.getSize(new T.Vector3()), centre = box.getCenter(new T.Vector3()), unit = 2 / Math.max(size.length(), 1e-6), fit = new T.Group();
    object.position.set(-centre.x, -box.min.y, -centre.z); fit.add(object); fit.scale.setScalar(unit);
    return {id, fit, object, size, height: size.y * unit, flat: size.y < 0.2 * Math.max(size.x, size.z), triangles: Math.round(triangles), turned, textureSize, parts};
  }

  // ── looks ──
  // The model's own base colour read back as bytes, once per part; null when it has none or it cannot be read.
  function pixelsOf(part: Part): {data: Uint8ClampedArray; width: number; height: number} | null {
    try {
      const image = (part.original as T.MeshStandardMaterial).map?.image as ImageBitmap | undefined; if (!image?.width) return null;
      const scale = Math.min(1, STAGE.maxTexture / Math.max(image.width, image.height)), width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
      const context = Object.assign(document.createElement('canvas'), {width, height}).getContext('2d', {willReadFrequently: true})!;
      context.drawImage(image, 0, 0, width, height);
      return {data: context.getImageData(0, 0, width, height).data, width, height};
    } catch { return null; }
  }
  function derive(part: Part) {
    const own = part.original as T.MeshStandardMaterial, pixels = pixelsOf(part), width = pixels?.width ?? 1, height = pixels?.height ?? 1;
    // Without a base colour there is nothing to choose accents from: one mid-grey texel stands in, and the page says so.
    part.plain = !pixels; part.analysis = analyse(pixels?.data ?? [128, 128, 128, 255]);
    part.painted = {colour: new Uint8Array(width * height * 4), surface: new Uint8Array(width * height * 4)};
    const texture = (data: Uint8Array, colourSpace: T.ColorSpace) => {
      const t = new T.DataTexture(data, width, height, T.RGBAFormat, T.UnsignedByteType);
      t.colorSpace = colourSpace; t.wrapS = own.map?.wrapS ?? T.RepeatWrapping; t.wrapT = own.map?.wrapT ?? T.RepeatWrapping; t.magFilter = T.LinearFilter; t.minFilter = T.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return t;
    };
    part.colour = texture(part.painted.colour, T.SRGBColorSpace); part.surface = texture(part.painted.surface, T.NoColorSpace);
    // The surface detail of every look is the model's own normal map.
    part.derived = new T.MeshPhysicalMaterial({map: part.colour, roughnessMap: part.surface, metalnessMap: part.surface, clearcoatMap: part.surface, metalness: 1, roughness: 1, clearcoat: 1, normalMap: own.normalMap ?? null, side: own.side});
    if (own.normalScale) part.derived.normalScale.copy(own.normalScale);
  }
  // The photographed maps, read the first time "Fotomaterial" is chosen; until they are there the model wears its own.
  let photoMaps: PhotoMaps | null = null, photoAsked = false, photoProblem = false;
  function applyLook() {
    if (!model) return;
    for (const part of model.parts) {
      if (state.look === 'photo') {
        if (!photoMaps && !photoAsked) { photoAsked = true; loadPhotoMaps().then(maps => { photoMaps = maps; applyLook(); }, () => { photoProblem = true; sync(); }); }
        if (photoMaps && !part.photo && (part.original as T.MeshStandardMaterial).isMeshStandardMaterial) part.photo = photoMaterial(part.original as T.MeshStandardMaterial, photoMaps);
        part.mesh.material = part.photo ?? part.original; continue;
      }
      if (state.look === 'original') { part.mesh.material = part.original; continue; }
      if (!part.derived) derive(part);
      const look = LOOKS.find(l => l.id === state.look)!, wanted = `${state.look}:${look.accents ? state.gold : ''}`;
      if (part.shown !== wanted) { paintLook(state.look, part.analysis!, state.gold, part.painted!); part.colour!.needsUpdate = part.surface!.needsUpdate = true; part.shown = wanted; }
      part.derived!.roughness = glossFactor(state.gloss); part.derived!.clearcoatRoughness = 0.45 - 0.42 * state.gloss;
      part.mesh.material = part.derived!;
    }
    dirty = true;
  }

  // ── the whole picture: dealer and room around a table (src/props-stage.ts) ──
  // The studio's floor and backdrop give way to a room, the dealer's film stands behind the table, and the view starts where the
  // game's camera is. Made the first time it is asked for; a model without a felt of its own cannot have it.
  const fitOf = (id: string) => props.find(p => p.id === id)?.stage ?? null, backdrop = scene.background, fog = scene.fog, reach = {min: controls.minDistance, max: controls.maxDistance, polar: controls.maxPolarAngle};
  let rig: ReturnType<typeof createStage> | null = null, staged = false, stageProblem = '';
  // Each room's panorama is read once, the first time it is shown, with its prefiltered light, its key (read from a small copy of
  // the picture) and, when it is asked for, the panorama laid on a floor. `lit` is the room on show.
  type Lit = {map: T.Texture; env: T.Texture; key: RoomKey; shell: T.Mesh | null};
  const litRooms = new Map<RoomId, Promise<Lit>>(), roomNow = () => ROOMS.find(r => r.id === state.room)!;
  let lit: Lit | null = null, ground: {id: string; group: T.Group} | null = null, shell: T.Mesh | null = null;
  function readRoom(id: RoomId): Promise<Lit> {
    let promise = litRooms.get(id);
    if (!promise) {
      promise = new T.TextureLoader().loadAsync(ROOMS.find(r => r.id === id)!.file).then(map => {
        map.mapping = T.EquirectangularReflectionMapping; map.colorSpace = T.SRGBColorSpace;
        const small = Object.assign(document.createElement('canvas'), {width: 256, height: 128}), g = small.getContext('2d', {willReadFrequently: true})!;
        g.drawImage(map.image as HTMLImageElement, 0, 0, 256, 128);
        return {map, env: pmrem.fromEquirectangular(map).texture, key: roomKey(g.getImageData(0, 0, 256, 128).data, 256, 128), shell: null};
      });
      litRooms.set(id, promise); promise.catch(() => litRooms.delete(id));
    }
    return promise;
  }
  async function setStage(id: StageId) {
    state.stage = id; stageProblem = '';
    if (id === 'scene' && !fitOf(state.model)) { const table = props.find(p => p.stage); if (table) await choose(table.id); else state.stage = 'alone'; }
    if (state.stage === 'scene') try {
      if (!rig) { const contract = await fetch('data/scene-contract.json').then(res => res.ok ? res.json() : Promise.reject(Error('data/scene-contract.json'))); rig = createStage(contract); }
      lit = await readRoom(state.room);
    } catch { state.stage = 'alone'; stageProblem = 'Scenen med dealer och rum kunde inte läsas (spelets kamera eller rummets bild saknas).'; }
    showStage(); sync();
  }
  async function setRoom(id: RoomId) {
    state.room = id; stageProblem = '';
    if (state.stage === 'scene') try { const next = await readRoom(id); if (state.room === id) { lit = next; showStage(false); } } catch { stageProblem = 'Rummets bild kunde inte läsas (assets/scene/).'; }
    sync();
  }
  /** Puts the dealer and the room around the model on the floor, or takes them away; called whenever the model or a choice of the stage changes. */
  function showStage(rehome = true) {
    const fit = state.stage === 'scene' && rig && model ? fitOf(model.id) : null; staged = !!fit;
    if (rig) { rig.group.removeFromParent(); if (fit) { rig.place(fit); rig.seat(state.hands); model!.object.add(rig.group); rig.play(); } else rig.pause(); }
    // The room as a far picture, or laid on a floor that the table stands on and takes its shadow.
    const room = roomNow(), floored = staged && state.floor === 'room' && !!lit; shell?.removeFromParent(); ground?.group.removeFromParent(); shell = null;
    if (floored) {
      shell = lit!.shell ??= createShell(lit!.map, room); model!.object.add(shell);
      if (ground?.id !== model!.id) { const foot = footprint((model!.parts[0].mesh.geometry.getAttribute('position') as T.BufferAttribute).array); ground = foot ? {id: model!.id, group: createGround(foot)} : null; }
      if (ground) model!.object.add(ground.group);
    }
    floor.visible = !staged; scene.background = staged ? (floored ? new T.Color(STAGE.backdrop) : lit?.map ?? backdrop) : backdrop; scene.fog = staged ? null : fog;
    scene.backgroundBlurriness = staged ? STAGE_ROOM.blur : 0; scene.backgroundRotation.y = staged ? room.turn : 0; scene.backgroundIntensity = staged ? room.shown : 1;
    if (staged) setMotion('still');
    setLight();
    if (rehome) home();
  }

  // ── the view ──
  let dirty = true, yawBase = 0, motionStart = performance.now(), lift = 0, glow = 0, swept = 0, last = performance.now(), repaint = false;
  function resize() {
    const box = stage.getBoundingClientRect(), width = Math.max(1, Math.round(box.width)), height = Math.max(1, Math.round(box.height));
    renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix(); dirty = true;
  }
  /** The model and the camera as the page first shows them: unturned, three quarters from the front, far enough to hold all of it. The movement starts over. */
  function home(view: {azimuth?: number; elevation?: number; zoom?: number; back?: boolean} = {}) {
    yawBase = 0; holder.rotation.y = 0; holder.position.y = 0; lift = 0; motionStart = performance.now();
    controls.minDistance = reach.min; controls.maxDistance = reach.max; controls.maxPolarAngle = reach.polar; controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity; camera.fov = STAGE.fov;
    if (staged && rig) { // the game camera's own place and lens; from there the view can be turned a little and moved in and out
      scene.updateMatrixWorld(true); const pose = rig.pose(camera.aspect);
      // The game's camera stands over the table's middle with a wide lens (the film's own table is shallower than a model's). The
      // view starts on the same line of sight, further back and with a longer lens, so that the whole table is in the picture
      // and she is not dwarfed by its near edge. Backed away, a guest's eye a few steps off: legs and floor in the picture.
      camera.fov = STAGE_ROOM.fov;
      if (view.back) { controls.target.copy(model!.object.localToWorld(new T.Vector3(...STAGE_ROOM.back.at))); camera.position.copy(model!.object.localToWorld(new T.Vector3(...STAGE_ROOM.back.eye))); }
      else { controls.target.copy(pose.target); camera.position.copy(pose.target).addScaledVector(pose.eye.clone().sub(pose.target).normalize(), pose.reach * (1 + STAGE_ROOM.pull) / (view.zoom ?? 1)); }
      controls.minDistance = pose.reach * 0.45; controls.maxDistance = pose.reach * 6; controls.minAzimuthAngle = -0.7; controls.maxAzimuthAngle = 0.7; controls.maxPolarAngle = Math.PI / 2 - 0.02;
      camera.updateProjectionMatrix(); controls.update(); dirty = true; return;
    }
    camera.updateProjectionMatrix();
    const height = model?.height ?? 1, vertical = STAGE.fov * Math.PI / 180, narrow = Math.min(vertical, 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect));
    // Half the model's diagonal is 1. Lying, the height of the picture is the limit and the models are wider than tall, so the
    // camera can stand a little closer than that; standing (a phone), the width is the limit and it cannot.
    const distance = Math.min(controls.maxDistance, (camera.aspect < 1 ? 1.1 : 0.9) / Math.sin(narrow / 2)) / (view.zoom ?? 1), azimuth = (view.azimuth ?? STAGE.azimuth) * Math.PI / 180, elevation = (view.elevation ?? (model?.flat ? STAGE.flatElevation : STAGE.elevation)) * Math.PI / 180;
    controls.target.set(0, height / 2, 0);
    camera.position.set(Math.sin(azimuth) * Math.cos(elevation) * distance, height / 2 + Math.sin(elevation) * distance, Math.cos(azimuth) * Math.cos(elevation) * distance);
    controls.update(); dirty = true;
  }
  function setMotion(id: MotionId) { yawBase = holder.rotation.y % (2 * Math.PI); motionStart = performance.now(); state.motion = id; dirty = true; }
  // Staged and lit by its room: the room's own panorama, prefiltered, is the light and what the polish reflects, as bright as the
  // room is shown; the studio's lamp is dark and the room's key shines from where the panorama is brightest, aimed at the table.
  const roomLit = () => staged && state.stageLight === 'room' && !!lit;
  function setLight() {
    const tint = LIGHTS.find(l => l.id === state.light)!.tint, own = roomLit(); key.color.setRGB(...tint); sweepLight.color.setRGB(...tint); renderer.toneMappingExposure = state.exposure;
    key.castShadow = !own; sun.castShadow = own;
    if (own) {
      const room = roomNow(), k = lit!.key; scene.environment = lit!.env; scene.environmentIntensity = room.shown;
      sun.color.setRGB(...k.colour); sun.intensity = keyStrength(k, room.shown);
      model!.object.updateWorldMatrix(true, false); const aim = model!.object.localToWorld(new T.Vector3(0, 0.6, 0));
      sun.target.position.copy(aim); sun.position.copy(aim).addScaledVector(new T.Vector3(...turnY(k.direction, room.turn)), SUN.distance); sun.target.updateMatrixWorld();
    } else { scene.environment = roomOf(state.light); scene.environmentIntensity = STAGE.room; sun.intensity = 0; }
    dirty = true;
  }
  const moving = () => state.motion !== 'still' || lift > 1e-4 || glow > 1e-3 || Math.abs(swept) > 1e-3;
  function frame(now: number) {
    requestAnimationFrame(frame);
    const pose = motionPose(state.motion, (now - motionStart) / 1000), ease = 1 - Math.exp(-Math.min(0.1, (now - last) / 1000) * 7); last = now;
    // Lift, glow and the light's place ease toward the movement's own, so that leaving a movement half way sets the model
    // down and dims the light instead of cutting them off.
    lift += (pose.lift - lift) * ease; glow += (pose.glow - glow) * ease; swept = state.motion === 'sweep' ? pose.sweep : swept * (1 - ease);
    holder.rotation.y = yawBase + pose.yaw; holder.position.y = lift;
    sweepLight.intensity = STAGE.sweep * glow; sweepLight.position.set(swept * 4.2, 3.4, 3); key.intensity = roomLit() ? 0 : STAGE.key * (1 - 0.45 * glow);
    scene.environmentRotation.y = (roomLit() ? roomNow().turn : 0) + swept * 0.7; // a staged room's light is turned as its picture is; the lamps slide across the polish with the travelling light
    if (repaint) { repaint = false; applyLook(); }
    if (staged) rig!.update(); // the film is drawn through the film camera, which stands where the model does
    if (controls.update() || moving() || dirty || staged) { dirty = false; renderer.render(scene, camera); }
  }

  // ── the panel ──
  const decimal = (v: number) => v.toLocaleString('sv-SE'), percent = (v: number) => `${Math.round(v * 100)} %`;
  const groups: {box: HTMLElement; value: () => string}[] = [];
  function segment<V extends string>(id: string, items: {id: V; label: string}[], value: () => string, choose: (id: V) => void) {
    const box = $(id);
    box.replaceChildren(...items.map(item => { const button = el('button', {type: 'button', textContent: item.label, onclick: () => { choose(item.id); sync(); }}); button.dataset.value = item.id; return button; }));
    groups.push({box, value});
  }
  function slider(id: string, value: () => number, set: (v: number) => void, text: (v: number) => string) {
    const input = $<HTMLInputElement>(id), out = $(`${id}-out`);
    input.addEventListener('input', () => { set(Number(input.value) / 100); out.textContent = text(value()); });
    return () => { input.value = String(Math.round(value() * 100)); out.textContent = text(value()); };
  }
  segment('models', props.map(p => ({id: p.id, label: modelName(p.id)})), () => state.model, id => void choose(id));
  segment('stages', STAGES, () => state.stage, id => void setStage(id));
  segment('looks', LOOKS, () => state.look, id => { state.look = id; applyLook(); });
  segment('motions', MOTIONS, () => state.motion, setMotion);
  segment('lights', LIGHTS, () => state.light, id => { state.light = id; setLight(); });
  segment('rooms', ROOMS, () => state.room, id => void setRoom(id));
  segment('stage-lights', STAGE_LIGHTS, () => state.stageLight, id => { state.stageLight = id; setLight(); });
  segment('floors', FLOORS, () => state.floor, id => { state.floor = id; showStage(false); });
  segment('hands', HANDS, () => state.hands, id => { state.hands = id; rig?.seat(id); dirty = true; });
  const sliders = [
    slider('gold', () => state.gold, v => { state.gold = v; repaint = true; }, percent), // painted once per frame at most, however fast the slider is dragged
    slider('gloss', () => state.gloss, v => { state.gloss = v; repaint = true; }, percent),
    slider('exposure', () => state.exposure, v => { state.exposure = v; setLight(); }, v => v.toFixed(2).replace('.', ',')),
  ];
  function sync() {
    for (const group of groups) for (const button of group.box.children) button.setAttribute('aria-pressed', String((button as HTMLElement).dataset.value === group.value()));
    for (const update of sliders) update();
    const look = LOOKS.find(l => l.id === state.look)!, plain = look.accents && !!model?.parts.some(p => p.plain);
    $('gold-row').classList.toggle('off', !look.accents); $<HTMLInputElement>('gold').disabled = !look.accents;
    $('gloss-row').classList.toggle('off', state.look === 'original'); $<HTMLInputElement>('gloss').disabled = state.look === 'original';
    // "Fotomaterial" tells felt, wood and leather apart by the table's colours; on the other models it would make leather of black plastic.
    const table = !!model && !!fitOf(model.id), photoNote = photoProblem ? 'De fotograferade materialen kunde inte läsas (assets/scene/materials/).' : state.look === 'photo' && !table ? 'Fotomaterial är gjort för bordet; välj bordet.' : '';
    for (const button of $('looks').children) (button as HTMLButtonElement).disabled = (button as HTMLElement).dataset.value === 'photo' && !table;
    $('look-note').textContent = plain ? 'Modellen har ingen egen färgbild att välja guldet ur, så hela föremålet får grundmaterialet.' : photoNote || look.note; $('look-note').classList.toggle('warn', plain || !!photoNote);
    $('motion-note').textContent = MOTIONS.find(m => m.id === state.motion)!.note;
    $('stage-note').textContent = stageProblem || STAGES.find(s => s.id === state.stage)!.note; $('stage-note').classList.toggle('warn', !!stageProblem);
    // The stage's own choices show while the stage does; the studio's light presets are out of play while the room lights the table.
    $('stage-more').classList.toggle('off', state.stage !== 'scene'); $('back-view').hidden = state.stage !== 'scene';
    $('stage-more-note').textContent = [STAGE_LIGHTS.find(s => s.id === state.stageLight)!.note, FLOORS.find(f => f.id === state.floor)!.note, HANDS.find(h => h.id === state.hands)!.note].join(' ');
    $('lights').classList.toggle('off', roomLit()); for (const button of $('lights').children) (button as HTMLButtonElement).disabled = roomLit();
    $('model-note').textContent = model ? `${decimal(model.triangles)} trianglar · ${sizeText(model.size.x, model.size.y, model.size.z)}${model.textureSize ? ` · bilder ${model.textureSize} px` : ''}` : '';
    const chip = (text: string, tone = '') => el('span', {className: `chip ${tone}`, textContent: text});
    hudBox.replaceChildren(chip('Labb · ändrar inget i spelet', 'lab'), ...(loading ? [chip(`Läser ${modelName(loading)}…`)] : model ? [chip(modelName(model.id)), chip(look.label)] : []), ...(problem ? [chip('Modellen saknas', 'warn')] : []));
    failBox.textContent = problem;
  }

  /** Shows a model. One that cannot be read leaves the floor empty and says so; the others can still be chosen. */
  async function choose(id: string) {
    state.model = id; loading = id; problem = ''; sync();
    if (!models.has(id)) models.set(id, load(id));
    const next = await models.get(id)!.catch(() => { models.delete(id); return null; });
    if (state.model !== id) return; // another model was chosen while this one was read
    loading = ''; holder.clear(); model = next;
    if (next) { holder.add(next.fit); applyLook(); if (state.stage === 'scene' && !fitOf(id)) state.stage = 'alone'; showStage(); }
    else problem = `Modellen ”${modelName(id)}” kunde inte läsas (${fileOf(id)}). Filen är lokal media och finns inte i Git: den görs av originalet i assets/props/source/ med tools/prop-glb.ts.`;
    dirty = true; sync();
  }

  new ResizeObserver(resize).observe(stage); resize();
  canvas.addEventListener('dblclick', () => home());
  $('home').addEventListener('click', () => home());
  $('back-view').addEventListener('click', () => home({back: true}));
  setLight(); sync(); requestAnimationFrame(frame);
  const ready = choose(props.some(p => p.id === query.get('model')) ? query.get('model')! : props[0].id);

  // For the proof recorder and the console; not an interface. set() resolves when the picture shows what was asked for.
  const settled = async () => { for (let i = 0; i < 200 && (state.motion === 'still' && moving() || repaint || dirty); i++) await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); };
  Object.assign(window, {propsLab: {
    ready: ready.then(settled),
    async set(patch: Partial<typeof state> & {view?: {azimuth?: number; elevation?: number; zoom?: number; back?: boolean}}) {
      if (patch.model !== undefined && patch.model !== state.model) await choose(patch.model);
      if (patch.room !== undefined && patch.room !== state.room) await setRoom(patch.room);
      if (patch.stage !== undefined && patch.stage !== state.stage) await setStage(patch.stage);
      if (patch.motion !== undefined && patch.motion !== state.motion) setMotion(patch.motion);
      if (patch.hands !== undefined) { state.hands = patch.hands; rig?.seat(patch.hands); }
      if (patch.floor !== undefined && patch.floor !== state.floor) { state.floor = patch.floor; showStage(false); }
      for (const name of ['look', 'gold', 'gloss', 'light', 'exposure', 'stageLight'] as const) if (patch[name] !== undefined) (state as Record<string, unknown>)[name] = patch[name];
      if (patch.look === 'photo' && !photoMaps) { applyLook(); for (let i = 0; i < 300 && !photoMaps && !photoProblem; i++) await new Promise(requestAnimationFrame); }
      setLight(); applyLook(); if (patch.view) home(patch.view); sync(); await settled();
      return {...state};
    },
    stage: {scene, camera, renderer, controls, key, sun, holder, rig: () => rig, lit: () => lit},
    state: () => ({...state, problem, loaded: model ? {id: model.id, triangles: model.triangles, turned: model.turned, size: model.size.toArray(), textureSize: model.textureSize} : null}),
  }});
}
// Under Node (the tests) only the look logic above is used; the page starts where there is a document.
if (typeof document !== 'undefined') start().catch(error => { const box = document.getElementById('fail'); if (box && !box.textContent) box.textContent = 'Modell-labbet kunde inte starta. Ladda om sidan; om det inte hjälper, säg till.'; console.error(error); });
