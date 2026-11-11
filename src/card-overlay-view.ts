// Draws the rendered card over a film frame in the browser. The card is the Material panel's own
// card: its geometry, print, paper and lights come unchanged from the card material study, so what
// is tuned there (fronts and backs, gloss, bend) is what lies on the table here. Where the card is
// and how large comes from src/card-overlay.ts.
import * as THREE from '../materials/source/references/card-materials/vendor/three.module.js';
import {CARD, RANKS, SUITS, createCardGeometry, createCardPrint, paperMaterialParameters, applyCardLights, validateCard, type CardValue} from '../materials/source/src/card-material-study.ts';
import {poseAt, cardToImage, projectionOf, regionOf, readMatte, filmZone, type CardTrack, type Scene, type Pose} from './card-overlay.ts';
import {signedArea, inside, clockwise, grown} from './card-track.ts';

export {RANKS, SUITS};
export type OverlayOptions = {scale: number; split: boolean; card: CardValue; side: 'TRACK' | 'BACK' | 'FRONT'; bend: number; gloss: number; inFront: boolean};

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
  /** Draws one frame. Returns what was placed, or null when there is nothing to draw for it. */
  function draw(video: HTMLVideoElement, frame: number, track: CardTrack | null, scene: Scene | null, options: OverlayOptions): Pose | null {
    const width = video.videoWidth, height = video.videoHeight;
    if (!width || !height) return null;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    out.clearRect(0, 0, width, height);
    if (options.split) out.drawImage(video, 0, 0, width, height); // beside the raw film the layer needs its own copy of the frame
    const pose = track ? poseAt(track, scene, frame, options.scale) : null, box = pose ? regionOf(pose, width, height) : null;
    if (!pose || !box) return pose;
    // What the film shows here: hand and sleeve stay in front, the film's own card must go.
    const bw = box.width, bh = box.height;
    read.width = bw; read.height = bh; rctx.drawImage(video, box.x, box.y, bw, bh, 0, 0, bw, bh);
    const own = pose.film ? clockwise(pose.film) : null;
    const matte = readMatte(rctx.getImageData(0, 0, bw, bh).data, bw, bh, own ? (x, y) => inside(own, box.x + x + 0.5, box.y + y + 0.5) : undefined), near = filmZone(pose);
    // Only the dealt card's own place is cleaned: not the next card seated in the shoe, not a yellowish finger edge elsewhere.
    // Along the border of the film's card a skin-coloured line narrower than a finger is the card's pale rim: it goes with the card.
    const core = own ? grown(own, -9) : null, wide = pose.quad ? grown(clockwise(pose.quad), 12) : null; // just beside the rendered card nothing of the film's card may be left either
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
    if (pose.quad) {
      const side = options.side === 'TRACK' ? pose.side : options.side, card = render(pose.quad, side === 'BACK', pose.resting, options, width, height);
      if (card) lctx.drawImage(card, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    } else if (pose.edge) { // edge-on: the paper edge, a thin light line with a soft dark side
      const [a, b] = pose.edge; lctx.lineCap = 'round';
      for (const [colour, wide, dy] of [['rgba(30,30,30,.45)', 4.5, 1.2], ['#dedede', 2.6, 0]] as const) { lctx.strokeStyle = colour; lctx.lineWidth = wide; lctx.beginPath(); lctx.moveTo(a.x - box.x, a.y - box.y + dy); lctx.lineTo(b.x - box.x, b.y - box.y + dy); lctx.stroke(); }
    }
    if (!options.inFront) stamp(matte.hand, bw, bh, 'destination-out'); // the film's hand shows through
    out.drawImage(layer, box.x, box.y);
    canvas.dataset.frame = String(pose.frame); // which film frame the layer was drawn for
    return pose;
  }
  return {draw, clear() { out.clearRect(0, 0, canvas.width, canvas.height); }};
}
