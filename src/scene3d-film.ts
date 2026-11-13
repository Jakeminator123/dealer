// The Pamela film inside the 3D scene: keyed in the shader and projected from the film camera onto two
// surfaces, a vertical plane standing on the dealer-side table edge and the table top. Seen from the film
// camera's own position this is the film pixel for pixel, whatever the camera figures are; turning the view
// about that position stays exact, moving it is an approximation.
import * as T from 'three';
import {FILM} from './scene3d-geometry.ts';
import {FAN_GLSL} from './scene3d-light.ts';
import {FILM_CARD_GLSL, MATTE_GLSL} from './scene3d-matte.ts';
import type {FilmEffect} from './clip-graph.ts';
import {MOUTH_GLSL, mouthUniforms, putMouth, type MouthPart, type MouthShown} from './scene3d-mouth.ts';

const VERTEX = `varying vec4 vFilm; varying vec3 vWorld; uniform mat4 filmVP;
void main(){ vec4 w = modelMatrix * vec4(position, 1.); vWorld = w.xyz; vFilm = filmVP * w; gl_Position = projectionMatrix * viewMatrix * w; }`;
// Output is premultiplied and sRGB-encoded, like the video. The screen colour is read from the frame itself
// because it drifts between and inside clips. A screen pixel that is only darker than that reference comes
// out as black with partial alpha, which is how hand and shoe shadows on the green table survive the key.
// ---- rendered cards as objects in the scene (src/scene3d-deal.ts) -----------------------------------------------------
// The card lies under the film, so the film's own card must go: near where the track puts it, the film's card is keyed to
// transparent like the screen, and whatever is darker than the card (finger shadows on it) stays as a shadow on the rendered
// card. Film pixels, y down. `cardBase` is shared with the card's own shader, which takes its brightness from it.
export const CARD_GLSL = `const vec2 FILM_PX = vec2(${FILM.width}., ${FILM.height}.);
float edgeIn(vec2 p, vec2 a, vec2 b){ vec2 e = b - a; return (e.x * (p.y - a.y) - e.y * (p.x - a.x)) / max(length(e), 1e-4); }
// distance inside a quad given clockwise on screen: positive inside, negative outside
float quadIn(vec2 p, vec2 q[4]){ return min(min(edgeIn(p, q[0], q[1]), edgeIn(p, q[1], q[2])), min(edgeIn(p, q[2], q[3]), edgeIn(p, q[3], q[0]))); }
vec3 filmAt(sampler2D map, vec2 p){ return textureLod(map, vec2(p.x / FILM_PX.x, 1. - p.y / FILM_PX.y), 0.).rgb; } // explicit level: read in branches
// The film's card in this frame, lit, as the video shows it: samples in the middle of its tracked core that carry the card's own
// colour (fingers, their shadows and marks on the card left out), and of those the lighter half, so a card half in a hand's
// shadow counts as lit and the shadow stays a shadow on it. Its brightness is the film's light on the card.
vec3 coreAt(sampler2D map, vec2 q[4], int i, int j){ vec2 st = vec2(.2 + .12 * float(i), .2 + .12 * float(j)); return filmAt(map, mix(mix(q[0], q[1], st.x), mix(q[3], q[2], st.x), st.y)); }
vec3 cardBase(sampler2D map, vec2 q[4], vec3 ref){
  vec3 sum = vec3(0.), top = vec3(0.), dir = normalize(ref), w = vec3(.2126, .7152, .0722); float n = 0., m = 0., mean = 0.;
  for (int j = 0; j < 6; j++) for (int i = 0; i < 6; i++) { vec3 s = coreAt(map, q, i, j); if (length(s) > .12 && dot(normalize(s), dir) > .96) { sum += s; n += 1.; mean += dot(s, w); } }
  mean /= max(n, 1.);
  for (int j = 0; j < 6; j++) for (int i = 0; i < 6; i++) { vec3 s = coreAt(map, q, i, j); if (length(s) > .12 && dot(normalize(s), dir) > .96 && dot(s, w) >= mean) { top += s; m += 1.; } }
  return n >= 6. ? (m >= 3. ? top / m : sum / n) : ref;
}`;
// The middle of the dealer-side table edge in the standard film frame (film pixels, y down): the fixed point of a film's own frame.
export const FRAME_FIX = {x: 881.5, y: 831.5};
const CARD_KEY = `const vec2 FRAME_FIX = vec2(${FRAME_FIX.x}, ${FRAME_FIX.y});
uniform float cardOn, cardRim, cardSides, cardTint, cardTrust, cardOverOn, cardHeld, cardStrength, seatOn; uniform vec2 cardZone[4], cardCore[4], cardOver[4], cardDrawn[4], seatZone[4], seatCore[4]; uniform vec3 cardColour; uniform vec4 cardShoe;
${CARD_GLSL}
const float CARD_SHADOW = .4;
const vec3 BACK_LIT = vec3(.91, .82, .02), FACE_LIT = vec3(0., .475, .89); // the film card's yellow back and blue face, lit
// Skin, the hand that must stay in front, from a pale fingertip to a knuckle in warm shadow: warm (red over blue, red at least
// green), blue at least about half of green (skin 0.6 to 0.95; the yellow card has almost none), green not far under red (a red
// mark is no skin).
float skinOf(vec3 c){ return smoothstep(.03, .08, c.r - c.b) * smoothstep(-.02, .03, c.r - c.g) * smoothstep(.4, .55, c.b / max(c.g, .01)) * smoothstep(.38, .48, c.g / max(c.r, .01)); }
// One film card keyed away: zoneQ where it and its blur can be, coreQ its tracked colour, colour that colour lit, rim how far its
// pale rim reaches, sides which colours count as card (0 the back, 1 the face, 2 both), tint whose tint fingers on it lose (0
// the back's, 1 the face's, 2 none), trust how far the core is the card itself (the track's confidence); inside the shoe box
// only the card itself and its rim go (the next card seated there stays). strength: how far all of this is done (1 in full, 0 the
// film as it is), so a card can be keyed away over a few frames while the drawn card lies under it (the hand-over at rest).
vec4 keyCard(vec4 o, vec2 px, vec3 c, vec3 key, vec2 zoneQ[4], vec2 coreQ[4], vec3 colour, float rim, float sides, float tint, float trust, vec4 shoe, vec2 drawnQ[4], float held, float strength){
  float zone = smoothstep(-2., 2., quadIn(px, zoneQ)) * strength; if (zone <= 0.) return o;
  float core = quadIn(px, coreQ), back = step(sides, .5) + step(1.5, sides), face = step(.5, sides);
  if (all(greaterThan(px, shoe.xy)) && all(lessThan(px, shoe.zw))) zone *= smoothstep(-rim - 3., -rim, core);
  // how far the colour lies off the plane of the screen and the card's colour, each in any light: 0 for card, felt and mixes of
  // the two, large for skin, sleeve and blouse
  float l = length(c) + .04, offBack = abs(dot(c, normalize(cross(key, BACK_LIT)))) / l, offFace = abs(dot(c, normalize(cross(key, FACE_LIT)))) / l;
  float bg = 1. - smoothstep(.12, .22, min(back > .5 ? offBack : 9., face > .5 ? offFace : 9.));
  // the card's own colour family however light or dark (its rim, blurred over the felt): bluish for the face; for the back
  // yellowish, green well over blue without skin's red over green, and its cream rim, light with blue well under green and red
  // at most a little over green (skin keeps blue at about 0.8 of green, or, warm in strong light (P1's knuckles), at 0.67 with
  // red 0.2 over green; the tan frame of the shoe window is darker); and a light, neutral smear of the white edge while the card
  // moves fast (the blouse is warmer)
  float cream = (1. - smoothstep(.62, .74, c.b / max(c.g, .01))) * (1. - smoothstep(.12, .18, c.r - c.g)) * smoothstep(.55, .65, c.g);
  float pale = (1. - smoothstep(.04, .08, max(abs(c.r - c.g), abs(c.g - c.b)))) * smoothstep(.6, .7, c.g) * (1. - skinOf(c)); // a pale nail is warm
  bg = max(bg, max(max(back * max(smoothstep(.15, .3, c.g - c.b) * (1. - smoothstep(.06, .14, c.r - c.g)), cream), face * smoothstep(.06, .16, c.b - c.r)), pale));
  // the rim in a narrow band along the core goes with the card. The face's rim is pale blue (blue at least red, which skin never
  // is); the back's is cream (blue under 0.7 of green), or blended with the dark shoe or sleeve into light, nearly neutral
  // pixels that keep a trace of the card's yellow (a pale fingertip is as neutral, but has blue near green)
  float band = smoothstep(-rim - 2., -rim, core) * (1. - smoothstep(1.5, 3., core));
  float rimBack = max((1. - smoothstep(.7, .8, c.b / max(c.g, .01))) * (1. - smoothstep(.16, .24, c.r - c.g)) * smoothstep(.55, .65, c.g), (1. - smoothstep(.08, .12, c.r - c.g)) * smoothstep(.35, .45, c.g) * smoothstep(.06, .1, c.g - c.b));
  bg = max(bg, band * max(back * rimBack, face * smoothstep(-.02, .06, c.b - c.r)));
  // well inside a core the track is sure of, whatever is not skin is the card: marks the film drew on its card, its shading. A
  // dark or purplish skin-like pixel there is a finger's edge only beside bright skin (a red mark's purple rim is not).
  float inside = trust * smoothstep(1., 3., core), skin = skinOf(c), near = 0.;
  if (inside > 0.) { for (int k = 0; k < 8; k++) { float a = float(k) * .785398; vec3 s = filmAt(map, px + 6. * vec2(cos(a), sin(a))); near = max(near, skinOf(s) * smoothstep(.4, .55, dot(s, vec3(.2126, .7152, .0722)))); }
    skin *= max((1. - smoothstep(-.02, .03, c.b - c.g)) * smoothstep(.22, .35, dot(c, vec3(.2126, .7152, .0722))), near); }
  bg = max(bg, inside * (1. - skin));
  // what stays in front (fingers on the card) loses the card's tint along their edges: no blue over green on the face, skin's
  // blue back on the back. Only on and right beside the card: the shoe's tan frame keeps its colour.
  vec4 f = o; if (tint < .5) f.b = max(f.b, .8 * f.g); else if (tint < 1.5) f.b = min(f.b, f.g);
  float onCard = smoothstep(-6., 0., core);
  // brightness against the screen and the card's colour in this frame, as a mix of the two: what is darker is shadow
  vec3 base = cardBase(map, coreQ, colour);
  float kk = dot(key, key), kb = dot(key, base), bb = dot(base, base), kx = dot(key, c), bx = dot(base, c);
  float lit = (bb * kx - kb * bx + kk * bx - kb * kx) / max(kk * bb - kb * kb, 1e-6), dark = (1. - clamp((lit - lo) / (hi - lo), 0., 1.)) * shadow;
  // on the card a shadow is a finger's, so it lies next to (bright) skin; dark without skin near is a mark on the film's card
  dark *= mix(1., near, inside);
  // ... and there it is kept at CARD_SHADOW of its strength: at full strength the shadow under a fingertip was a grey ring round it
  // on the drawn card (seen 2026-11-13: with no shadow kept the ring is gone and the finger looks laid on; this much keeps contact)
  dark *= mix(1., CARD_SHADOW, inside);
  vec4 keyed = mix(mix(o, f, zone * onCard), vec4(0., 0., 0., dark), bg * zone);
  // While the card is held, its pale edge beyond the drawn card (its white edge, thick when seen steeply) is the card's own: it
  // stays as the film draws it, without the film card's tint, instead of opening onto the felt.
  float beyond = quadIn(px, drawnQ), edge = held * (1. - smoothstep(-1., 0., beyond)) * smoothstep(-7., -4., beyond) * max(max(face * smoothstep(.06, .16, c.b - c.r), back * cream), pale) * smoothstep(.45, .6, dot(c, vec3(.2126, .7152, .0722)));
  return mix(keyed, vec4(vec3(dot(o.rgb, vec3(.2126, .7152, .0722))), o.a), edge * zone);
}
// The card seated in the shoe window (its back), then the dealt card; a card drawn in front of the hand keeps no film inside it.
vec4 keyCards(vec4 o, vec2 uv, vec3 c, vec3 key){
  vec2 px = vec2(uv.x, 1. - uv.y) * FILM_PX;
  if (cardOverOn > .5 && quadIn(px, cardOver) > 0.) return o * (1. - cardStrength);
  if (seatOn > .5) o = keyCard(o, px, c, key, seatZone, seatCore, BACK_LIT, 4., 0., 2., 1., vec4(-1.), seatCore, 0., 1.);
  return keyCard(o, px, c, key, cardZone, cardCore, cardColour, cardRim, cardSides, cardTint, cardTrust, cardShoe, cardDrawn, cardHeld, cardStrength);
}`;
// The keyed shadow above the table edge, kept as a share `above` (1 = all of it, as before): rows of the standard frame, y down.
// It fades in over SHADOW_BAND rows up to the edge row, so the shadow on the felt below does not start with a line. Mirrored in
// shadowAboveAt below for the tests.
export const SHADOW_BAND = 8;
const ABOVE_GLSL = `const float SHADOW_BAND = ${SHADOW_BAND}.;
float aboveShare(float row, float above){ return mix(above, 1., smoothstep(FRAME_FIX.y - SHADOW_BAND, FRAME_FIX.y, row)); }`;
/** The share of the keyed shadow kept at a row of the standard frame (y down) when `above` of it is kept above the table edge. */
export function shadowAboveAt(row: number, above: number): number {
  const t = Math.min(1, Math.max(0, (row - (FRAME_FIX.y - SHADOW_BAND)) / SHADOW_BAND)), s = t * t * (3 - 2 * t); return above + (1 - above) * s;
}
// ---- the room's light on the dealer (key dealerRoom) ----------------------------------------------------------------------
// The film is lit in a studio, whatever room is shown. With dealerRoom the film takes the colour and level of the panorama
// that is showing: roomGlow reads the panorama (small, sRGB bytes) as the scene's sphere shows it, turned and mirrored, and
// gives the mean light over the half of the room each of three sides of her faces, weighted by how squarely it falls (her front
// toward the camera, and the frame's left and right; below the felt the table and floor stand between her and the room, so
// that light counts for a third). lightOnDealer makes of it what the film shader multiplies by: a tint and level over all of
// her (the shared grade, so the rendered cards follow), and a soft difference from her left side to her right across the frame.
// Against a neutral reference: a grey room gives no colour and no side difference, and a grey room as bright as REF gives
// exactly 1, 1, 1. Amount 0 is the film as it is. A built room has no panorama and gives nothing (null).
export type RoomGlow = {front: number[]; left: number[]; right: number[]};
// ref: the room's shown light (linear, times its exposure) at which her level stays; gamma and lo/hi: how far the level
// follows the room; colour: how much of the room's colour she takes (a power of each channel over the light's luminance, so a
// strong cast is softened more than a slight one), and reach: at most this far from grey in any channel; sides and sideReach:
// how strong the left-right difference is, and at most how far from 1 a side goes. Tuned by eye 2026-11-13 on Venedig, Skogen
// and Las Vegas with Paow and Pamela: past these a room's cast reads as a filter over her, not as its light on her.
export const DEALER_LIGHT = {ref: 0.14, gamma: 0.5, lo: 0.78, hi: 1.1, colour: 0.5, reach: 0.12, sides: 0.6, sideReach: 0.2};
const LINEAR = Array.from({length: 256}, (_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
/** The room's light on the dealer's front and sides from its panorama, RGBA bytes `width` × `height` (2:1, as the file has it), turned by `turn` radians as the sphere is and read backwards across unless `mirror`, as the sphere shows it. Linear RGB. */
export function roomGlow(rgba: ArrayLike<number>, width: number, height: number, turn: number, mirror: boolean): RoomGlow {
  const sums = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], weights = [0, 0, 0], ca = Math.cos(turn), sa = Math.sin(turn);
  for (let y = 0; y < height; y++) {
    const theta = (y + 0.5) / height * Math.PI, st = Math.sin(theta), up = Math.cos(theta), t = Math.min(1, Math.max(0, (up + 0.45) / 0.4)), w = st * (1 / 3 + 2 / 3 * t * t * (3 - 2 * t));
    for (let x = 0; x < width; x++) {
      // the direction this pixel is seen in (the sphere's own u, three's SphereGeometry), turned with the sphere: -z is behind her
      const phi = (mirror ? (x + 0.5) / width : 1 - (x + 0.5) / width) * 2 * Math.PI, lx = -Math.cos(phi) * st, lz = Math.sin(phi) * st, dx = lx * ca + lz * sa, dz = -lx * sa + lz * ca, i = (y * width + x) * 4;
      const facing = [dz, -dx, dx]; // her front faces the camera (+z); the frame's left is -x
      for (let k = 0; k < 3; k++) if (facing[k] > 0) { const f = w * facing[k]; weights[k] += f; for (let c = 0; c < 3; c++) sums[k][c] += f * LINEAR[rgba[i + c]]; }
    }
  }
  const mean = (k: number) => sums[k].map(v => weights[k] > 0 ? v / weights[k] : 0);
  return {front: mean(0), left: mean(1), right: mean(2)};
}
export type DealerLight = {tint: number[]; left: number[]; right: number[]};
/** What the film is multiplied by for `amount` (0 to 1) of the room's light, the room shown at `exposure`; null glow (no panorama) or amount 0: 1, 1, 1 everywhere. Float32, as the shader gets them. */
export function lightOnDealer(glow: RoomGlow | null, amount: number, exposure = 1): DealerLight {
  const a = Math.min(1, Math.max(0, amount || 0)), L = DEALER_LIGHT, all = glow ? [0, 1, 2].map(c => 0.5 * glow.front[c] + 0.25 * (glow.left[c] + glow.right[c])) : [0, 0, 0];
  const y = 0.2126 * all[0] + 0.7152 * all[1] + 0.0722 * all[2];
  if (!glow || !a || !(y > 0)) return {tint: [1, 1, 1], left: [1, 1, 1], right: [1, 1, 1]};
  const level = Math.min(L.hi, Math.max(L.lo, (y * exposure / L.ref) ** L.gamma)), luma = (v: number[]) => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  // a colour of luminance 1 brought within reach of grey, its deviations scaled together so that its hue stays
  const within = (v: number[], reach: number) => { const dev = Math.max(...v.map(c => Math.abs(c - 1))), k = dev > reach ? reach / dev : 1; return v.map(c => 1 + k * (c - 1)); };
  const powered = all.map(c => (c / y) ** L.colour), colour = within(powered.map(c => c / luma(powered)), L.reach);
  const side = (own: number[], other: number[]) => within(own.map((c, k) => { const mid = (c + other[k]) / 2; return mid > 0 ? 1 + L.sides * (c / mid - 1) : 1; }), L.sideReach).map(c => Math.fround(1 + a * (c - 1)));
  return {tint: colour.map(c => Math.fround(1 + a * (c * level - 1))), left: side(glow.left, glow.right), right: side(glow.right, glow.left)};
}
// Across the standard frame, where her left side turns into her right (frame x, 0 to 1): her body is about 0.32 to 0.68 of it.
const SIDE_GLSL = 'uniform float sideOn; uniform vec3 sideL, sideR;';
// ---- the films' colour evened between the generators (key filmEven) ----------------------------------------------------
// The bank's films come from two generators, and where a film of one follows a film of the other the light on her shifts (her
// face about 4 levels in red and green and 2 in blue: Jakob saw it at 1.08 in the round filmed 2026-11-13). Measured that day
// on the first frame of every film of Paow's that starts on an anchor picture (docs/FILMMODELLER.md has the figures):
// - No film carries colour tags. The screen's green is the anchor's green in every film when the film is read with the BT.601
//   matrix (2 levels off; 36 off with BT.709), so every film is written with BT.601.
// - Chrome reads an untagged film of this size with BT.709. Read so, a Kling 4 film shows her as the anchor picture has her
//   (face 0, 0, −3 levels), and every other film (WAN 3, the talk films made from a WAN 3 rest, Kling 3) shows her warmer and
//   lighter (face +3, +4, −5). Read with BT.601 the other films are the anchor's (−3, −2, −3) and Kling 4 is darker and bluer:
//   on her, though not on the screen, Kling 4 differs from the others by just the change of matrix.
// So what the browser shows of a Kling 4 film is right as it is, and the other films are brought there by reading them with the
// matrix they were written with: BT.709 as read turned into BT.601 (rematrix). The bank's files are not touched. A browser
// that read untagged films with BT.601 would need the opposite (Kling 4 turned the other way); not measured in any other.
const LUMA = {bt601: [0.299, 0.587, 0.114], bt709: [0.2126, 0.7152, 0.0722]} as const;
/** What turns R′G′B′ read with the matrix `read` into what the same film values give read with `other` (row-major 3 × 3; each row sums to 1, so grey stays grey). */
export function rematrix(read: keyof typeof LUMA, other: keyof typeof LUMA): number[] {
  const [r, g, b] = LUMA[read], [R, G, B] = LUMA[other], kr = (1 - R) / (1 - r), kb = (1 - B) / (1 - b);
  // red and blue keep their difference from the luma, scaled; green is what is left of the same luma
  const red = [kr + (1 - kr) * r, (1 - kr) * g, (1 - kr) * b], blue = [(1 - kb) * r, (1 - kb) * g, kb + (1 - kb) * b];
  return [...red, ...[r, g, b].map((c, i) => (c - R * red[i] - B * blue[i]) / G), ...blue];
}
const OTHER_FILMS = /^(wan3|kling-3)\b|MuseTalk/, AS_WRITTEN = rematrix('bt709', 'bt601');
/** What a film's keyed colour is multiplied by to stand in the bank's one colour (row-major 3 × 3), by the generator that made it (a record's source.model); null: as it is (Kling 4, and a model that is not known). */
export const evenFor = (model: string | null | undefined): readonly number[] | null => model && OTHER_FILMS.test(model) ? AS_WRITTEN : null;
// The join between two films. Films of one generator differ too, less: a jacket that is coal grey in one take is blue-black in the
// next, a face two levels darker. Films join where the pose is the same, so the frame before a join and the frame after it show
// the same picture, and whatever differs in her tone there is the films' difference. With filmEven the page reads her tone in
// both (toneOf, on the film made small): the mean colour of her dark parts (jacket, the shade in her hair) and of her light parts
// (skin, blouse, hair). The new film starts in the old one's tone (toneMatch: per channel the gain and the lift that take its two
// tones to the old film's two, so level and contrast both follow) and goes over to its own in EVEN.fade seconds (matchLeft): a
// step becomes a slow drift. box: where her head and upper body are in the standard frame (x0, y0, x1, y1), read as cols × rows
// samples. dark and light: the luma under which a sample is dark and over which it is light (what lies between counts for
// neither). gain and lift: how far a match may go; a larger difference is another picture, not another tone, and is matched
// only that far. least: the samples each tone needs. close and every: when the page reads (the last frames of a film, and every
// so many frames before them).
export const EVEN = {box: [520, 30, 1240, 720], cols: 72, rows: 69, fade: 3, dark: 0.3, light: 0.45, gain: [0.8, 1.25], lift: 0.08, least: 120, close: 8, every: 6};
export type FilmTone = {dark: number[]; light: number[]};
/** Her tone in the film made small (RGBA bytes, EVEN.cols × EVEN.rows of EVEN.box): the mean of her dark and of her light samples per channel, 0 to 1, the screen left out, each sample first through `matrix` (evenFor) when there is one. Null when too little of either is there. */
export function toneOf(rgba: ArrayLike<number>, matrix: readonly number[] | null = null): FilmTone | null {
  const dark = [0, 0, 0], light = [0, 0, 0]; let darks = 0, lights = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    let r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255; if (g - Math.max(r, b) > 0.12) continue; // the screen, and her outline mixed with it
    if (matrix) [r, g, b] = [matrix[0] * r + matrix[1] * g + matrix[2] * b, matrix[3] * r + matrix[4] * g + matrix[5] * b, matrix[6] * r + matrix[7] * g + matrix[8] * b];
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (luma < EVEN.dark) { dark[0] += r; dark[1] += g; dark[2] += b; darks++; } else if (luma > EVEN.light) { light[0] += r; light[1] += g; light[2] += b; lights++; }
  }
  return darks < EVEN.least || lights < EVEN.least ? null : {dark: dark.map(v => v / darks), light: light.map(v => v / lights)};
}
export type ToneMatch = {gain: number[]; lift: number[]};
/** What a film whose first frame has the tone `next` is multiplied by and lifted by to stand in the tone `last` of the frame before it, within EVEN's limits. */
export function toneMatch(last: FilmTone, next: FilmTone): ToneMatch {
  const within = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const gain = [0, 1, 2].map(c => { const span = next.light[c] - next.dark[c]; return span > 0.05 ? within((last.light[c] - last.dark[c]) / span, EVEN.gain[0], EVEN.gain[1]) : 1; });
  // the lift that sets the middle of the two tones right: both exactly when the gain is not held back
  return {gain, lift: gain.map((g, c) => within((last.dark[c] + last.light[c] - g * (next.dark[c] + next.light[c])) / 2, -EVEN.lift, EVEN.lift))};
}
/** A tone as it is shown under a match of which `left` (0 to 1) remains. */
export const toneUnder = (tone: FilmTone, match: ToneMatch | null, left: number): FilmTone => { if (!match || !(left > 0)) return tone; const under = (v: number[]) => v.map((m, c) => m * (1 + left * (match.gain[c] - 1)) + left * match.lift[c]); return {dark: under(tone.dark), light: under(tone.light)}; };
/** How much of a join's match remains `seconds` after the join: all of it at first, none from EVEN.fade on. */
export const matchLeft = (seconds: number): number => 1 - smooth(0, EVEN.fade, seconds);
// ---- life in the upper body (key dealerLife) -----------------------------------------------------------------------------
// A film that rests is nearly still, and a rest film that is looped repeats itself to the frame. With dealerLife her head and
// upper body move a little, slowly and never the same way twice: she sways from side to side about a point at the table's edge
// (as a body does with its hands planted), her head tilts about the neck with the sway and a little by itself, so that it turns
// and does not only slide, and her shoulders rise and fall. Each is one rigid movement of everything above the chest, so nothing
// stretches there; it fades out down her upper arms and is nothing from LIFE.still down and LIFE.side out from her middle, where
// hands, cards, shoe and table are. Rows and columns of the standard frame, y down; angles in degrees and the breath in pixels
// at amount 1. sway: the parts of the sideways movement, each [period in seconds, share, phase]; no period is near the rest
// films' own loop of about 3.9 s, and together they repeat only after minutes. Judged blind twice on 2026-11-13 by an independent
// eye. First four strengths of an earlier tuning: none rubbery, the strongest the best. Then this one at lean 0.5 with the head
// tilting 0.4 with the sway: no artefact, natural 4/5, alive 3/5, "safe but a little too quiet", and at twice that the head read
// as a flat picture being tilted. So amount 1 has 1.4 times that sway, the head tilts no more than the shoulders with it (tilt 0;
// a real head stays level) and only a little by itself, and the fade reaches further down, so that the point of the jacket's V
// follows a little instead of standing as a pivot. A third blind review (2026-11-13, the main agent's reviewer) found no fault
// that gives the treatment away, and one thing to mend: the sway came back in step every two turns of the rest film. The four
// parts of the sway are therefore searched out so that their sum is never much like itself again: over 80 s it is at most 0.48
// like itself after any delay from 2 to 40 s, and at most 0.45 after any whole number of turns of a rest film (3.7 to 4.0 s).
export const LIFE = {fade: 580, still: 790, sideFade: 300, side: 400, pivot: 800, lean: 0.7, sway: [[5.4, 0.32, 0], [9.9, 0.28, 1.3], [14.8, 0.22, 2.1], [21.2, 0.18, 4.0]], neck: 335, headFade: [300, 380], tilt: 0, own: 0.1, ownPeriod: 13.7, breath: 1.6, breathFade: [430, 640], breathPeriod: 6.3};
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The three movements at `seconds` with `amount` of life: the sway and the head's tilt in radians, the breath in pixels. */
export function lifeNow(seconds: number, amount: number): [number, number, number] {
  const L = LIFE, turn = 2 * Math.PI, rad = Math.PI / 180, a = amount > 0 ? amount : 0, sway = L.sway.reduce((sum, [period, share, phase]) => sum + share * Math.sin(turn * seconds / period + phase), 0);
  return [a * L.lean * rad * sway, a * rad * (L.tilt * sway + L.own * Math.sin(turn * seconds / L.ownPeriod + 0.5)), a * L.breath * Math.sin(turn * seconds / L.breathPeriod)];
}
/** How far from a pixel of the standard frame (x, y down) the film is read for the movements of lifeNow: [dx, dy] in pixels. The shader's lifeShift, for the tests. */
export function lifeShiftAt(x: number, y: number, [lean, tilt, breath]: readonly number[]): [number, number] {
  const L = LIFE, body = (1 - smooth(L.fade, L.still, y)) * (1 - smooth(L.sideFade, L.side, Math.abs(x - FRAME_FIX.x))); if (body <= 0) return [0, 0];
  const head = tilt * (1 - smooth(L.headFade[0], L.headFade[1], y)), up = breath * (1 - smooth(L.breathFade[0], L.breathFade[1], y));
  return [(lean * (y - L.pivot) + head * (y - L.neck)) * body, (up - (lean + head) * (x - FRAME_FIX.x)) * body];
}
// lifeMove: the lean, the tilt and the breath of lifeNow; all zero is the film as it is.
const LIFE_GLSL = `uniform vec3 lifeMove;
vec2 lifeShift(vec2 p){
  float body = (1. - smoothstep(${LIFE.fade}., ${LIFE.still}., p.y)) * (1. - smoothstep(${LIFE.sideFade}., ${LIFE.side}., abs(p.x - FRAME_FIX.x))); if (body <= 0.) return vec2(0.);
  float head = lifeMove.y * (1. - smoothstep(${LIFE.headFade[0]}., ${LIFE.headFade[1]}., p.y)), up = lifeMove.z * (1. - smoothstep(${LIFE.breathFade[0]}., ${LIFE.breathFade[1]}., p.y));
  return vec2(lifeMove.x * (p.y - ${LIFE.pivot}.) + head * (p.y - ${LIFE.neck}.), up - (lifeMove.x + head) * (p.x - FRAME_FIX.x)) * body;
}`;
const FRAGMENT = `varying vec4 vFilm; varying vec3 vWorld; uniform sampler2D map; uniform vec2 refUv, texel, frameAnchor, frameSize; uniform float lo, hi, shadow, above, erode, edgeClean, frameOn, frameScale; uniform vec3 grade; uniform vec4 hide;
uniform sampler2D roomMap; uniform vec2 roomSize; uniform float wrap, roomExposure, evenOn; uniform mat3 even; uniform vec3 evenGain, evenLift; ${SIDE_GLSL}
${FAN_GLSL}
${CARD_KEY}
${LIFE_GLSL}
${MATTE_GLSL}
${FILM_CARD_GLSL}
${ABOVE_GLSL}
${MOUTH_GLSL}
float screenAt(vec2 uv, vec3 key, float dk){ vec3 c = texture2D(map, uv).rgb; return clamp(((c.g - max(c.r, c.b)) / dk - lo) / (hi - lo), 0., 1.); }
void main(){
  if (vFilm.w <= 0.) discard;
  vec2 uv = vFilm.xy / vFilm.w * .5 + .5, frameUv = uv; // frameUv: the standard frame, where the table edge row is
  // A film with a frame of its own (the dealer smaller on a larger screen, so that she can stand up and walk out): the point of
  // the standard frame is found in that film. The middle of the dealer-side table edge is the fixed point of the two frames.
  if (frameOn > .5) { vec2 px = (vec2(uv.x, 1. - uv.y) * FILM_PX - FRAME_FIX) * frameScale + frameAnchor; uv = vec2(px.x / frameSize.x, 1. - px.y / frameSize.y); }
  // Life in her upper body (dealerLife): the film is read a little to the side of the pixel, where lifeShift says. Not in a film with a frame of its own (she walks).
  else if (lifeMove != vec3(0.)) { vec2 px = vec2(uv.x, 1. - uv.y) * FILM_PX; px += lifeShift(px); uv = vec2(px.x / FILM_PX.x, 1. - px.y / FILM_PX.y); }
  if (uv.x < .001 || uv.x > .999 || uv.y < .001 || uv.y > .999) discard;
  // A box of the film that the page draws an object of its own for (the shoe): film pixels, y down. Off while x1 < x0.
  if (hide.z > hide.x) { vec2 hp = vec2(uv.x, 1. - uv.y) * FILM_PX; if (hp.x > hide.x && hp.x < hide.z && hp.y > hide.y && hp.y < hide.w) discard; }
  // a spoken line's mouth (src/scene3d-mouth.ts) goes into the film's colour before the key and everything after it reads it
  vec3 c = mouthOver(uv, texture2D(map, uv).rgb), key = texture2D(map, refUv).rgb;
  // the film card's yellow back as the dark back and its blue face as paper in its own pixels ("pålägg", lab trials: scene3d-matte.ts
  // DARK_BACK, PAPER_FACE), before the key, so that the screen's share of a blurred card is keyed as before; the card key and the matte
  // read the film's own colour (raw)
  vec3 raw = c; if ((backOn > .5 || faceOn > .5) && frameOn < .5) c = filmCard(c, vec2(uv.x, 1. - uv.y) * FILM_PX, key);
  float dk = max(key.g - max(key.r, key.b), .05), s = (c.g - max(c.r, c.b)) / dk;
  float screen = clamp((s - lo) / (hi - lo), 0., 1.);
  // pull the matte in by about one source pixel: the outermost pixel of skin and hair carries the screen's green
  float around = max(max(screenAt(uv + vec2(texel.x, 0.), key, dk), screenAt(uv - vec2(texel.x, 0.), key, dk)), max(screenAt(uv + vec2(0., texel.y), key, dk), screenAt(uv - vec2(0., texel.y), key, dk)));
  float a0 = 1. - screen, a = 1. - max(screen, mix(screen, around, erode));
  vec3 pm = max(c - screen * key, 0.);
  pm.g = min(pm.g, mix(max(pm.r, pm.b), .5 * (pm.r + pm.b), smoothstep(0., .1, s)));
  // Her outline's colour (edgeClean, the upright layer only). The pixels nearest the screen are a mix of her and the screen, and what
  // the key leaves of them is off in colour: a pale yellow-green line where too little green went, a pink one where too much did. Within
  // about three film pixels of the screen a pixel therefore takes the colour of the film a few pixels further in, away from the screen
  // (hair for hair, jacket for jacket), and keeps its own brightness.
  if (edgeClean > 0.) {
    vec2 d = texel * 2.; float x1 = screenAt(uv + vec2(d.x, 0.), key, dk), x0 = screenAt(uv - vec2(d.x, 0.), key, dk), y1 = screenAt(uv + vec2(0., d.y), key, dk), y0 = screenAt(uv - vec2(0., d.y), key, dk);
    vec2 slope = vec2(x1 - x0, y1 - y0); float near = max(max(screen, around), max(max(x1, x0), max(y1, y0)));
    if (near > .02 && dot(slope, slope) > 1e-4) {
      vec2 ui = uv - normalize(slope) * texel * 5.; vec3 ci = texture2D(map, ui).rgb; if ((backOn > .5 || faceOn > .5) && frameOn < .5) ci = filmCard(ci, vec2(ui.x, 1. - ui.y) * FILM_PX, key); // a card's edge takes the colour further in: recoloured too
      float si = clamp(((ci.g - max(ci.r, ci.b)) / dk - lo) / (hi - lo), 0., 1.);
      vec3 inner = max(ci - si * key, 0.); inner.g = min(inner.g, max(inner.r, inner.b));
      float own = dot(pm, vec3(.2126, .7152, .0722)), theirs = max(dot(inner, vec3(.2126, .7152, .0722)), .02);
      pm = mix(pm, inner * min(own / theirs, 2.), edgeClean * smoothstep(.02, .2, near) * (1. - si));
    }
  }
  pm *= a / max(a0, .001); // the pulled-in matte thins the pixel, it does not recolour it
  float tone = max(pm.r, max(pm.g, pm.b)) / max(a, .001);
  float isShadow = (1. - smoothstep(.03, .12, tone)) * (1. - smoothstep(.7, .95, a)), kept = shadow;
  // Above the table edge the arms' shadow lies, in the base pictures, on a table that goes on behind the edge; the scene has no
  // table there but the plane she is drawn on, so the shadow can be let go there (above). Beside a solid pixel (within about
  // three film pixels) it stays: that dark, half-covered rim is her jacket's own edge, not a shadow on anything.
  if (above < 1. && isShadow > 0.) {
    float solid = 0.; for (int i = 0; i < 8; i++) { float q = float(i) * .7853982; solid = max(solid, 1. - screenAt(uv + vec2(cos(q), sin(q)) * texel * 2., key, dk)); }
    kept *= mix(aboveShare((1. - frameUv.y) * FILM_PX.y, above), 1., smoothstep(.85, .97, solid));
  }
  a *= mix(1., kept, isShadow);
  if (a < .004) discard;
  // filmEven, after the key (the key reads the film as it is): the film's colour brought to its family's, then to the tone of the film before it while that match lasts
  if (evenOn > .5) pm = max(max(even * pm, 0.) * evenGain + evenLift * a, 0.);
  vec4 o = vec4(pm * grade * fanShade(vWorld), a);
  // The room's light on her sides (dealerRoom; the tint over all of her is in grade): her left side's light turns into her right's across her body.
  if (sideOn > .5) o.rgb *= mix(sideL, sideR, smoothstep(.32, .68, frameUv.x));
  // The room's light round her outline (a light wrap): where the film around a pixel is mostly screen, the pixel lies at her
  // edge, and the room that is seen right behind it there is added to it, as light from behind spills round a real body. It
  // takes her out of the cut-out and into the room. The room is read as it is shown (the curve of the scene's last pass).
  if (wrap > 0.) {
    float open = 0.; for (int i = 0; i < 8; i++) { float q = float(i) * .7853982; open += screenAt(uv + vec2(cos(q), sin(q)) * texel * 7., key, dk); }
    vec3 room = texture2D(roomMap, gl_FragCoord.xy / roomSize).rgb * roomExposure; room = pow(max(room / (1. + room) * 1.3, 0.), vec3(1. / 2.2));
    o.rgb += room * a * wrap * smoothstep(.06, .62, open / 8.);
  }
  if (cardOn > .5) { o = keyCards(o, uv, raw, key); if (o.a < .004) discard; }
  // the film's own card as the matte of the rendered card (cardMethod 'matte', src/scene3d-matte.ts): recoloured in place
  if (matteOn > .5) o = matteCard(o, vec2(uv.x, 1. - uv.y) * FILM_PX, raw, key, grade * fanShade(vWorld));
  gl_FragColor = o;
}`;

