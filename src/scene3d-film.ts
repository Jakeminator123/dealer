// The Pamela film inside the 3D scene: keyed in the shader and projected from the film camera onto two
// surfaces, a vertical plane standing on the dealer-side table edge and the table top. Seen from the film
// camera's own position this is the film pixel for pixel, whatever the camera figures are; turning the view
// about that position stays exact, moving it is an approximation.
import * as T from 'three';
import {FILM} from './scene3d-geometry.ts';
import {FAN_GLSL} from './scene3d-light.ts';
import {MATTE_GLSL} from './scene3d-matte.ts';

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
uniform float cardOn, cardRim, cardSides, cardTint, cardTrust, cardOverOn, cardHeld, seatOn; uniform vec2 cardZone[4], cardCore[4], cardOver[4], cardDrawn[4], seatZone[4], seatCore[4]; uniform vec3 cardColour; uniform vec4 cardShoe;
${CARD_GLSL}
const vec3 BACK_LIT = vec3(.91, .82, .02), FACE_LIT = vec3(0., .475, .89); // the film card's yellow back and blue face, lit
// Skin, the hand that must stay in front, from a pale fingertip to a knuckle in warm shadow: warm (red over blue, red at least
// green), blue at least about half of green (skin 0.6 to 0.95; the yellow card has almost none), green not far under red (a red
// mark is no skin).
float skinOf(vec3 c){ return smoothstep(.03, .08, c.r - c.b) * smoothstep(-.02, .03, c.r - c.g) * smoothstep(.4, .55, c.b / max(c.g, .01)) * smoothstep(.38, .48, c.g / max(c.r, .01)); }
// One film card keyed away: zoneQ where it and its blur can be, coreQ its tracked colour, colour that colour lit, rim how far its
// pale rim reaches, sides which colours count as card (0 the back, 1 the face, 2 both), tint whose tint fingers on it lose (0
// the back's, 1 the face's, 2 none), trust how far the core is the card itself (the track's confidence); inside the shoe box
// only the card itself and its rim go (the next card seated there stays).
vec4 keyCard(vec4 o, vec2 px, vec3 c, vec3 key, vec2 zoneQ[4], vec2 coreQ[4], vec3 colour, float rim, float sides, float tint, float trust, vec4 shoe, vec2 drawnQ[4], float held){
  float zone = smoothstep(-2., 2., quadIn(px, zoneQ)); if (zone <= 0.) return o;
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
  vec4 keyed = mix(mix(o, f, zone * onCard), vec4(0., 0., 0., dark), bg * zone);
  // While the card is held, its pale edge beyond the drawn card (its white edge, thick when seen steeply) is the card's own: it
  // stays as the film draws it, without the film card's tint, instead of opening onto the felt.
  float beyond = quadIn(px, drawnQ), edge = held * (1. - smoothstep(-1., 0., beyond)) * smoothstep(-7., -4., beyond) * max(max(face * smoothstep(.06, .16, c.b - c.r), back * cream), pale) * smoothstep(.45, .6, dot(c, vec3(.2126, .7152, .0722)));
  return mix(keyed, vec4(vec3(dot(o.rgb, vec3(.2126, .7152, .0722))), o.a), edge * zone);
}
// The card seated in the shoe window (its back), then the dealt card; a card drawn in front of the hand keeps no film inside it.
vec4 keyCards(vec4 o, vec2 uv, vec3 c, vec3 key){
  vec2 px = vec2(uv.x, 1. - uv.y) * FILM_PX;
  if (cardOverOn > .5 && quadIn(px, cardOver) > 0.) return vec4(0.);
  if (seatOn > .5) o = keyCard(o, px, c, key, seatZone, seatCore, BACK_LIT, 4., 0., 2., 1., vec4(-1.), seatCore, 0.);
  return keyCard(o, px, c, key, cardZone, cardCore, cardColour, cardRim, cardSides, cardTint, cardTrust, cardShoe, cardDrawn, cardHeld);
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
const FRAGMENT = `varying vec4 vFilm; varying vec3 vWorld; uniform sampler2D map; uniform vec2 refUv, texel, frameAnchor, frameSize; uniform float lo, hi, shadow, above, erode, frameOn, frameScale; uniform vec3 grade; uniform vec4 hide;
uniform sampler2D roomMap; uniform vec2 roomSize; uniform float wrap, roomExposure; ${SIDE_GLSL}
${FAN_GLSL}
${CARD_KEY}
${MATTE_GLSL}
${ABOVE_GLSL}
float screenAt(vec2 uv, vec3 key, float dk){ vec3 c = texture2D(map, uv).rgb; return clamp(((c.g - max(c.r, c.b)) / dk - lo) / (hi - lo), 0., 1.); }
void main(){
  if (vFilm.w <= 0.) discard;
  vec2 uv = vFilm.xy / vFilm.w * .5 + .5, frameUv = uv; // frameUv: the standard frame, where the table edge row is
  // A film with a frame of its own (the dealer smaller on a larger screen, so that she can stand up and walk out): the point of
  // the standard frame is found in that film. The middle of the dealer-side table edge is the fixed point of the two frames.
  if (frameOn > .5) { vec2 px = (vec2(uv.x, 1. - uv.y) * FILM_PX - FRAME_FIX) * frameScale + frameAnchor; uv = vec2(px.x / frameSize.x, 1. - px.y / frameSize.y); }
  if (uv.x < .001 || uv.x > .999 || uv.y < .001 || uv.y > .999) discard;
  // A box of the film that the page draws an object of its own for (the shoe): film pixels, y down. Off while x1 < x0.
  if (hide.z > hide.x) { vec2 hp = vec2(uv.x, 1. - uv.y) * FILM_PX; if (hp.x > hide.x && hp.x < hide.z && hp.y > hide.y && hp.y < hide.w) discard; }
  vec3 c = texture2D(map, uv).rgb, key = texture2D(map, refUv).rgb;
  float dk = max(key.g - max(key.r, key.b), .05), s = (c.g - max(c.r, c.b)) / dk;
  float screen = clamp((s - lo) / (hi - lo), 0., 1.);
  // pull the matte in by about one source pixel: the outermost pixel of skin and hair carries the screen's green
  float around = max(max(screenAt(uv + vec2(texel.x, 0.), key, dk), screenAt(uv - vec2(texel.x, 0.), key, dk)), max(screenAt(uv + vec2(0., texel.y), key, dk), screenAt(uv - vec2(0., texel.y), key, dk)));
  float a0 = 1. - screen, a = 1. - max(screen, mix(screen, around, erode));
  vec3 pm = max(c - screen * key, 0.);
  pm.g = min(pm.g, mix(max(pm.r, pm.b), .5 * (pm.r + pm.b), smoothstep(0., .1, s)));
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
  if (cardOn > .5) { o = keyCards(o, uv, c, key); if (o.a < .004) discard; }
  // the film's own card as the matte of the rendered card (cardMethod 'matte', src/scene3d-matte.ts): recoloured in place
  if (matteOn > .5) o = matteCard(o, vec2(uv.x, 1. - uv.y) * FILM_PX, c, key, grade * fanShade(vWorld));
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
// and `held` how far it is still in the hand (its pale edge beyond the outline then stays, untinted).
export type CardKey = {zone: number[][]; core: number[][] | null; colour: number[]; sides: number; tint: number; trust: number; rim: number; shoe: number[] | null; over: number[][] | null;
  drawn?: number[][] | null; held?: number; seated?: {zone: number[][]; core: number[][]} | null};
// The film's own card as the matte (src/scene3d-matte.ts), as the passes left it for this frame: `box` the film pixels they ran in
// (x0, y0, x1, y1), `cover` the card's body with its rim covered (back, face), how near the body is, and the zone beside it where
// blurred card colour is unmixed, `shade` the film's shading over the body; `print` the face print and `toPrint` film pixel to print
// (row-major 3 × 3), `back` the back's colour in linear light, `paper` the light on the paper, `lying` the film card's brightness
// lying flat (back, face), `zone` the track's card grown (or null), `shoe` the shoe window box, `faceBack` the face shows the back
// too (a card dealt face down).
export type MatteKey = {box: number[]; cover: T.Texture; shade: T.Texture; print: T.Texture; toPrint: number[]; back: number[]; paper: number[]; lying: number[]; zone: number[][] | null; shoe: number[]; faceBack: boolean};
export function createFilmLayers(filmVP: T.Matrix4, light: Record<string, {value: unknown}>) {
  // One frame, grade and card key for both layers; the rendered cards (scene3d-deal.ts) read the same frame and grade.
  const map = {value: null as T.Texture | null}, grade = {value: new T.Vector3(1, 1, 1)}, quad = () => [0, 1, 2, 3].map(() => new T.Vector2());
  const frame = {frameOn: {value: 0}, frameScale: {value: 1}, frameAnchor: {value: new T.Vector2(FRAME_FIX.x, FRAME_FIX.y)}, frameSize: {value: new T.Vector2(FILM.width, FILM.height)}};
  let framed: FilmFrame | null = null, placed = {edgeZ: 0, fold: true, depth: false, scale: 1}; const hide = {value: new T.Vector4(0, 0, -1, -1)};
  const card = {cardOn: {value: 0}, cardRim: {value: 4}, cardSides: {value: 0}, cardTint: {value: 2}, cardTrust: {value: 0}, cardOverOn: {value: 0}, cardHeld: {value: 0}, cardDrawn: {value: quad()}, cardZone: {value: quad()}, cardCore: {value: quad()}, cardOver: {value: quad()}, cardColour: {value: new T.Vector3(1, 1, 0)}, cardShoe: {value: new T.Vector4(-1, -1, -1, -1)},
    seatOn: {value: 0}, seatZone: {value: quad()}, seatCore: {value: quad()}};
  const room = {roomMap: {value: null as T.Texture | null}, roomSize: {value: new T.Vector2(1, 1)}, roomExposure: {value: 1}};
  // the room's light on her (setRoomLight): its tint lies in grade with the calibration's; the sides have their own
  const side = {sideOn: {value: 0}, sideL: {value: new T.Vector3(1, 1, 1)}, sideR: {value: new T.Vector3(1, 1, 1)}}; let calibrated = [1, 1, 1], tint = [1, 1, 1];
  const putGrade = () => grade.value.set(calibrated[0] * tint[0], calibrated[1] * tint[1], calibrated[2] * tint[2]);
  const matte = {matteOn: {value: 0}, matteFaceBack: {value: 0}, matteZoneOn: {value: 0}, matteBox: {value: new T.Vector4(0, 0, -1, -1)}, matteShoe: {value: new T.Vector4(0, 0, -1, -1)}, matteLying: {value: new T.Vector2(1, 1)}, matteZone: {value: quad()},
    matteBack: {value: new T.Vector3()}, mattePaper: {value: new T.Vector3(1, 1, 1)}, matteToPrint: {value: new T.Matrix3()},
    matteCover: {value: null as T.Texture | null}, matteShade: {value: null as T.Texture | null}, mattePrint: {value: null as T.Texture | null}};
  const material = (refUv: T.Vector2) => new T.ShaderMaterial({vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, side: T.DoubleSide,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor,
    uniforms: {...light, ...card, ...matte, ...frame, ...room, ...side, wrap: {value: 0}, hide, map, filmVP: {value: filmVP}, refUv: {value: refUv}, lo: {value: 0.12}, hi: {value: 0.9}, shadow: {value: 1}, above: {value: 1}, erode: {value: 0.6}, grade, texel: {value: new T.Vector2(1.4 / FILM.width, 1.4 / FILM.height)}}});
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
    // The film's own card keyed away (a rendered card lies under the film there), or null: the film as it is.
    setCards(key: CardKey | null) {
      card.cardOn.value = key ? 1 : 0; if (!key) return;
      const put = (to: T.Vector2[], q: number[][]) => q.forEach((p, i) => to[i].set(p[0], p[1])), none = [[-9, -9], [-8, -9], [-8, -8], [-9, -8]]; // a quad off the frame
      put(card.cardZone.value, key.core ? key.zone : none); put(card.cardCore.value, key.core ?? none); card.cardColour.value.set(key.colour[0], key.colour[1], key.colour[2]); card.cardRim.value = key.rim; card.cardSides.value = key.sides; card.cardTint.value = key.tint; card.cardTrust.value = key.trust;
      card.cardHeld.value = key.drawn ? key.held ?? 0 : 0; if (key.drawn) put(card.cardDrawn.value, key.drawn);
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
    // A box of the film that is left undrawn (film pixels, y down: x0, y0, x1, y1), for a page that has an object of its own where
    // the film has one; null draws the whole film. Nothing in the game uses it yet: a hand that reaches into the box is cut too.
    setHide(box: number[] | null) { if (box) hide.value.set(box[0], box[1], box[2], box[3]); else hide.value.set(0, 0, -1, -1); },
    // The room as the scene has just drawn it (before its tone curve; `exposure` is what that pass multiplies it by) and how much
    // of it is laid round the dealer's outline, 0 = none. Only the upright layer takes it: behind the hands lies the felt, not the room.
    setWrap(texture: T.Texture | null, width: number, height: number, exposure: number, amount: number) { room.roomMap.value = texture; room.roomSize.value.set(width, height); room.roomExposure.value = exposure; bodyMat.uniforms.wrap.value = texture ? amount : 0; },
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
// touched it, so before that a spoken line plays muted like the rest instead of not playing at all.
export type Part = {path: string; start?: number; end?: number | null; rate?: number; track?: CardTrack | null; cards?: Partial<OverlayOptions> | null; frame?: FilmFrame | null; fps?: number; sound?: boolean};
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
export function createPlayers(onShow: (texture: T.Texture, path: string) => void, onChange: () => void) {
  let players: Player[] = [], current = 0, paused = false, gone = false;
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
  const make = (part: Part): Player => {
    const video = document.createElement('video'); video.muted = !(part.sound === true && globalThis.navigator?.userActivation?.hasBeenActive === true); video.playsInline = true; video.preload = 'auto'; video.src = part.path;
    const texture = new T.VideoTexture(video); texture.colorSpace = T.NoColorSpace; texture.minFilter = texture.magFilter = T.LinearFilter; texture.generateMipmaps = false;
    return {part, path: part.path, start: part.start ?? 0, end: part.end ?? null, fps: part.fps ?? FPS, video, texture};
  };
  // The part on screen is done: stop it where it is and bring in the next one on its first decoded frame.
  function advance(list: Player[], i: number) {
    if (gone || paused || list !== players || current !== i) return;
    const n = (i + 1) % list.length, next = list[n]; list[i].video.pause(); next.video.currentTime = startTime(next);
    const swap = () => { if (list === players) show(n); };
    if (next.video.requestVideoFrameCallback) frameCall(next.video, swap); else later(swap, 40);
    next.video.play().catch(() => {});
  }
  async function load(parts: Part[]) {
    if (gone) return;
    const queued = !!chain; closeQueue(); if (queued) players = [];
    for (const p of players) drop(p.video, p.texture);
    const list = players = loaded = parts.map(make);
    list.forEach((p, i) => {
      listen(p.video, 'ended', () => advance(list, i));
      if (p.end === null) return;
      const last = p.end - 1, reached = (seconds: number) => frameAtTime(seconds, p.fps) >= last;
      if (p.video.requestVideoFrameCallback) { const watch = (_now: number, frame: {mediaTime: number}) => { if (list !== players) return; if (reached(frame.mediaTime)) advance(list, i); frameCall(p.video, watch); }; frameCall(p.video, watch); }
      else listen(p.video, 'timeupdate', () => { if (reached(p.video.currentTime)) advance(list, i); });
    });
    // After dispose() neither listener is left, and the promise stays open: nothing waits on a queue that is gone.
    await Promise.all(list.map(p => new Promise<void>((resolve, reject) => { if (p.video.readyState >= 2) resolve(); else { listen(p.video, 'loadeddata', () => resolve(), true); listen(p.video, 'error', () => reject(Error(`Filmen kunde inte läsas: ${p.path}`)), true); } })));
    if (list !== players) return;
    list[0].video.currentTime = startTime(list[0]); show(0); if (!paused) list[0].video.play().catch(() => {});
  }
  async function seek(i: number, seconds: number) {
    if (gone) return;
    paused = true; players.forEach(p => p.video.pause()); const v = players[i].video;
    await new Promise<void>(resolve => { const done = () => { if (v.requestVideoFrameCallback) { const fallback = later(resolve, 250); frameCall(v, () => { clearTimeout(fallback); timers.delete(fallback); resolve(); }); } else later(resolve, 60); };
      if (Math.abs(v.currentTime - seconds) < 1e-4 && v.readyState >= 2) done(); else { listen(v, 'seeked', done, true); v.currentTime = seconds; } });
    if (gone) return;
    players[i].texture.needsUpdate = true; show(i);
  }

  // ---- a queue for a game: chains that follow each other without a blank frame -----------------------------------
  // Video elements are kept in a small pool by path, so a clip that comes back is not fetched again. A chain asked for
  // while a part is on screen starts when that part is done, because clips only fit together at their ends; `cut`
  // starts it as soon as its first frame is decoded. Either way the old frame stays up until the new one exists.
  // While a queue plays, `parts`, `count`, `seek` and `step` describe the one part on screen.
  type Media = {path: string; video: HTMLVideoElement; texture: T.VideoTexture; busy: boolean; used: number; hook: ((mediaTime: number | null) => void) | null; fail: (() => void) | null};
  type Chain = {parts: Part[]; media: (Media | undefined)[]; options: PlayOptions};
  const POOL = 8, LEAD_MS = 4, partStart = (part: Part) => ((part.start ?? 0) + 0.5) / (part.fps ?? FPS), frameOf = (seconds: number, part: Part) => frameAtTime(seconds, part.fps ?? FPS);
  let pool: Media[] = [], loaded: Player[] = [], used = 0, chain: Chain | null = null, waiting: Chain | null = null, entering: Chain | null = null, shown: Media | null = null, token = 0, held = false;
  function discard(m: Media) { pool = pool.filter(p => p !== m); m.hook = m.fail = null; drop(m.video, m.texture); }
  // An element for the path that nothing else is using; a new one if there is none. The pool is trimmed of the longest unused.
  function media(path: string): Media {
    const free = pool.find(m => m.path === path && !m.busy); if (free) { free.busy = true; free.used = ++used; return free; }
    const made = make({path}), m: Media = {path, video: made.video, texture: made.texture, busy: true, used: ++used, hook: null, fail: null}, v = m.video;
    listen(v, 'ended', () => m.hook?.(null)); listen(v, 'error', () => m.fail?.());
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
    const at = partStart(c.parts[i]); if (Math.abs(m.video.currentTime - at) > 1e-3) m.video.currentTime = at; return m;
  }
  // Brings part i of the chain on screen. `ended`: the part on screen is done and stops where it is; otherwise it runs on
  // until the new frame exists (and stops by itself if it gets to its end first).
  function enter(c: Chain, i: number, ended: boolean) {
    const my = ++token, part = c.parts[i], from = shown, onScreen = players[current], m = prime(c, i), v = m.video;
    if (entering && entering !== c && entering !== chain) forget(entering); entering = c;
    if (from) { if (ended) { from.video.pause(); from.hook = null; } else { const last = onScreen ? (onScreen.end ?? Math.max(1, Math.round(onScreen.video.duration * onScreen.fps))) - 1 : Infinity; from.hook = time => { if (time === null || frameAtTime(time, onScreen?.fps ?? FPS) >= last) from.video.pause(); }; } }
    const swap = () => {
      if (my !== token) return;
      const old = chain; shown = m; chain = c; entering = null; held = false; if (waiting === c) waiting = null;
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
    m.fail = () => { if (my === token) c.options.onError?.(Error(`Filmen kunde inte läsas: ${part.path}`)); };
    // A frame request that has waited long on a paused video is no longer polled by the browser, and the first frame after
    // play() then arrives a quarter of a second late with the frames in between dropped. A fresh request sets that right.
    if (v.requestVideoFrameCallback) frameCall(v, () => {});
    v.playbackRate = part.rate ?? 1; v.play().catch(() => {});
    // Waiting on its first frame already: shown at once, so the join costs no frame. Otherwise on the first frame it presents.
    if (v.readyState >= 2 && !v.seeking) { m.texture.needsUpdate = true; swap(); } else { m.hook = swap; if (!v.requestVideoFrameCallback) later(swap, 40); }
  }
  function finish(c: Chain, i: number) {
    if (waiting) return enter(waiting, 0, true);
    if (i + 1 < c.parts.length) return enter(c, i + 1, true);
    if (c.options.loop) return enter(c, 0, true);
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
    hurry(rate: number) { const v = players[current]?.video; if (v) v.playbackRate = rate; },
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
    // Source frame of the clip on screen, by the queue's one rule (frameAtTime): card tracks are indexed by it.
    frame() { const p = players[current]; return p ? frameAtTime(p.video.currentTime, p.fps) : 0; },
  };
}
