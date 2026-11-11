// Draws the rendered card over a film frame in the browser. The card is the Material panel's own
// card: its geometry, print, paper and lights come unchanged from the card material study, so what
// is tuned there (fronts and backs, gloss, bend) is what lies on the table here. Where the card is
// and how large comes from src/card-overlay.ts.
import * as THREE from '../materials/source/references/card-materials/vendor/three.module.js';
import {CARD, RANKS, SUITS, createCardGeometry, createCardPrint, paperMaterialParameters, applyCardLights, validateCard, type CardValue} from '../materials/source/src/card-material-study.ts';
import {poseAt, cardToImage, projectionOf, regionOf, readMatte, filmZone, strayBoxes, BESIDE, type CardTrack, type Scene, type Pose} from './card-overlay.ts';
import {signedArea, inside, clockwise, grown, is} from './card-track.ts';

export {RANKS, SUITS};
// The study lights its card for a dark room. Over the film the paper must read as white beside the film's own whites, so the same
// lights are given more exposure; the filmic curve keeps the print from burning out.
// Measured in the lab on the lying P4 card: exposure 1 gives paper 191 of 255 (grey beside the film), 3 gives 234, where the
// film's own whites (her blouse) are about 228; ink stays below 20 and the red print keeps its colour.
const PAPER_EXPOSURE = 3;
// shift: the film deals another card than its own (one film per seat): the rendered card is drawn that far from the film's card.
// land: the plan's quad for the card, in film pixels: the rendered card ends there, whatever the film's own landing; it replaces shift.
// placed: cards dealt by earlier films of the round, which this film does not show; they lie where they landed.
export type OverlayOptions = {scale: number; split: boolean; card: CardValue; side: 'TRACK' | 'BACK' | 'FRONT'; bend: number; gloss: number; inFront: boolean;
  shift?: {x: number; y: number} | null; land?: {x: number; y: number}[] | null; placed?: {quad: {x: number; y: number}[]; back: boolean}[]};

// One WebGL scene for every overlay on the page: the study's card, lit as in the study, seen straight on.
// A homography then places that view on the card's quad in the film, so its perspective is the table's.
type Studio = {canvas: HTMLCanvasElement; renderer: any; scene: any; camera: any; mesh: any; front: any; back: any; hidden: any; flat: any; bent: any; bend: number; gloss: number; face: string};
let studio: Studio | null = null;
const texture = (value?: CardValue) => { const t = new THREE.CanvasTexture(createCardPrint(value)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
function open(options: OverlayOptions): Studio {
  if (!studio) {
    const canvas = document.createElement('canvas'), renderer: any = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, premultipliedAlpha: true});
    renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1; renderer.setClearColor(0x000000, 0);
    const scene: any = new THREE.Scene(), hemisphere: any = new THREE.HemisphereLight('#f1f2f3', '#2e3231', 1.05), key: any = new THREE.DirectionalLight('#ffffff', 2.05), fill: any = new THREE.DirectionalLight('#e7edf1', 0.55);
    key.position.set(-3.5, 7, 5); fill.position.set(4, 3, -3); applyCardLights('neutral', key, fill, hemisphere); scene.add(hemisphere, key, fill);
    const paper = paperMaterialParameters(options.gloss), card = validateCard(options.card);
    const front: any = new THREE.MeshPhysicalMaterial({...paper, map: texture(card), depthTest: false}), back: any = new THREE.MeshPhysicalMaterial({...paper, map: texture(), depthTest: false});
    const hidden: any = new THREE.MeshBasicMaterial({visible: false}), flat = createCardGeometry(0), bent = createCardGeometry(options.bend);
    // Only the surface towards the eye is drawn; which print it carries is chosen per frame.
    const mesh: any = new THREE.Mesh(flat, [front, hidden, hidden]); mesh.position.set(0, 0, -8); mesh.frustumCulled = false; scene.add(mesh);
    studio = {canvas, renderer, scene, camera: new THREE.PerspectiveCamera(35, 1, 0.1, 40), mesh, front, back, hidden, flat, bent, bend: options.bend, gloss: options.gloss, face: `${card.rank}/${card.suit}`};
  }
  const s = studio, face = `${options.card.rank}/${options.card.suit}`;
  if (s.face !== face) { const old = s.front.map; s.front.map = texture(validateCard(options.card)); s.front.needsUpdate = true; old.dispose(); s.face = face; }
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
  function lay(video: HTMLVideoElement, card: {quad: {x: number; y: number}[]; back: boolean}, options: OverlayOptions, width: number, height: number, own: {x: number; y: number}[] | null) {
    const key = JSON.stringify([card.quad.map(p => [Math.round(p.x * 4), Math.round(p.y * 4)]), card.back, options.card, options.gloss]);
    let hit = lying.get(key);
    if (!hit) {
      const xs = card.quad.map(p => p.x), ys = card.quad.map(p => p.y), x = Math.max(0, Math.floor(Math.min(...xs)) - 3), y = Math.max(0, Math.floor(Math.min(...ys)) - 3);
      const w = Math.min(width, Math.ceil(Math.max(...xs)) + 3) - x, h = Math.min(height, Math.ceil(Math.max(...ys)) + 3) - y, drawn = w > 1 && h > 1 ? render(card.quad, card.back, 1, options, width, height) : null;
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
    layer.width = w; layer.height = h; lctx.drawImage(image, 0, 0); stamp(matte.hand, w, h, 'destination-out'); out.drawImage(layer, x, y);
  }
  // Every other card the film shows (one lying since an earlier deal, or the film's card where the track lost it) is painted with
  // the background around it; the film's hand stays in front. Found on a half-size copy of the frame, painted at full size.
  const half = document.createElement('canvas'), hctx = half.getContext('2d', {willReadFrequently: true})!;
  function wipe(video: HTMLVideoElement, width: number, height: number, shoe: number[][]) {
    const hw = width >> 1, hh = height >> 1; half.width = hw; half.height = hh; hctx.drawImage(video, 0, 0, hw, hh);
    for (const b of strayBoxes(hctx.getImageData(0, 0, hw, hh).data, hw, hh, shoe.map(box => box.map(v => v)), 2)) {
      read.width = b.width; read.height = b.height; rctx.drawImage(video, b.x, b.y, b.width, b.height, 0, 0, b.width, b.height);
      const matte = readMatte(rctx.getImageData(0, 0, b.width, b.height).data, b.width, b.height), f = matte.field, cells = fctx.createImageData(f.width, f.height);
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
    const pose = track ? poseAt(track, scene, frame, options.scale, 12, options.shift ?? null, options.land ?? null) : null, box = pose ? regionOf(pose, width, height) : null, placed = options.placed ?? [];
    canvas.dataset.frame = String(pose?.frame ?? Math.round(frame)); // which film frame the layer was drawn for
    canvas.dataset.cards = String(placed.length + (pose?.quad || pose?.edge ? 1 : 0)); // how many rendered cards it carries
    // Before anything is drawn. A card lying right beside the dealt one (the dealer's first card under the second) goes too; the
    // tracked card's own place is then cleaned once more with its finer rule. Without a track the shoe window is unknown, and nothing is wiped.
    if (track) wipe(video, width, height, track.shoeWindow?.box ? [track.shoeWindow.box] : []);
    if (!pose || !box) { for (const card of placed) lay(video, card, options, width, height, null); return pose; }
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
    layer.width = bw; layer.height = bh;
    if (pose.quad) {
      const side = options.side === 'TRACK' ? pose.side : options.side, card = render(pose.quad, side === 'BACK', pose.resting, options, width, height);
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