// shadow: strength of the keyed shadow on the felt (the table layer). above: the share of the keyed shadow kept above the table
// edge, on the upright layer (1 = all, as before; 0 = none, faded in over SHADOW_BAND rows up to the edge).
export type KeySettings = {lo: number; hi: number; shadow: number; above?: number};
// A film whose picture is not the standard frame: the dealer is drawn at `scale` of her usual size on a larger screen, and the
// middle of the dealer-side table edge, (881.5, 831.5) in the standard frame, lies at `anchor` in the film's own pixels. With
// layer BEHIND_TABLE the film carries no table: it is drawn on one plane `back` dealer metres behind the table's edge and the
// scene's own table hides what is behind it. shadow false: darker screen is not kept as a shadow. behindFrom: the film frame
// from which BEHIND_TABLE holds; before it the film is drawn in the usual two layers, read through scale and anchor, so a film
// can begin in the rest pose with her hands on the table and go behind the table once they have left it. Absent: from the
// first frame. behindUntil: the other way round, for an entrance: behind the table up to that frame, the usual layers from it
// (her hands have reached the table). size: the film's own picture in pixels when it is not the standard 1764 × 1174 (a wider film gives her more room to
// walk before its edge). rise: the frames in which she stands up (or, in an entrance, sits down), for a view that backs away to
// take her whole body in (src/scene3d-exit.ts). Written in a film's record as motion.frame.
export type FilmFrame = {scale: number; anchor: [number, number]; layer?: 'BEHIND_TABLE'; shadow?: boolean; back?: number; behindFrom?: number; behindUntil?: number; size?: [number, number]; rise?: [number, number]};
const fronts = new WeakMap<FilmFrame, FilmFrame>();
/** A film's frame as it holds at one of its frames: before behindFrom, and from behindUntil, it is the same frame without its layer. One object per answer, so the layers are placed anew only when the answer changes. */
export function frameAt(frame: FilmFrame | null, at: number): FilmFrame | null {
  if (!frame || frame.layer !== 'BEHIND_TABLE' || (frame.behindFrom === undefined || at >= frame.behindFrom) && (frame.behindUntil === undefined || at < frame.behindUntil)) return frame;
  let front = fronts.get(frame); if (!front) { front = {...frame}; delete front.layer; fronts.set(frame, front); }
  return front;
}
const BEHIND = 0.15; // dealer metres behind the edge when the film does not say
// Where the film's own card is to be keyed away in this frame (film pixels, quads clockwise on screen): `zone` where it and
// its blur can be, `core` its tracked colour, `colour` that colour lit (yellow back, blue face), `rim` how far its pale rim
// reaches outside the core, `shoe` the shoe window box, `over` a rendered card drawn in front of the hand. `seated`: the card
// seated in the shoe window (always its back), keyed away too when a rendered back lies under it. No dealt card: `core` null.
// `sides`: which colours count as card (0 the back's, 1 the face's, 2 both); `tint`: whose tint fingers on it lose (0, 1, or 2
// none); `trust`: how far the core is the card itself (the track's confidence in this frame); `drawn`: the rendered card's outline
// and `held` how far it is still in the hand (its pale edge beyond the outline then stays, untinted). `strength`: how far the dealt
// card's key is done, 1 (in full, as before) to 0 (the film as it is): the line's hand-over at rest keys the film's lying card away
// over a few frames (src/card-overlay.ts restFade), so the drawn card comes up under it and under her fingers. The seated card's is full.
export type CardKey = {zone: number[][]; core: number[][] | null; colour: number[]; sides: number; tint: number; trust: number; rim: number; shoe: number[] | null; over: number[][] | null;
  drawn?: number[][] | null; held?: number; strength?: number; seated?: {zone: number[][]; core: number[][]} | null};
