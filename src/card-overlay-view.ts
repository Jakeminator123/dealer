// Draws the rendered card over a film frame in the browser. The card is the Material panel's own
// card: its geometry, print, paper and lights come unchanged from the card material study, so what
// is tuned there (fronts and backs, gloss, bend) is what lies on the table here. Where the card is
// and how large comes from src/card-overlay.ts.
import * as THREE from '../materials/source/references/card-materials/vendor/three.module.js';
import {CARD, RANKS, SUITS, createCardGeometry, createCardPrint, paperMaterialParameters, applyCardLights, validateCard, type CardValue} from '../materials/source/src/card-material-study.ts';
import {poseAt, restOf, restingQuad, returnCardAt, cardToImage, projectionOf, regionOf, readMatte, filmZone, strayBoxes, plausible, plausibleEdge, cardRecord, cardFace, CARD_RANKS, CARD_SUITS, BESIDE, RIM, type CardRecord, type CardTrack, type Scene, type Pose} from './card-overlay.ts';
import {signedArea, inside, clockwise, grown, is, type Pt} from './card-track.ts';
import {SHOE_BOX} from './scene3d-matte.ts';

export {RANKS, SUITS};
// The study lights its card for a dark room. Over the film the paper must read as white beside the film's own whites, so the same
// lights are given more exposure; the filmic curve keeps the print from burning out.
// Measured in the lab on the lying P4 card: exposure 1 gives paper 191 of 255 (grey beside the film), 3 gives 234, where the
// film's own whites (her blouse) are about 228; ink stays below 20 and the red print keeps its colour.
const PAPER_EXPOSURE = 3;
// shift: the film deals another card than its own (one film per seat): the rendered card is drawn that far from the film's card.
// land: the plan's quad for the card, in film pixels: the rendered card ends there, whatever the film's own landing; it replaces shift.
// placed: cards dealt by earlier films of the round, which this film does not show; they lie where they landed.
type PlacedCard = {quad: Pt[]; back: boolean; target?: string | null; shoeDraw?: number | null; gloss?: number};
type FilmRegion = (x: number, y: number) => boolean;
export type OverlayOptions = {scale: number; split: boolean; card: CardValue; side: 'TRACK' | 'BACK' | 'FRONT'; bend: number; gloss: number; inFront: boolean;
  shift?: Pt | null; land?: Pt[] | null; returning?: boolean; placed?: PlacedCard[]; carry?: 'object' | 'film' | 'matte';
  // A value per card (optional): the records of the dealt cards, and which of them the card of this film is, by draw number or by
  // target. Each resting card names its own in `placed`. A card without a record keeps the artwork in `card`.
  cards?: CardRecord[] | null; target?: string | null; shoeDraw?: number | null};

/** Cards from the table layout use the same resting projection as the dealt card. */
export function placedCardsForView(placed: readonly PlacedCard[], returning: PlacedCard | null, scene: Scene | null, scale: number): PlacedCard[] {
  const cards = returning ? [...placed, returning] : placed;
  return cards.map(card => ({...card, quad: restingQuad(scene, card.quad, scale).quad}));
}

/** In film carry, the moving card stays in the original pixels until the tracked landing. */
export function frameCardsForView(track: CardTrack | null, frame: number, scene: Scene | null, options: Pick<OverlayOptions, 'carry' | 'scale' | 'shift' | 'land' | 'returning' | 'placed' | 'target' | 'shoeDraw' | 'gloss'>) {
  const returning = returnCardAt(track, frame, options), marker = returning?.marker;
  const filmCarry = options.carry === 'film' && !options.returning && (!!track || options.land?.length === 4);
  const rest = filmCarry && track && restOf(track);
  // A deal with a measured landing uses that frame. Bad quads near its centre must not move the handoff earlier.
  const keepFilmCard = filmCarry && Math.round(frame) < (rest ? track?.restFrom ?? rest.from : Infinity);
  // During a return only the marker is tracked. The game card is laid just as it will be in the next beat.
  const pose: Pose | null = returning
    ? marker ? {frame: marker.frame, side: marker.side, quad: null, edge: null, film: grown(marker.quad, RIM), resting: 1, turned: false} : null
    : track && !keepFilmCard ? poseAt(track, scene, frame, options.scale, 12, options.shift ?? null, options.land ?? null) : null;
  const placed = placedCardsForView(options.placed ?? [], returning?.card ?? null, scene, options.scale);
  return {pose, placed, returning: !!returning, keepFilmCard};
}