// The film's own card as the matte (src/scene3d-matte.ts), as the passes left it for this frame: `box` the film pixels they ran in
// (x0, y0, x1, y1), `cover` the card's body with its rim covered (back, face), how near the body is, and the zone beside it where
// blurred card colour is unmixed, `shade` the film's shading over the body; `print` the face print and `toPrint` film pixel to print
// (row-major 3 × 3), `back` the back's colour in linear light, `paper` the light on the paper, `lying` the film card's brightness
// lying flat (back, face), `zone` the track's card grown (or null), `shoe` the shoe window box, `faceBack` the face shows the back
// too (a card dealt face down).
export type MatteKey = {box: number[]; cover: T.Texture; shade: T.Texture; print: T.Texture; toPrint: number[]; back: number[]; paper: number[]; lying: number[]; zone: number[][] | null; shoe: number[]; faceBack: boolean};
// The film card's colours in its own pixels (src/scene3d-matte.ts DARK_BACK, PAPER_FACE): `zone` where the dealt card can be in this
// frame and `seat` the card seated in the shoe window (quads clockwise on screen, film pixels; zone null: the seat alone), `shoe` the
// shoe window box, where a card blurred with a finger is not looked for (its gold frame has that blend's colours); `back` the dark back
// and `face` the paper in the film's values lit as the card lying flat (null: that side as filmed), `lying` the luminance of the
// film's back and face lying flat. `under`: beneath the drawn card, where the matte draws the shoe window and the key takes the card's
// tint off fingers: the window and a card blurred with a finger are left, the back's colour beside skin is de-yellowed instead of
// darkened and the face goes paper only where it is solid card (with the dark back the window's gold frame went dark and her hand took
// black stains; with the paper face the drawn face card took a white rim).
export type BackKey = {zone: number[][] | null; seat: number[][]; shoe: number[]; back: number[] | null; face: number[] | null; lying: number[]; under?: boolean};
export function createFilmLayers(filmVP: T.Matrix4, light: Record<string, {value: unknown}>) {
  // One frame, grade and card key for both layers; the rendered cards (scene3d-deal.ts) read the same frame and grade.
  const map = {value: null as T.Texture | null}, grade = {value: new T.Vector3(1, 1, 1)}, quad = () => [0, 1, 2, 3].map(() => new T.Vector2());
  const frame = {frameOn: {value: 0}, frameScale: {value: 1}, frameAnchor: {value: new T.Vector2(FRAME_FIX.x, FRAME_FIX.y)}, frameSize: {value: new T.Vector2(FILM.width, FILM.height)}};
  let framed: FilmFrame | null = null, placed = {edgeZ: 0, fold: true, depth: false, scale: 1}; const hide = {value: new T.Vector4(0, 0, -1, -1)};
  const card = {cardOn: {value: 0}, cardRim: {value: 4}, cardSides: {value: 0}, cardTint: {value: 2}, cardTrust: {value: 0}, cardOverOn: {value: 0}, cardHeld: {value: 0}, cardStrength: {value: 1}, cardDrawn: {value: quad()}, cardZone: {value: quad()}, cardCore: {value: quad()}, cardOver: {value: quad()}, cardColour: {value: new T.Vector3(1, 1, 0)}, cardShoe: {value: new T.Vector4(-1, -1, -1, -1)},
    seatOn: {value: 0}, seatZone: {value: quad()}, seatCore: {value: quad()}};
  const room = {roomMap: {value: null as T.Texture | null}, roomSize: {value: new T.Vector2(1, 1)}, roomExposure: {value: 1}};
  // the room's light on her (setRoomLight): its tint lies in grade with the calibration's; the sides have their own
  const side = {sideOn: {value: 0}, sideL: {value: new T.Vector3(1, 1, 1)}, sideR: {value: new T.Vector3(1, 1, 1)}}; let calibrated = [1, 1, 1], tint = [1, 1, 1];
  const putGrade = () => grade.value.set(calibrated[0] * tint[0], calibrated[1] * tint[1], calibrated[2] * tint[2]);
  const even = {evenOn: {value: 0}, even: {value: new T.Matrix3()}, evenGain: {value: new T.Vector3(1, 1, 1)}, evenLift: {value: new T.Vector3()}}, life = {lifeMove: {value: new T.Vector3()}};
  const matte = {matteOn: {value: 0}, matteFaceBack: {value: 0}, matteZoneOn: {value: 0}, matteBox: {value: new T.Vector4(0, 0, -1, -1)}, matteShoe: {value: new T.Vector4(0, 0, -1, -1)}, matteLying: {value: new T.Vector2(1, 1)}, matteZone: {value: quad()},
    matteBack: {value: new T.Vector3()}, mattePaper: {value: new T.Vector3(1, 1, 1)}, matteToPrint: {value: new T.Matrix3()},
    matteCover: {value: null as T.Texture | null}, matteShade: {value: null as T.Texture | null}, mattePrint: {value: null as T.Texture | null}};
  const back = {backOn: {value: 0}, faceOn: {value: 0}, backUnder: {value: 0}, backLying: {value: 0.835}, faceLying: {value: 0.44}, backZone: {value: quad()}, backSeat: {value: quad()}, backShoe: {value: new T.Vector4(0, 0, -1, -1)}, backFieldLit: {value: new T.Vector3()}, faceFieldLit: {value: new T.Vector3()}};
  const mouth = mouthUniforms(); // a spoken line's mouth over the film (src/scene3d-mouth.ts)
  const material = (refUv: T.Vector2) => new T.ShaderMaterial({vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, side: T.DoubleSide,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor,
    uniforms: {...light, ...card, ...matte, ...back, ...mouth, ...frame, ...room, ...side, ...even, ...life, wrap: {value: 0}, hide, map, filmVP: {value: filmVP}, refUv: {value: refUv}, lo: {value: 0.12}, hi: {value: 0.9}, shadow: {value: 1}, above: {value: 1}, erode: {value: 0.6}, edgeClean: {value: 0}, grade, texel: {value: new T.Vector2(1.4 / FILM.width, 1.4 / FILM.height)}}});
  // The screen reference is read in a corner that stays empty: top left for the backdrop, bottom left for the table.
  const bodyMat = material(new T.Vector2(0.02, 0.97)), tableMat = material(new T.Vector2(0.02, 0.03));
  const body = new T.Mesh(new T.PlaneGeometry(10, 3), bodyMat), table = new T.Mesh(new T.PlaneGeometry(10, 2).rotateX(-Math.PI / 2), tableMat);
  body.renderOrder = 5; table.renderOrder = 6;
  return {
    body, table, shared: {map, grade},
    setTexture(texture: T.Texture) { map.value = texture; },
    // Calibration of the film against the room: brightness, and warmth as red up and blue down by the same share. 1 and 0 leave the film as it is.
    setGrade(brightness: number, warmth: number) { calibrated = [brightness * (1 + warmth), brightness, brightness * (1 - warmth)]; putGrade(); },
    // The room's light on her (lightOnDealer): the tint goes over the calibration above, the sides across her body. 1, 1, 1 everywhere is the film as it is.
    setRoomLight(light: DealerLight) { tint = light.tint; putGrade(); side.sideL.value.set(light.left[0], light.left[1], light.left[2]); side.sideR.value.set(light.right[0], light.right[1], light.right[2]);
      side.sideOn.value = [...light.left, ...light.right].some(v => v !== 1) ? 1 : 0; },
    // filmEven: the film's colour brought to its family's (evenFor: a row-major 3 × 3 over the keyed colour, null for none), then
    // multiplied by gain and lifted by lift (what is left of a join's match, toneMatch). Neither: the film as it is.
    setEven(matrix: readonly number[] | null, gain: readonly number[] | null = null, lift: readonly number[] | null = null) {
      even.evenOn.value = matrix || gain ? 1 : 0; const m = matrix ?? [1, 0, 0, 0, 1, 0, 0, 0, 1], g = gain ?? [1, 1, 1], l = lift ?? [0, 0, 0];
      even.even.value.set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]); even.evenGain.value.set(g[0], g[1], g[2]); even.evenLift.value.set(l[0], l[1], l[2]); },
    // Life in her upper body (lifeShift): how much of it (0 = the film as it is) at the scene's clock in seconds.
    setLife(amount: number, seconds: number) { const [lean, tilt, breath] = lifeNow(seconds, amount); life.lifeMove.value.set(lean, tilt, breath); },
    // The film's own card keyed away (a rendered card lies under the film there), or null: the film as it is.
    setCards(key: CardKey | null) {
      card.cardOn.value = key ? 1 : 0; if (!key) return;
      const put = (to: T.Vector2[], q: number[][]) => q.forEach((p, i) => to[i].set(p[0], p[1])), none = [[-9, -9], [-8, -9], [-8, -8], [-9, -8]]; // a quad off the frame
      put(card.cardZone.value, key.core ? key.zone : none); put(card.cardCore.value, key.core ?? none); card.cardColour.value.set(key.colour[0], key.colour[1], key.colour[2]); card.cardRim.value = key.rim; card.cardSides.value = key.sides; card.cardTint.value = key.tint; card.cardTrust.value = key.trust;
      card.cardHeld.value = key.drawn ? key.held ?? 0 : 0; if (key.drawn) put(card.cardDrawn.value, key.drawn); card.cardStrength.value = Math.max(0, Math.min(1, key.strength ?? 1));
      card.seatOn.value = key.seated ? 1 : 0; if (key.seated) { put(card.seatZone.value, key.seated.zone); put(card.seatCore.value, key.seated.core); }
      if (key.shoe) card.cardShoe.value.set(key.shoe[0], key.shoe[1], key.shoe[2], key.shoe[3]); else card.cardShoe.value.set(-1, -1, -1, -1);
      card.cardOverOn.value = key.over ? 1 : 0; if (key.over) put(card.cardOver.value, key.over);
    },
    // The film's own card drawn as the rendered card in place (the matte, src/scene3d-matte.ts), or null: the film as it is.
    setMatte(m: MatteKey | null) {
      matte.matteOn.value = m ? 1 : 0; if (!m) return;
      const t = m.toPrint; matte.matteBox.value.set(m.box[0], m.box[1], m.box[2], m.box[3]); matte.matteShoe.value.set(m.shoe[0], m.shoe[1], m.shoe[2], m.shoe[3]); matte.matteToPrint.value.set(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8]);
      matte.matteCover.value = m.cover; matte.matteShade.value = m.shade; matte.mattePrint.value = m.print; matte.matteFaceBack.value = m.faceBack ? 1 : 0;
      matte.matteBack.value.set(m.back[0], m.back[1], m.back[2]); matte.mattePaper.value.set(m.paper[0], m.paper[1], m.paper[2]); matte.matteLying.value.set(m.lying[0], m.lying[1]);
      matte.matteZoneOn.value = m.zone ? 1 : 0; if (m.zone) m.zone.forEach((p, i) => matte.matteZone.value[i].set(p[0], p[1]));
    },
    // The film card's back dark and its face paper (BackKey), or null: the film as it is.
    setBack(b: BackKey | null) {
      back.backOn.value = b?.back ? 1 : 0; back.faceOn.value = b?.face ? 1 : 0; if (!b) return;
      const put = (to: T.Vector2[], q: number[][]) => q.forEach((p, i) => to[i].set(p[0], p[1]));
      put(back.backZone.value, b.zone ?? [[-9, -9], [-8, -9], [-8, -8], [-9, -8]]); put(back.backSeat.value, b.seat); back.backShoe.value.set(b.shoe[0], b.shoe[1], b.shoe[2], b.shoe[3]);
      if (b.back) back.backFieldLit.value.set(b.back[0], b.back[1], b.back[2]); if (b.face) back.faceFieldLit.value.set(b.face[0], b.face[1], b.face[2]); back.backUnder.value = b.under ? 1 : 0; back.backLying.value = b.lying[0]; back.faceLying.value = b.lying[1];
    },
    // A box of the film that is left undrawn (film pixels, y down: x0, y0, x1, y1), for a page that has an object of its own where
    // the film has one; null draws the whole film. Nothing in the game uses it yet: a hand that reaches into the box is cut too.
    setHide(box: number[] | null) { if (box) hide.value.set(box[0], box[1], box[2], box[3]); else hide.value.set(0, 0, -1, -1); },
    // A spoken line's mouth on the frame being drawn (src/scene3d-mouth.ts), or null: the film as it is.
    setMouth(shown: MouthShown | null) { putMouth(mouth, shown); },
    // The room as the scene has just drawn it (before its tone curve; `exposure` is what that pass multiplies it by) and how much
    // of it is laid round the dealer's outline, 0 = none. Only the upright layer takes it: behind the hands lies the felt, not the room.
    setWrap(texture: T.Texture | null, width: number, height: number, exposure: number, amount: number) { room.roomMap.value = texture; room.roomSize.value.set(width, height); room.roomExposure.value = exposure; bodyMat.uniforms.wrap.value = texture ? amount : 0; },
    // How much of the screen's green is taken out of her outline (key edgeClean, 0 to 1; 0 is the key as it is). Only on the upright
    // layer: on the table layer the film's yellow card has an outline too, and it is yellow by itself.
    setEdge(amount: number) { bodyMat.uniforms.edgeClean.value = Math.min(1, Math.max(0, amount || 0)); },
    setKey(key: KeySettings) { bodyMat.uniforms.lo.value = key.lo; bodyMat.uniforms.hi.value = key.hi - 0.08; bodyMat.uniforms.above.value = Math.max(0, Math.min(1, key.above ?? 1)); tableMat.uniforms.lo.value = key.lo; tableMat.uniforms.hi.value = key.hi; tableMat.uniforms.shadow.value = key.shadow; },
    // Folded: the plane stands on the table edge and the table layer carries hands, cards and shadows.
    // Unfolded: one plane carries the whole frame and nothing follows the felt when the camera moves.
    // `depth` makes the layers write depth, which the focus blur reads; the unfolded plane then passes the depth test always instead of skipping it.
    place(edgeZ: number, fold: boolean, depth = false, scale = placed.scale) { placed = {edgeZ, fold, depth, scale};
      const behind = framed?.layer === 'BEHIND_TABLE';
      // Behind the table: the whole frame on one upright plane that reaches from the floor up, a little behind the dealer-side
      // edge and tested against the table's depth, so the 3D table hides her legs until she comes out beside it.
      table.visible = fold && !behind; table.position.set(0, 0.0015, edgeZ + 1);
      body.position.set(0, behind ? 1 : fold ? 1.5 : 0.5, behind ? edgeZ - (framed!.back ?? BEHIND) * scale : edgeZ); body.scale.y = behind ? 2 : fold ? 1 : 5 / 3;
      bodyMat.depthTest = behind || fold || depth; bodyMat.depthFunc = behind || fold ? T.LessEqualDepth : T.AlwaysDepth; bodyMat.depthWrite = tableMat.depthWrite = depth; },
    /**
     * The frame of the film on screen, or null for the standard frame. A film with a frame of its own shows the dealer at
     * `scale` of her usual size with the fixed point (the middle of the dealer-side table edge) at `anchor` in its own pixels.
     */
    setFrame(next: FilmFrame | null) {
      if (next === framed) return; framed = next;
      frame.frameOn.value = next ? 1 : 0; frame.frameScale.value = next?.scale ?? 1; frame.frameAnchor.value.set(next?.anchor[0] ?? FRAME_FIX.x, next?.anchor[1] ?? FRAME_FIX.y); frame.frameSize.value.set(next?.size?.[0] ?? FILM.width, next?.size?.[1] ?? FILM.height);
      bodyMat.uniforms.shadow.value = next && next.shadow === false ? 0 : 1; // without a table under her a darker green is not a shadow on anything
      this.place(placed.edgeZ, placed.fold, placed.depth, placed.scale);
    },
  };
}

// One piece of film: source frames start … end − 1 of a clip. end null = to the clip's last frame.
// A deal followed by a return that was generated from one of the deal's own frames must stop at that frame
// (src/clip-graph.ts resolveRound gives the range); played to its end, the hand lifts and then jumps back.
// Optional per part: `rate` playback speed, `track` the card track of this piece (the scene then uses it while the
// piece is on screen; null = no card), `cards` extra options for the rendered cards (lying cards, a value per card).
// `frame`: a film with a frame of its own (see FilmFrame). `fps`: the film's own frames per second when it is not 30; start,
// end and every frame number of the part are counted in the film's own frames. `sound`: the film has a sound track that is to be
// heard (a spoken line, tools/speech.ts); every other film is muted. A browser lets a page sound only after the visitor has
// touched it, so before that a spoken line plays muted like the rest instead of not playing at all. `model`: the generator that
// made the film (its record's source.model), for the key filmEven; a part without it is drawn as it is. `rest`: a rest film, which
// keeps its speed under the key filmTempo, as a spoken line does. `mouth`: a spoken line laid on the part from a mouth patch
// (src/scene3d-mouth.ts); the part plays at its own speed, neither tempo nor hurry changes it, so that mouth and sound stay with it.
export type Part = {path: string; start?: number; end?: number | null; rate?: number; track?: CardTrack | null; cards?: Partial<OverlayOptions> | null; frame?: FilmFrame | null; fps?: number; sound?: boolean; model?: string; rest?: boolean; effect?: PartEffect | null; mouth?: MouthPart | null};
// A film's effect on the scene (a record's motion.effect, carried on the part). room-flash, lightning: for `seconds` of the film's
// own time from `at` the room is another (`room`, an id of the register), and with `mono` the whole picture is black and white,
// table, cards and dealer too. A white flash takes the picture there and a softer one takes it back (roomFlashAt).
export type PartEffect = FilmEffect; // src/clip-graph.ts reads it from the record (effectOf)
// The lightning's course in seconds of the film: the first flash rises to white in `rise` and falls away in `fall`; the other room
// comes on at its peak. Between the two flashes the other room stands clean: a fainter flash in the middle was tried and taken out
// (an independent review, 2026-11-13: three flashes of the whole picture in 0.87 s is at the limit of the rule of at most three a
// second that protects light-sensitive viewers, and the room was seen clean for only 0.4 s in two pieces). The flash back
// rises to backPeak over `back`, stays there for backHold (so that the last frame of the other room and the first frame of the
// room that comes back are both under its peak, whatever the film's frame rate: the change is hidden in the light, as the first
// one is), the room goes back when the hold ends, and it falls away in backFall. The figures were set with the session that owns
// the effect's look, against its mock-up of the second on the champagne film (2026-11-13).
export const FLASH = {rise: 0.08, fall: 0.27, back: 0.08, backHold: 0.05, backPeak: 0.9, backFall: 0.2};
/** `t` seconds of the film after a room-flash's `at`, for a hold of `seconds`: how white the picture is (0 to 1), and whether the other room (and the grey) is on. */
export function roomFlashAt(t: number, seconds: number): {flash: number; on: boolean} {
  const F = FLASH; if (!(t >= 0) || !(seconds > 0) || t >= seconds + F.backFall) return {flash: 0, on: false};
  const first = t < F.rise ? t / F.rise : 1 - smooth(0, F.fall, t - F.rise);
  const up = seconds - F.backHold - F.back, back = t < up ? 0 : t < seconds - F.backHold ? F.backPeak * (t - up) / F.back : t < seconds ? F.backPeak : F.backPeak * (1 - smooth(0, F.backFall, t - seconds));
  return {flash: Math.min(1, Math.max(first, back)), on: t >= F.rise && t < seconds};
}
export type PlayOptions = {loop?: boolean; cut?: boolean; onPart?: (index: number, part: Part) => void; onEnd?: () => void; onError?: (error: Error) => void};
type Player = {part: Part; path: string; start: number; end: number | null; fps: number; video: HTMLVideoElement; texture: T.VideoTexture};
const FPS = 30;
/**
 * The source frame a video time lies in: the one rule of the queue, for a presented frame's media time and for currentTime alike.
 * A frame's media time comes in whole microseconds, so the start of frame 58 reads 1.933333 s, 57.99999 frames; the margin of a
 * thousandth of a frame reads it as 58, and stays far below the half frame that a seek or a playing clock sits past a frame start.
 */