export function filmCarryProtection(track: CardTrack | null, frame: number): {canClean: boolean; shoe: number[]; keep: FilmRegion} {
  const at = Math.round(frame), sample = track?.frames[at], shoe = track?.shoeWindow?.box ?? SHOE_BOX;
  const unknown = {canClean: false, shoe, keep: () => true};
  // Without current source geometry, old markers can remain visible. Keep ambiguous pixels so they cannot erase the moving card.
  if (!sample || sample.frame !== at) return unknown;
  const points = (q: number[][] | null) => q?.map(([x, y]) => ({x, y})) ?? null;
  const card = sample.side === 'BACK' || sample.side === 'FRONT' ? points(sample.film ?? sample.quad) : null;
  const line = sample.side === 'EDGE' ? points(sample.edge) : null;
  const film = card && plausible(card) ? grown(clockwise(card), RIM) : null;
  const edge = line && plausibleEdge(line) && (line[0].x !== line[1].x || line[0].y !== line[1].y) ? [line[0], line[1]] as [Pt, Pt] : null;
  if (!film && !edge) return unknown;
  const active = filmZone({frame: at, side: sample.side, quad: null, film, edge, resting: 0, turned: false});
  const [x0, y0, x1, y1] = shoe;
  return {canClean: true, shoe, keep: (x, y) => active(x, y) || (x >= x0 - 8 && x <= x1 + 8 && y >= y0 - 8 && y <= y1 + 8)};
}

/** Split the marker pixels between the parts to keep over the table cards and those to erase. */
export function protectFilmPixels(matte: ReturnType<typeof readMatte>, x: number, y: number, keep: FilmRegion) {
  for (let py = 0; py < matte.height; py++) for (let px = 0; px < matte.width; px++) {
    const i = py * matte.width + px;
    if (matte.card[i] && keep(x + px + 0.5, y + py + 0.5)) { matte.hand[i] = 1; matte.card[i] = 0; }
  }
}

if (RANKS.join() !== CARD_RANKS.join() || SUITS.join() !== CARD_SUITS.join()) console.warn('Card values in src/card-overlay.ts differ from the card material study.');

// One WebGL scene for every overlay on the page: the study's card, lit as in the study, seen straight on.
// A homography then places that view on the card's quad in the film, so its perspective is the table's.
type Studio = {canvas: HTMLCanvasElement; renderer: any; scene: any; camera: any; mesh: any; front: any; back: any; hidden: any; flat: any; bent: any; bend: number; gloss: number; face: string};
let studio: Studio | null = null;
const faces = new Map<string, any>(); // one print per card value, kept: at most 52
const texture = (value?: CardValue) => { const t = new THREE.CanvasTexture(createCardPrint(value)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
function open(options: OverlayOptions): Studio {
  if (!studio) {
    const canvas = document.createElement('canvas'), renderer: any = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, premultipliedAlpha: true});
    renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; renderer.setClearColor(0x000000, 0);
    const scene: any = new THREE.Scene(), hemisphere: any = new THREE.HemisphereLight('#f1f2f3', '#2e3231', 1.05), key: any = new THREE.DirectionalLight('#ffffff', 2.05), fill: any = new THREE.DirectionalLight('#e7edf1', 0.55);
    key.position.set(-3.5, 7, 5); fill.position.set(4, 3, -3); applyCardLights('neutral', key, fill, hemisphere); scene.add(hemisphere, key, fill);
    const paper = paperMaterialParameters(options.gloss), card = validateCard(options.card);
    faces.set(`${card.rank}/${card.suit}`, texture(card));
    const front: any = new THREE.MeshPhysicalMaterial({...paper, map: faces.get(`${card.rank}/${card.suit}`), depthTest: false}), back: any = new THREE.MeshPhysicalMaterial({...paper, map: texture(), depthTest: false});
    const hidden: any = new THREE.MeshBasicMaterial({visible: false}), flat = createCardGeometry(0), bent = createCardGeometry(options.bend);
    // Only the surface towards the eye is drawn; which print it carries is chosen per frame.
    const mesh: any = new THREE.Mesh(flat, [front, hidden, hidden]); mesh.position.set(0, 0, -8); mesh.frustumCulled = false; scene.add(mesh);
    studio = {canvas, renderer, scene, camera: new THREE.PerspectiveCamera(35, 1, 0.1, 40), mesh, front, back, hidden, flat, bent, bend: options.bend, gloss: options.gloss, face: `${card.rank}/${card.suit}`};
  }
  const s = studio, face = `${options.card.rank}/${options.card.suit}`;
  if (s.face !== face) { let print = faces.get(face); if (!print) { print = texture(validateCard(options.card)); faces.set(face, print); } s.front.map = print; s.front.needsUpdate = true; s.face = face; }
  if (s.gloss !== options.gloss) { const {color, ...parameters} = paperMaterialParameters(options.gloss); for (const material of [s.front, s.back]) { Object.assign(material, parameters); material.color.set(color); } s.gloss = options.gloss; }
  if (s.bend !== options.bend) { s.bent.dispose(); s.bent = createCardGeometry(options.bend); s.bend = options.bend; }
  return s;
}
function render(quad: {x: number; y: number}[], back: boolean, resting: number, options: OverlayOptions, width: number, height: number): HTMLCanvasElement | null {
  const s = open(options);
  if (s.canvas.width !== width || s.canvas.height !== height) s.renderer.setSize(width, height, false);
  s.renderer.toneMappingExposure = PAPER_EXPOSURE;
  // The film may show a card mirrored for a frame; it is still drawn facing the eye.
  const corners = signedArea(quad) < 0 ? [quad[1], quad[0], quad[3], quad[2]] : quad;
  let h: number[]; try { h = cardToImage(corners, CARD.width, CARD.height); } catch { return null; }
  const m = projectionOf(h, width, height);
  s.camera.projectionMatrix.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15]);
  s.camera.projectionMatrixInverse.copy(s.camera.projectionMatrix).invert();
  s.mesh.geometry = resting >= 0.5 ? s.flat : s.bent; // in the hand the card keeps its bend; on the table it lies flat
  s.mesh.material = [back ? s.back : s.front, s.hidden, s.hidden];
  s.renderer.render(s.scene, s.camera);
  return s.canvas;
}