export const frameAtTime = (seconds: number, fps = FPS): number => Math.floor(seconds * fps + 1e-3);
// One or more parts played as a chain, each on its own video element so the next one is decoded before it is shown.
// hooks.refused: a film with sound was refused its start by the browser and now plays muted (enter); the page can say the line
// another way (src/scene3d-voice.ts). Called with the part and its video element, once per refused start.
export function createPlayers(onShow: (texture: T.Texture, path: string) => void, onChange: () => void, hooks: {refused?: (part: Part, video: HTMLVideoElement) => void} = {}) {
  let players: Player[] = [], current = 0, paused = false, gone = false, tempo = 1;
  // The speed a part plays at: in the queue its own rate times the tempo (key filmTempo). The tempo is for the films of a round:
  // a spoken line does not take it (its sound is in the film), nor does a rest film (hurried, her breathing and blinking look
  // wound forward), and a chain from load(), a take played by itself to be looked at, is never hurried. Card tracks and the end of
  // a part are counted in the film's own frames, so they follow.
  const speedOf = (part: Part, queued: boolean) => part.mouth || !queued ? 1 : (part.rate ?? 1) * (part.sound === true || part.rest === true ? 1 : tempo);
  // What dispose() has to reach: every listener hangs on one signal, and every frame request and timer is kept until it fires,
  // so that a queue that is taken down leaves nothing behind that could call back into it.
  const ending = new AbortController(), asked = new Map<HTMLVideoElement, Set<number>>(), timers = new Set<ReturnType<typeof setTimeout>>();
  const listen = (v: HTMLVideoElement, type: string, call: () => void, once = false) => v.addEventListener(type, call, {once, signal: ending.signal});
  const frameCall = (v: HTMLVideoElement, call: VideoFrameRequestCallback) => { let ids = asked.get(v); if (!ids) asked.set(v, ids = new Set()); const own = ids, id = v.requestVideoFrameCallback((now, frame) => { own.delete(id); call(now, frame); }); own.add(id); };
  const later = (call: () => void, ms: number) => { const id = setTimeout(() => { timers.delete(id); call(); }, ms); timers.add(id); return id; };
  // An element let go of: stopped, its frame requests cancelled, its source dropped (the browser frees the decoder) and its texture freed.
  const drop = (video: HTMLVideoElement, texture: T.Texture) => { video.pause(); for (const id of asked.get(video) ?? []) video.cancelVideoFrameCallback(id); asked.delete(video); video.removeAttribute('src'); video.load(); texture.dispose(); };
  const show = (i: number) => { current = i; onShow(players[i].texture, players[i].path); onChange(); };
  // The middle of the part's first frame, also for frame 0: an element that has never been seeked takes about a quarter
  // of a second to get going and drops its first frames; one that waits on a seeked frame starts on the next frame.
  const startTime = (p: Player) => (p.start + 0.5) / p.fps;
  // The media time of the frame an element last presented: the frame its texture holds. currentTime is the element's clock and runs
  // ahead of that frame, by up to a frame's time and more often the faster the film plays; a card drawn for the frame after the one
  // on screen lies beside the film's card. Forgotten when the queue moves an element (the next frame it presents sets it anew), and
  // not believed when it lies far from the clock.
  const presented = new WeakMap<HTMLVideoElement, number>();
  const moveTo = (video: HTMLVideoElement, seconds: number) => { presented.delete(video); video.currentTime = seconds; };
  const shownAt = (video: HTMLVideoElement) => { const at = presented.get(video); return at !== undefined && !video.seeking && Math.abs(at - video.currentTime) < 0.25 ? at : video.currentTime; };
  const make = (part: Part): Player => {
    const video = document.createElement('video'); video.muted = !(part.sound === true && globalThis.navigator?.userActivation?.hasBeenActive === true); video.playsInline = true; video.preload = 'auto'; video.src = part.path;
    const texture = new T.VideoTexture(video); texture.colorSpace = T.NoColorSpace; texture.minFilter = texture.magFilter = T.LinearFilter; texture.generateMipmaps = false;
    if (video.requestVideoFrameCallback) { const note = (_now: number, frame: {mediaTime: number}) => { presented.set(video, frame.mediaTime); frameCall(video, note); }; frameCall(video, note); }
    return {part, path: part.path, start: part.start ?? 0, end: part.end ?? null, fps: part.fps ?? FPS, video, texture};
  };
  // The part on screen is done: stop it where it is and bring in the next one on its first decoded frame.
  function advance(list: Player[], i: number) {
    if (gone || paused || list !== players || current !== i) return;
    const n = (i + 1) % list.length, next = list[n]; list[i].video.pause(); moveTo(next.video, startTime(next));
    const swap = () => { if (list === players) show(n); };
    if (next.video.requestVideoFrameCallback) frameCall(next.video, swap); else later(swap, 40);
    next.video.play().catch(() => {});
  }
  async function load(parts: Part[]) {
    if (gone) return;
    const queued = !!chain; closeQueue(); if (queued) players = [];
    for (const p of players) drop(p.video, p.texture);
    const list = players = loaded = parts.map(make);
    list.forEach((p, i) => { p.video.playbackRate = speedOf(p.part, false);
      listen(p.video, 'ended', () => advance(list, i));
      if (p.end === null) return;
      const last = p.end - 1, reached = (seconds: number) => frameAtTime(seconds, p.fps) >= last;
      if (p.video.requestVideoFrameCallback) { const watch = (_now: number, frame: {mediaTime: number}) => { if (list !== players) return; if (reached(frame.mediaTime)) advance(list, i); frameCall(p.video, watch); }; frameCall(p.video, watch); }
      else listen(p.video, 'timeupdate', () => { if (reached(p.video.currentTime)) advance(list, i); });
    });
    // After dispose() neither listener is left, and the promise stays open: nothing waits on a queue that is gone.
    await Promise.all(list.map(p => new Promise<void>((resolve, reject) => { if (p.video.readyState >= 2) resolve(); else { listen(p.video, 'loadeddata', () => resolve(), true); listen(p.video, 'error', () => reject(Error(`Filmen kunde inte läsas: ${p.path}`)), true); } })));
    if (list !== players) return;
    moveTo(list[0].video, startTime(list[0])); show(0); if (!paused) list[0].video.play().catch(() => {});
  }
  async function seek(i: number, seconds: number) {
    if (gone) return;
    paused = true; players.forEach(p => p.video.pause()); const v = players[i].video;
    await new Promise<void>(resolve => { const done = () => { if (v.requestVideoFrameCallback) { const fallback = later(resolve, 250); frameCall(v, () => { clearTimeout(fallback); timers.delete(fallback); resolve(); }); } else later(resolve, 60); };
      if (Math.abs(v.currentTime - seconds) < 1e-4 && v.readyState >= 2) done(); else { listen(v, 'seeked', done, true); moveTo(v, seconds); } });
    if (gone) return;
    players[i].texture.needsUpdate = true; show(i);
  }

  // ---- a queue for a game: chains that follow each other without a blank frame -----------------------------------
  // Video elements are kept in a small pool by path, so a clip that comes back is not fetched again. A chain asked for
  // while a part is on screen starts when that part is done, because clips only fit together at their ends; `cut`
  // starts it as soon as its first frame is decoded. Either way the old frame stays up until the new one exists.
  // While a queue plays, `parts`, `count`, `seek` and `step` describe the one part on screen.
  type Media = {path: string; video: HTMLVideoElement; texture: T.VideoTexture; busy: boolean; used: number; hook: ((mediaTime: number | null) => void) | null; fail: (() => void) | null; broken: boolean};
  // gaps: the parts in a row that could not be read (a loop of nothing but gaps ends instead of going round for ever)
  type Chain = {parts: Part[]; media: (Media | undefined)[]; options: PlayOptions; gaps?: number};
  // START_MS: a part's film is started by this timer if the page draws nothing (a hidden tab), so that a round is never left waiting.
  const START_MS = 50;
  // partStart: a part waits a tenth of a frame into its first frame, which is still a real seek that lands on that frame. Its film
  // starts to run when the frame has been drawn (enter); from the middle of the frame the second frame got half a frame's time
  // less, and at 30 fps on a 60 Hz screen it was then lost at 8 of 36 starts.
  const POOL = 8, LEAD_MS = 4, partStart = (part: Part) => ((part.start ?? 0) + 0.1) / (part.fps ?? FPS), frameOf = (seconds: number, part: Part) => frameAtTime(seconds, part.fps ?? FPS);
  let pool: Media[] = [], loaded: Player[] = [], used = 0, chain: Chain | null = null, waiting: Chain | null = null, entering: Chain | null = null, shown: Media | null = null, token = 0, held = false;
  function discard(m: Media) { pool = pool.filter(p => p !== m); m.hook = m.fail = null; drop(m.video, m.texture); }
  // An element for the path that nothing else is using; a new one if there is none. The pool is trimmed of the longest unused.
  function media(path: string): Media {
    const free = pool.find(m => m.path === path && !m.busy && !m.broken); if (free) { free.busy = true; free.used = ++used; return free; }
    const made = make({path}), m: Media = {path, video: made.video, texture: made.texture, busy: true, used: ++used, hook: null, fail: null, broken: false}, v = m.video;
    listen(v, 'ended', () => m.hook?.(null)); listen(v, 'error', () => { m.broken = true; m.fail?.(); }); // an error before the part is entered is remembered for then
    if (v.requestVideoFrameCallback) { const watch = (_now: number, frame: {mediaTime: number}) => { if (!pool.includes(m)) return; m.hook?.(frame.mediaTime); frameCall(v, watch); }; frameCall(v, watch); }
    else listen(v, 'timeupdate', () => m.hook?.(v.currentTime));
    pool.push(m);
    for (const spare of pool.filter(p => !p.busy).sort((a, b) => a.used - b.used)) { if (pool.length <= POOL) break; discard(spare); }
    return m;
  }
  // Lets go of a chain's elements, except the one on screen.
  function forget(c: Chain | null) { for (const m of c?.media ?? []) if (m && m !== shown) { m.busy = false; m.hook = m.fail = null; m.video.pause(); } }
  function closeQueue() { token++; for (const m of [...pool]) discard(m); chain = waiting = entering = shown = null; held = false; }
  // The part's element, waiting on its first frame. A part that is on screen itself (a loop of one) gets a second element.
  function prime(c: Chain, i: number): Media {
    let m = c.media[i]; if (!m || m === shown) m = c.media[i] = media(c.parts[i].path);
    const at = partStart(c.parts[i]); if (Math.abs(m.video.currentTime - at) > 1e-3) moveTo(m.video, at); return m;
  }
  // Brings part i of the chain on screen. `ended`: the part on screen is done and stops where it is; otherwise it runs on
  // until the new frame exists (and stops by itself if it gets to its end first).
  function enter(c: Chain, i: number, ended: boolean) {
    const my = ++token, part = c.parts[i], from = shown, onScreen = players[current], m = prime(c, i), v = m.video;
    if (entering && entering !== c && entering !== chain) forget(entering); entering = c;
    if (from) { if (ended) { from.video.pause(); from.hook = null; } else { const last = onScreen ? (onScreen.end ?? Math.max(1, Math.round(onScreen.video.duration * onScreen.fps))) - 1 : Infinity; from.hook = time => { if (time === null || frameAtTime(time, onScreen?.fps ?? FPS) >= last) from.video.pause(); }; } }
    const swap = () => {
      if (my !== token) return;
      const old = chain; shown = m; chain = c; entering = null; held = false; c.gaps = 0; if (waiting === c) waiting = null;
      if (from) { from.video.pause(); from.hook = null; if (!c.media.includes(from)) from.busy = false; }
      if (old && old !== c) forget(old);
      for (const p of loaded) drop(p.video, p.texture); loaded = [];
      players = [{part, path: part.path, start: part.start ?? 0, end: part.end ?? null, fps: part.fps ?? FPS, video: v, texture: m.texture}]; current = 0;
      const last = (part.end ?? Math.max(1, Math.round(v.duration * (part.fps ?? FPS)))) - 1;
      // The part is done when the frame after its last is due, not when its last arrives: a frame request is answered in the
      // rendering step that draws that frame, before the scene's own animation frame, so a change of film there would put the
      // next part in the last frame's place and the last frame would never be drawn. So the change comes with the first frame
      // past the last (exact: the next part takes that frame's place), with `ended`, or one frame time at the rate it plays
      // after the last frame arrived, a few ms early so that it lands before the rendering step that frame would have had
      // (the clip's own last frame has no frame after it, and a frame past the end may be late). Whichever comes first.
      let done = false, due: ReturnType<typeof setTimeout> | null = null;
      const end = () => { if (done || my !== token || paused) return; done = true; if (due !== null) { clearTimeout(due); timers.delete(due); } finish(c, i); };
      m.hook = time => { if (my !== token || paused) return; const at = time === null ? Infinity : frameOf(time, part);
        if (at > last) end();
        else if (at === last) { if (due === null) due = later(() => { due = null; end(); }, Math.max(0, 1000 / ((part.fps ?? FPS) * v.playbackRate) - LEAD_MS)); }
        // A hurried part slows to normal speed for its last frames, so it stops on its end frame and not a few frames past it.
        else if (v.playbackRate > 1 && last - at <= 2 * v.playbackRate) v.playbackRate = 1; };
      // what comes next is decoded before it is needed
      if (waiting) prime(waiting, 0); else if (i + 1 < c.parts.length) prime(c, i + 1); else if (c.options.loop) prime(c, 0);
      c.options.onPart?.(i, part); onShow(m.texture, m.path); onChange();
    };
    // A film that cannot be read (taken away, or missing in a store) is a gap, not a stop: the page is told, the element goes, and
    // the queue goes on as if the part had played, to the next part or to the chain's end, so that a round is never left waiting.
    m.fail = () => { if (my !== token) return; c.options.onError?.(Error(`Filmen kunde inte läsas: ${part.path}`));
      c.media[i] = undefined; discard(m); c.gaps = (c.gaps ?? 0) + 1; if (waiting === c) waiting = null; if (entering === c) entering = null; finish(c, i); };
    if (m.broken) { m.fail(); return; }
    // A frame request that has waited long on a paused video is no longer polled by the browser, and the first frame after
    // play() then arrives a quarter of a second late with the frames in between dropped. A fresh request sets that right.
    if (v.requestVideoFrameCallback) frameCall(v, () => {});
    // A pooled element is made for its path alone (media), so whether it is heard is decided here, each time a part starts:
    // a spoken line (part.sound) once the page has been touched, everything else muted. Without this line a talk film in
    // a chain was always muted: she moved her mouth in the game and said nothing.
    v.muted = !(part.sound === true && globalThis.navigator?.userActivation?.hasBeenActive === true);
    v.playbackRate = speedOf(part, true);
    let run = false;
    // A film that may not be heard is still shown: a browser that refuses to start a film with sound (one that wants a touch of
    // its own for every film that is heard) gets it muted instead, so that a round is never left standing on a line's first frame.
    // Only that refusal: a start that a pause interrupted is refused too, and that film is meant to stand.
    const start = () => { if (run || my !== token) return; run = true; if (!paused) v.play().catch((error: unknown) => {
      if ((error as {name?: string} | null)?.name === 'NotAllowedError' && !v.muted && my === token && !paused) { v.muted = true; v.play().catch(() => {}); hooks.refused?.(part, v); } }); };
    // Waiting on its first frame already: shown at once, so the join costs no frame, and the film starts to run when that frame has
    // been drawn, not here. Started here, it had run on before the picture was drawn (a join made by the timer above falls between
    // two drawings, and a drawing can come late), and a frame among the part's first two was never seen: at 13 of 35 joins in a
    // round recorded on a stepped clock and at 21 of 91 starts in a browser, against 0 of 35 and 1 of 79 this way (2026-11-13).
    // The price is that every part gets going about a frame later. The start is asked for as an animation frame, which comes
    // after the scene's own drawing in the same rendering step, because the scene asked for its frame first.
    if (v.readyState >= 2 && !v.seeking) { m.texture.needsUpdate = true; swap(); if (globalThis.requestAnimationFrame) globalThis.requestAnimationFrame(start); later(start, START_MS); }
    // Otherwise it runs from here and is shown on the first frame it presents: an element that is not ready stays so while it
    // stands still (tried: shown standing, a new element's first frame came 0.9 s after the last frame of the part before).
    else { start(); m.hook = swap; if (!v.requestVideoFrameCallback) later(swap, 40); }
  }
  function finish(c: Chain, i: number) {
    if (waiting) return enter(waiting, 0, true);
    if (i + 1 < c.parts.length) return enter(c, i + 1, true);
    if (c.options.loop && (c.gaps ?? 0) < c.parts.length) return enter(c, 0, true);
    if (shown) { shown.video.pause(); shown.hook = null; } held = true; c.options.onEnd?.(); onChange(); // the last frame stays
  }
  function play(parts: Part[], options: PlayOptions = {}) {
    if (gone || !parts.length) return; const next: Chain = {parts, media: [], options}; paused = false;
    if (waiting) forget(waiting); waiting = null;
    if (chain && shown && !held && !options.cut) { waiting = next; prime(next, 0); shown.video.play().catch(() => {}); return; }
    enter(next, 0, held);
  }
  return {
    load, seek, play,
    // Speed of the part on screen, from now until it ends: a gesture hurried along because a deal is waiting.
    // Never slower than the part already plays (the tempo).
    hurry(rate: number) { const p = players[current]; if (p && !p.part.mouth && p.part.sound !== true) p.video.playbackRate = Math.max(rate, speedOf(p.part, !!chain)); }, // a spoken line is never hurried: its voice is in the film
    // The tempo of a round's films (key filmTempo; 1 = as filmed), from now on and for the part on screen.
    tempo(value: number) { const next = Number.isFinite(value) ? Math.min(4, Math.max(0.25, value)) : 1; if (next === tempo) return; tempo = next; for (const p of players) p.video.playbackRate = speedOf(p.part, !!chain); },
    // Fetches clips the game may ask for next, so the change does not wait for the network. The pool holds ${POOL} elements.
    preload(paths: string[]) { if (!gone) for (const path of paths) if (!pool.some(m => m.path === path)) media(path).busy = false; },
    // The part on screen, with what it carries (track, cards).
    get part(): Part | null { return players[current]?.part ?? null; },
    toggle(force?: boolean) { if (gone) return; paused = force ?? !paused; const v = players[current]?.video; if (v) { if (paused) v.pause(); else v.play().catch(() => {}); } onChange(); },
    // Takes the queue down for good, for a page that goes away (a React view): every element it made, on screen, waiting or
    // preloaded, is stopped and emptied, its frame requests and listeners go, its texture is freed, and pending timers are
    // cleared. Neither onShow nor onChange is called again; every later call is a no-op and the getters say there is no film.
    dispose() {
      if (gone) return; gone = true; paused = true; const pooled = new Set(pool.map(m => m.video)); closeQueue(); // the queue's own elements, the one on screen among them
      for (const p of new Set([...players, ...loaded])) if (!pooled.has(p.video)) drop(p.video, p.texture); players = loaded = []; current = 0; // a chain from load()
      ending.abort(); for (const id of timers) clearTimeout(id); timers.clear();
      for (const [v, ids] of asked) for (const id of ids) v.cancelVideoFrameCallback(id); asked.clear();
    },
    // Half a frame past the frame start, so the decoder lands on that frame and not the one before it.
    // Stays inside the part on screen.
    step(frames: number) { const p = players[current]; if (!p) return Promise.resolve(); const last = (p.end ?? Math.max(1, Math.round(p.video.duration * p.fps))) - 1, frame = Math.max(p.start, Math.min(last, frameAtTime(p.video.currentTime, p.fps) + frames)); return seek(current, (frame + 0.5) / p.fps); },
    get paused() { return paused; }, get path() { return players[current]?.path ?? ''; },
    // The video on screen and its texture, for a layer that draws on the film frame (rendered cards).
    get current() { const p = players[current]; return p ? {video: p.video, texture: p.texture} : null; }, get count() { return players.length; },
    // The chain as source frame ranges, end exclusive; for stepping through it frame by frame from outside.
    get parts() { return players.map(p => ({path: p.path, start: p.start, end: p.end ?? Math.round(p.video.duration * p.fps)})); },
    // Source frame of the clip on screen, by the queue's one rule (frameAtTime): card tracks are indexed by it. The frame the element
    // last presented, which is the one in its texture (shownAt).
    frame() { const p = players[current]; return p ? frameAtTime(shownAt(p.video), p.fps) : 0; },
  };
}