export function createCardOverlay(canvas: HTMLCanvasElement) {
  const out = canvas.getContext('2d')!, layer = document.createElement('canvas'), read = document.createElement('canvas'), mask = document.createElement('canvas'), field = document.createElement('canvas');
  const lctx = layer.getContext('2d')!, rctx = read.getContext('2d', {willReadFrequently: true})!, mctx = mask.getContext('2d')!, fctx = field.getContext('2d')!;
  // A 0/1 mask becomes a patch with a slightly soft edge, so neither a finger nor a filled rim ends in steps.
  const stamp = (bits: Uint8Array, width: number, height: number, operation: GlobalCompositeOperation) => {
    const image = mctx.createImageData(width, height);
    for (let i = 0; i < bits.length; i++) if (bits[i]) image.data[i * 4 + 3] = 255;
    mask.width = width; mask.height = height; mctx.putImageData(image, 0, 0);
    lctx.globalCompositeOperation = operation; lctx.filter = 'blur(0.7px)'; lctx.drawImage(mask, 0, 0); lctx.filter = 'none'; lctx.globalCompositeOperation = 'source-over';
  };
  // A card dealt by an earlier film: rendered once and kept, then only laid over the frame. Where the film shows anything but
  // table there (a hand or sleeve passing, or the film's own card), the hand matte of that spot keeps the film's hand in front.
  const lying = new Map<string, {image: HTMLCanvasElement; x: number; y: number}>(), peek = document.createElement('canvas'), pctx = peek.getContext('2d', {willReadFrequently: true})!;
  function lay(video: HTMLVideoElement, card: PlacedCard, options: OverlayOptions, width: number, height: number, own: Pt[] | null, keep?: FilmRegion) {
    const face = cardFace(cardRecord(options.cards, card), card.back, options.card, Array.isArray(options.cards)), gloss = card.gloss ?? options.gloss;
    const key = JSON.stringify([card.quad.map(p => [Math.round(p.x * 4), Math.round(p.y * 4)]), face.back, face.art, gloss]);
    let hit = lying.get(key);
    if (!hit) {
      const xs = card.quad.map(p => p.x), ys = card.quad.map(p => p.y), x = Math.max(0, Math.floor(Math.min(...xs)) - 3), y = Math.max(0, Math.floor(Math.min(...ys)) - 3);
      const w = Math.min(width, Math.ceil(Math.max(...xs)) + 3) - x, h = Math.min(height, Math.ceil(Math.max(...ys)) + 3) - y, drawn = w > 1 && h > 1 ? render(card.quad, face.back, 1, {...options, card: face.art, gloss}, width, height) : null;
      if (!drawn) return;
      const image = document.createElement('canvas'); image.width = w; image.height = h; image.getContext('2d')!.drawImage(drawn, x, y, w, h, 0, 0, w, h);
      if (lying.size > 60) lying.clear();
      hit = {image, x, y}; lying.set(key, hit);
    }
    const {image, x, y} = hit, w = image.width, h = image.height, sw = Math.ceil(w / 4), sh = Math.ceil(h / 4);
    peek.width = sw; peek.height = sh; pctx.drawImage(video, x, y, w, h, 0, 0, sw, sh);
    const look = pctx.getImageData(0, 0, sw, sh).data; let bare = true;
    for (let i = 0; i < look.length && bare; i += 4) bare = is.table(look[i], look[i + 1], look[i + 2]);
    if (bare) { out.drawImage(image, x, y); return; }
    read.width = w; read.height = h; rctx.drawImage(video, x, y, w, h, 0, 0, w, h);
    const matte = readMatte(rctx.getImageData(0, 0, w, h).data, w, h, own ? (px, py) => inside(own, x + px + 0.5, y + py + 0.5) : undefined);
    // In film carry, the source hand and card can pass over a card already on the table.
    if (keep) protectFilmPixels(matte, x, y, keep);
    layer.width = w; layer.height = h; lctx.drawImage(image, 0, 0); stamp(matte.hand, w, h, 'destination-out'); out.drawImage(layer, x, y);
  }
  // Every other card the film shows (one lying since an earlier deal, or the film's card where the track lost it) is painted with
  // the background around it; the film's hand stays in front. Found on a half-size copy of the frame, painted at full size.
  const half = document.createElement('canvas'), hctx = half.getContext('2d', {willReadFrequently: true})!;
  function wipe(video: HTMLVideoElement, width: number, height: number, shoe: number[][], keep?: FilmRegion) {
    const hw = width >> 1, hh = height >> 1; half.width = hw; half.height = hh; hctx.drawImage(video, 0, 0, hw, hh);
    for (const b of strayBoxes(hctx.getImageData(0, 0, hw, hh).data, hw, hh, shoe.map(box => box.map(v => v)), 2)) {
      read.width = b.width; read.height = b.height; rctx.drawImage(video, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
      const matte = readMatte(rctx.getImageData(0, 0, b.width, b.height).data, b.width, b.height);
      if (keep) protectFilmPixels(matte, b.x, b.y, keep);
      const f = matte.field, cells = fctx.createImageData(f.width, f.height);
      for (let k = 0; k < f.width * f.height; k++) { cells.data[k * 4] = f.rgb[k * 3]; cells.data[k * 4 + 1] = f.rgb[k * 3 + 1]; cells.data[k * 4 + 2] = f.rgb[k * 3 + 2]; cells.data[k * 4 + 3] = 255; }
      field.width = f.width; field.height = f.height; fctx.putImageData(cells, 0, 0);
      layer.width = b.width; layer.height = b.height; stamp(matte.card, b.width, b.height, 'source-over');
      lctx.globalCompositeOperation = 'source-in'; lctx.imageSmoothingEnabled = true; lctx.drawImage(field, 0, 0, f.width, f.height, 0, 0, f.width * f.cell, f.height * f.cell); lctx.globalCompositeOperation = 'source-over';
      stamp(matte.hand, b.width, b.height, 'destination-out'); out.drawImage(layer, b.x, b.y);
    }
  }
  /** Draws one frame. Returns what was placed, or null when there is nothing to draw for it. */
  function draw(video: HTMLVideoElement, frame: number, track: CardTrack | null, scene: Scene | null, options: OverlayOptions): Pose | null {
    const width = video.videoWidth, height = video.videoHeight;
    if (!width || !height) return null;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    out.clearRect(0, 0, width, height);
    if (options.split) out.drawImage(video, 0, 0, width, height); // beside the raw film the layer needs its own copy of the frame
    const {pose, placed, returning, keepFilmCard} = frameCardsForView(track, frame, scene, options);
    const box = pose ? regionOf(pose, width, height) : null;
    canvas.dataset.frame = String(pose?.frame ?? Math.round(frame)); // which film frame the layer was drawn for
    canvas.dataset.cards = String(placed.length + (pose?.quad || pose?.edge ? 1 : 0)); // how many rendered cards it carries
    // Wipe strays found in this video frame before applying the finer tracked mask. Returns need the shoe window marked before
    // a frame-wide wipe, so the card in the shoe stays visible even when there is no usable marker track on the felt.
    const shoe = track?.shoeWindow?.box;
    const protection = keepFilmCard ? filmCarryProtection(track, frame) : null;
    if (protection?.canClean) wipe(video, width, height, [protection.shoe], protection.keep);
    else if (!protection && track && (!returning || shoe)) wipe(video, width, height, shoe ? [shoe] : []);
    if (!pose || !box) { for (const card of placed) lay(video, card, options, width, height, null, protection?.keep); return pose; }
    // What the film shows here: hand and sleeve stay in front, the film's own card must go.
    const bw = box.width, bh = box.height;
    read.width = bw; read.height = bh; rctx.drawImage(video, box.x, box.y, bw, bh, 0, 0, bw, bh);
    const own = pose.film ? clockwise(pose.film) : null;
    const matte = readMatte(rctx.getImageData(0, 0, bw, bh).data, bw, bh, own ? (x, y) => inside(own, box.x + x + 0.5, box.y + y + 0.5) : undefined), near = filmZone(pose);
    // Only the dealt card's own place is cleaned: not the next card seated in the shoe, not a yellowish finger edge elsewhere.
    // Along the border of the film's card a skin-coloured line narrower than a finger is the card's pale rim: it goes with the card.
    const core = own ? grown(own, -9) : null, wide = pose.quad ? grown(clockwise(pose.quad), BESIDE) : null; // just beside the rendered card nothing of the film's card may be left either
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const i = y * bw + x, px = box.x + x + 0.5, py = box.y + y + 0.5, close = (matte.card[i] || matte.hand[i]) && (near(px, py) || (!!wide && matte.card[i] === 1 && inside(wide, px, py)));
      if (matte.card[i] && !close) matte.card[i] = 0;
      if (matte.hand[i] && !matte.firm[i] && close && !(core && inside(core, px, py))) { matte.hand[i] = 0; matte.card[i] = 1; } }
    layer.width = bw; layer.height = bh;
    // Film card colour that would peek out takes the colour of what lies behind it there.
    const f = matte.field, cells = fctx.createImageData(f.width, f.height);
    for (let k = 0; k < f.width * f.height; k++) { cells.data[k * 4] = f.rgb[k * 3]; cells.data[k * 4 + 1] = f.rgb[k * 3 + 1]; cells.data[k * 4 + 2] = f.rgb[k * 3 + 2]; cells.data[k * 4 + 3] = 255; }
    field.width = f.width; field.height = f.height; fctx.putImageData(cells, 0, 0);
    stamp(matte.card, bw, bh, 'source-over');
    lctx.globalCompositeOperation = 'source-in'; lctx.imageSmoothingEnabled = true; lctx.drawImage(field, 0, 0, f.width, f.height, 0, 0, f.width * f.cell, f.height * f.cell); lctx.globalCompositeOperation = 'source-over';
    // Order matters: first the film's own card is taken away, then the earlier cards are laid (one of them may lie exactly there),
    // then this film's card is drawn where it belongs. The film's hand stays in front of every one of them.
    stamp(matte.hand, bw, bh, 'destination-out'); out.drawImage(layer, box.x, box.y);
    for (const card of placed) lay(video, card, options, width, height, own);
    if (returning) return pose;
    layer.width = bw; layer.height = bh;
    if (pose.quad) {
      const side = options.side === 'TRACK' ? pose.side : options.side, face = cardFace(cardRecord(options.cards, options), side === 'BACK', options.card, Array.isArray(options.cards)), card = render(pose.quad, face.back, pose.resting, {...options, card: face.art}, width, height);
      if (card) lctx.drawImage(card, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    } else if (pose.edge) { // edge-on: the paper edge, a thin light line with a soft dark side
      const [a, b] = pose.edge; lctx.lineCap = 'round';
      for (const [colour, wide, dy] of [['rgba(30,30,30,.45)', 4.5, 1.2], ['#dedede', 2.6, 0]] as const) { lctx.strokeStyle = colour; lctx.lineWidth = wide; lctx.beginPath(); lctx.moveTo(a.x - box.x, a.y - box.y + dy); lctx.lineTo(b.x - box.x, b.y - box.y + dy); lctx.stroke(); }
    }
    if (!options.inFront) stamp(matte.hand, bw, bh, 'destination-out'); // the film's hand shows through
    out.drawImage(layer, box.x, box.y);
    return pose;
  }
  return {draw, clear() { out.clearRect(0, 0, canvas.width, canvas.height); }};
}
