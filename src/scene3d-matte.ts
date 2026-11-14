// Rendered cards, the third way (cardMethod 'matte', a lab trial, off from the start): the film's own card is the matte. Every
// pixel of the film's card colour is replaced and nothing else, so the card's edge is the film's edge (it cannot shake against
// the film), and fingers stay in front because they are not card-coloured: no hand mask, no margin, no easing to the plan's size
// while the card is in the film. The back (yellow) is the film's card recoloured to the back print's colour with the film's own
// shading; the face (blue) is the face print laid by the track's quad for that frame, shaded the same way, and whatever of the
// blue lies outside the quad takes the face's border colour. Shown on film frames by dealer-bf's trial (kortprov.py, Prov
// kort-matt-ur-filmen) before it was a shader. Here are the parts that need no GPU: the colour rules, the passes as shader text,
// where they run, which quad lays the print, and CPU mirrors of the arithmetic for the tests (tools/scene3d-matte.test.ts). The
// passes run in src/scene3d-deal.ts, which owns the targets; the replacement itself is in the film's shader (src/scene3d-film.ts).
import {clockwise, grown, morph, signedArea, type Pt} from './card-track.ts';
import {turnOf, type CardTrack} from './card-overlay.ts';
import {FILM, squareToQuad} from './scene3d-geometry.ts';
import {inv3} from './scene-geometry.ts';

export const MATTE = {
  thin: 2,       // the card's body: what is thinner than 2·thin + 1 px (a glint on the shoe window's gold frame) is no card
  keep: 2,       // ... and the body's own outline is kept to within this of what is left after that
  near: 24,      // a shadowed or darker card pixel counts only this close to the card's own lit colour (P1's seated card in the shoe: 23 px)
  rim: 2,        // the film card's pale rim, outside its colour, covered this far (px)
  shoeRim: 1,    // ... but in the shoe window only one pixel: there the card lies behind the gold frame, which stays
  shoeRoom: 10,  // the shoe window box grown by this for that rule
  fringe: 15,    // card colour blurred into the felt (a card moving fast) is unmixed this far beside the body
  beside: 6,     // ... and this close beside it, what stays in front (a finger's edge over the card) loses the card's tint (P4 frame 40: 5-6 px)
  off: [0.12, 0.22] as const, // a pixel is card and screen mixed, in any light, when it lies this close to the plane of their colours (scene3d-film.ts keyCard's measure)
  share: 0.1,    // ... and holds at least this much of the card's lit colour (less is invisible, and the black sleeve lies near the plane too)
  sigma: {back: 1.2, face: 2.5}, // the film's shading blurred this much (px): the face's blue has little luminance, so its noise would show
  back: [0.25, 1.2] as const, face: [0.5, 1.1] as const, // the shading's range on the back and on the face
  reach: 48, spread: 0.6, // where the passes run: the track's card grown by at least `reach` px or `spread` of its longest side ...
  around: 2,     // ... over the frames this close, so a fast card's smear is inside; and the shoe window with `shoeRoom` more
  print: 1.8,    // the print's quad: the track's colour core grown this much at the corners, out to the card's pale edge (EDGE_PX in scene3d-deal.ts)
  contrast: 2,   // the film's light on its back, to this power on the recoloured back
  edge: [0.45, 0.95] as const, edgeLight: 0.16, edgeShare: 0.25, // the back's edge: where the body's blurred weight falls from 0.95 to 0.45, lighter (linear) by this share
};
// The film card's colours lit, as the video shows them (scene3d-deal.ts COLOUR, scene3d-film.ts BACK_LIT/FACE_LIT): the far end of
// the line a blurred pixel is unmixed along.
export const LIT = {BACK: [0.91, 0.82, 0.02], FRONT: [0, 0.475, 0.89]};
// The shoe window as every film shows it (the shoe is part of the plate; pamela-p4-c1-plan-deal-02's track): film pixels x0, y0, x1, y1.
export const SHOE_BOX = [1242, 754, 1339, 855];

// The colour rules, video values 0-255. Written once in the subset JavaScript and GLSL share (numbers with a point, min, && and
// ||), so the shader and the tests read the same text: the tests compile it and hold the strict rules to the tracker's own
// (src/card-track.ts `is`). back/face: the tracker's yellow and blue. shade: its yellow back in finger shadow. dimBack/dimFace:
// the same colours below the tracker's brightness (a finger's shadow on the card); those two and shade count only near the card's
// own colour, so the shoe's tan frame, a knuckle or a dark sleeve are not taken for card. pale: the face as some films wash it out
// (light lavender instead of blue: Paow at seat 1, paow-giv-2-1-p1-06-01 frames 74-81, mean 192-215/193-219/239-246); it counts only
// inside the zone where the card was in the frames before (paleZone) and only while the track shows the face. Skin is red-led, her
// blouse cream, so neither passes; across every tracked Paow take it fires nowhere else (dealer-scratch, huvudagent11/kort2/scan/palecheck.mjs).
// In the turn (card-overlay.ts turnOf) the film's card is a blur of its two sides, the felt's screen and the jacket behind it, and
// inside the turn's zone (turnZone) these count too: paleBack, the back washed light (248/241/112 at seat 7, paow-giv-2-1-p7-06-01);
// turnBack, the back washed dull and light (178/159/91 at seat 4, paow-giv-2-1-p4-04-01 frame 45): more green to red than skin has, and
// further from grey than skin, her cream top, her hair or skin blurred into the screen at the hand's edge (blue at least 0.6 of
// red and green there); turnFace, the face blurred with the screen into teal (14/98/104 to 51/101/106,
// the same take's frames 50-52), blue at least green, which the screen never is. The grey of the card's edge over the jacket (about
// 90/85/87) is left as the film has it: a card's edge turning fast looks so. Neither turn rule counts within 3 px of skin (hand: red
// over green, as a hand is in light and shadow) or in the shoe window: skin blurred into the screen at a finger's edge, and the
// window's gold frame, have the dull back's colours too.
export const RULES = {
  back: 'r > 95. && g > 95. && g > .82 * r && r > .6 * g && b < .45 * min(r, g)',
  face: 'b > 90. && b > 1.5 * r && b > 1.15 * g',
  shade: 'r > 95. && g > .45 * r && g <= .82 * r && b < .12 * r',
  dimBack: 'r > 40. && g > 40. && g > .7 * r && g < 1.15 * r && b < .35 * min(r, g)',
  dimFace: 'b > 40. && b > 1.4 * r && b > 1.1 * g',
  pale: 'r > 150. && g > 150. && b > 200. && b > r + 15. && b > g + 12. && b - min(r, g) < 80.',
  paleBack: 'r > 200. && g > 195. && b > 60. && b < 160. && r - g < 25. && g - r < 25. && g - b > 70.',
  turnBack: 'r > 140. && g > .78 * r && g < 1.12 * r && b < .58 * min(r, g)',
  turnFace: 'b > 60. && b > 1.25 * r && b > .95 * g && g > .5 * b',
  hand: 'r > 80. && g < .76 * r && g > .45 * r && b > .4 * g',
} as const;
const rule = (name: keyof typeof RULES) => `bool ${name}Of(float r, float g, float b){ return ${RULES[name]}; }`;
/** The rules as GLSL functions, and the four classes of a pixel: (back candidate, face candidate, back, face). */
export const CLASS_GLSL = `${Object.keys(RULES).map(k => rule(k as keyof typeof RULES)).join('\n')}
vec4 cardClasses(vec3 c){ float r = c.r, g = c.g, b = c.b; bool y = backOf(r, g, b), f = faceOf(r, g, b);
  return vec4(y || shadeOf(r, g, b) || dimBackOf(r, g, b) ? 1. : 0., f || dimFaceOf(r, g, b) ? 1. : 0., y ? 1. : 0., f ? 1. : 0.); }`;

// ---- the passes, in film pixels (src/scene3d-deal.ts runs them on film-sized targets, the frame's own size) -----------------
// Every target is laid like the video texture: u to the right, v up, so a target and the film are read at the same uv.
export const PASS_VERTEX = 'void main(){ gl_Position = vec4(position.xy, 0., 1.); }';
/** The film frame's classes (cardClasses), read straight off the video; inside the zone a washed-out face is face too (paleOn 1), and in the turn the turn's colours of the back (paleOn 3, its first half) or of the face (4, the rest). */
export const CLASSIFY_FRAGMENT = `uniform sampler2D map; uniform vec2 size, paleZone[4]; uniform vec4 shoeBox; uniform float paleOn;
${CLASS_GLSL}
bool inZone(vec2 p){ for (int i = 0; i < 4; i++) { vec2 a = paleZone[i], b = paleZone[i == 3 ? 0 : i + 1]; if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < 0.) return false; } return true; }
bool handNear(vec2 uv){ for (int k = 0; k < 8; k++) { float a = float(k) * .785398; vec3 s = texture2D(map, uv + 3. * vec2(cos(a), sin(a)) / size).rgb * 255.; if (handOf(s.r, s.g, s.b)) return true; } return false; }
void main(){ vec2 uv = gl_FragCoord.xy / size, p = vec2(gl_FragCoord.x - .5, size.y - gl_FragCoord.y - .5); vec3 c = texture2D(map, uv).rgb * 255.; vec4 o = cardClasses(c);
  if (paleOn > .5 && inZone(p)) {
    bool turn = paleOn > 2.5 && !(p.x >= shoeBox.x && p.y >= shoeBox.y && p.x <= shoeBox.z && p.y <= shoeBox.w) && !handNear(uv);
    if (paleOn < 1.5 || paleOn > 3.5) { if (paleOf(c.r, c.g, c.b) || turn && turnFaceOf(c.r, c.g, c.b)) o.yw = vec2(1.); }
    else if (turn && (paleBackOf(c.r, c.g, c.b) || turnBackOf(c.r, c.g, c.b))) o.xz = vec2(1.); }
  gl_FragColor = o; }`;
// One direction of a square erosion (grow 0) or dilation (grow 1), per channel with a radius of its own (0 passes it through).
// Inside the shoe window (`shoe`, film pixels, y down) the first two channels take `shoeRadius` at most. `combine` (the last pass of
// the body): the card's body is its candidates (`base`, the classes) where the opened mask reaches and the card's own colour is
// near; written as (back, face, either, either), for the dilations that follow: the cover of each side, and how near either is.
const REACH = Math.max(MATTE.fringe, MATTE.near, MATTE.thin + MATTE.keep, MATTE.beside);
export const MORPH_FRAGMENT = `uniform sampler2D map, base; uniform vec2 size, dir; uniform vec4 radius, grow, shoe; uniform float shoeRadius, combine;
void main(){
  vec2 uv = gl_FragCoord.xy / size, px = vec2(gl_FragCoord.x - .5, size.y - gl_FragCoord.y - .5); vec4 r = radius;
  if (shoeRadius >= 0. && px.x >= shoe.x && px.y >= shoe.y && px.x <= shoe.z && px.y <= shoe.w) r.xy = min(r.xy, vec2(shoeRadius));
  float most = max(max(r.x, r.y), max(r.z, r.w)); vec4 lo = vec4(1.), hi = vec4(0.);
  for (int i = -${REACH}; i <= ${REACH}; i++) { float d = abs(float(i)); if (d > most) continue;
    vec4 s = texture2D(map, uv + dir * float(i) / size), on = step(vec4(d), r); lo = min(lo, mix(vec4(1.), s, on)); hi = max(hi, s * on); }
  vec4 o = mix(lo, hi, grow);
  if (combine > .5) { vec4 a = texture2D(base, uv); vec2 body = step(.5, o.xy) * step(.5, a.xy) * step(.5, o.zw); o = vec4(body, vec2(max(body.x, body.y))); }
  gl_FragColor = o;
}`;
// The film's shading over the card's body only (a normalised blur: a finger or the felt beside the card does not lighten or darken
// its edge): sums of weight × body × luminance and of weight × body, for the back (x, y) and the face (z, w), each with its own
// blur. The first direction reads the body and the video; the second the first one's sums.
const SHADE_REACH = Math.ceil(3 * Math.max(MATTE.sigma.back, MATTE.sigma.face));
export const SHADE_FRAGMENT = `uniform sampler2D map, film; uniform vec2 size, dir, sigma; uniform float first;
void main(){
  vec2 uv = gl_FragCoord.xy / size; vec4 sum = vec4(0.); vec2 total = vec2(0.);
  for (int i = -${SHADE_REACH}; i <= ${SHADE_REACH}; i++) { vec2 at = uv + dir * float(i) / size, w = exp(-float(i * i) / (2. * sigma * sigma)) * step(abs(float(i)), ceil(3. * sigma));
    vec4 s = texture2D(map, at); if (first > .5) { float l = dot(texture2D(film, at).rgb, vec3(.2126, .7152, .0722)); s = vec4(s.x * l, s.x, s.y * l, s.y); }
    sum += s * vec4(w.x, w.x, w.y, w.y); total += w; }
  gl_FragColor = sum / vec4(total.x, total.x, total.y, total.y);
}`;

// ---- the film's light across a drawn card (src/scene3d-deal.ts, way 'scene') ----------------------------------------------
// The drawn card as a whole takes the film card's brightness (scene3d-deal.ts vShade: the lighter half of the film's card against
// the card lying flat). Across it, it takes how the film's light falls over the film's card: a plane fitted to the brightness of
// the film's card (a + b·x + c·y in film pixels), so the drawn card is darker on the side where the film's card is darker (toward
// her hand, away from the lamp) and keeps its own mean. A plane and not the film pixel under each drawn pixel: the film's card is
// nearly flat in colour, and read pixel by pixel its small differences against the card's mean made seams wherever the reading
// had to stop (at the film card's blurred edge, beside her fingers, beyond the film's card, which is smaller than the drawn card in
// the hand): a lighter frame round the card and a halo round her fingers (Prov kort-en-linje, step 2b, the first try). The
// finger's own shadow on the card is the film key's (scene3d-film.ts keyCard keeps it as a shadow over the drawn card).
// The samples: a PLANE.grid × PLANE.grid grid over the film's card from PLANE.inset to 1 - inset of its quad, those of the card's
// own colour (as cardBase takes them: fingers, felt and jacket do not count) and not darker than PLANE.dark of their mean (a
// finger's shadow, which the key keeps). With fewer than PLANE.least of them, or no spread to fit a slope to, the card is flat.
// The plane's value against its mean is held to PLANE.range, and taken to PLANE.gamma: the paper is lit in linear light, the
// film's values are not (10 % darker on screen is about 20 % less light).
export const PLANE = {grid: 7, inset: 0.2, dark: 0.6, least: 12, range: [0.8, 1.15] as const, gamma: 2.2};
/** lightPlane(map, q, ref): the plane of the film card's brightness over quad q (texture order) as (mean x, mean y, slope x, slope y) and its mean (w of a second return through `mean`); planeLight(plane, mean, px): the factor on the drawn card's light at film pixel px. Needs scene3d-film.ts CARD_GLSL. */
export const PLANE_GLSL = `vec4 lightPlane(sampler2D map, vec2 q[4], vec3 ref, out float mean){
  vec3 dir = normalize(ref), w = vec3(.2126, .7152, .0722); float n = 0., m = 0.;
  for (int j = 0; j < ${PLANE.grid}; j++) for (int i = 0; i < ${PLANE.grid}; i++) { vec2 st = vec2(${PLANE.inset.toFixed(2)}) + vec2(float(i), float(j)) * ${((1 - 2 * PLANE.inset) / (PLANE.grid - 1)).toFixed(5)};
    vec3 s = filmAt(map, mix(mix(q[0], q[1], st.x), mix(q[3], q[2], st.x), st.y)); if (length(s) > .12 && dot(normalize(s), dir) > .96) { m += dot(s, w); n += 1.; } }
  m /= max(n, 1.); n = 0.; float sx = 0., sy = 0., sl = 0., sxx = 0., sxy = 0., syy = 0., sxl = 0., syl = 0.;
  for (int j = 0; j < ${PLANE.grid}; j++) for (int i = 0; i < ${PLANE.grid}; i++) { vec2 st = vec2(${PLANE.inset.toFixed(2)}) + vec2(float(i), float(j)) * ${((1 - 2 * PLANE.inset) / (PLANE.grid - 1)).toFixed(5)};
    vec2 p = mix(mix(q[0], q[1], st.x), mix(q[3], q[2], st.x), st.y); vec3 s = filmAt(map, p); float l = dot(s, w);
    if (length(s) > .12 && dot(normalize(s), dir) > .96 && l >= ${PLANE.dark.toFixed(2)} * m) { n += 1.; sx += p.x; sy += p.y; sl += l; sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y; sxl += p.x * l; syl += p.y * l; } }
  mean = 0.; if (n < ${PLANE.least}.) return vec4(0.);
  float mx = sx / n, my = sy / n, ml = sl / n, cxx = sxx / n - mx * mx, cxy = sxy / n - mx * my, cyy = syy / n - my * my, cxl = sxl / n - mx * ml, cyl = syl / n - my * ml, det = cxx * cyy - cxy * cxy;
  mean = ml; if (det < 1e-3 * max(cxx * cyy, 1e-6) || det <= 0.) return vec4(mx, my, 0., 0.);
  return vec4(mx, my, (cyy * cxl - cxy * cyl) / det, (cxx * cyl - cxy * cxl) / det);
}
float planeLight(vec4 plane, float mean, vec2 px){
  if (mean <= 0.) return 1.;
  return pow(clamp(1. + (plane.z * (px.x - plane.x) + plane.w * (px.y - plane.y)) / mean, ${PLANE.range[0].toFixed(2)}, ${PLANE.range[1].toFixed(2)}), ${PLANE.gamma.toFixed(1)});
}`;
/** lightPlane and planeLight in the shader, on the CPU for the tests: film(x, y) the video's colour (0-1) at a film pixel, q the film's card (texture order), ref its lit colour; the factor at film pixel px. */
export function planeLight(film: (x: number, y: number) => number[], q: number[][], ref: number[], px: number[]): number {
  const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], len = (c: number[]) => Math.hypot(c[0], c[1], c[2]), dir = ref.map(v => v / len(ref));
  const step = (1 - 2 * PLANE.inset) / (PLANE.grid - 1), samples: {p: number[]; s: number[]}[] = [];
  for (let j = 0; j < PLANE.grid; j++) for (let i = 0; i < PLANE.grid; i++) { const u = PLANE.inset + i * step, v = PLANE.inset + j * step, at = (k: number) => (q[0][k] + (q[1][k] - q[0][k]) * u) * (1 - v) + (q[3][k] + (q[2][k] - q[3][k]) * u) * v;
    const p = [at(0), at(1)], s = film(p[0], p[1]); if (len(s) > 0.12 && (s[0] * dir[0] + s[1] * dir[1] + s[2] * dir[2]) / len(s) > 0.96) samples.push({p, s}); }
  const m = samples.reduce((a, x) => a + lum(x.s), 0) / Math.max(samples.length, 1), kept = samples.filter(x => lum(x.s) >= PLANE.dark * m), n = kept.length;
  if (n < PLANE.least) return 1;
  const mean = (f: (x: {p: number[]; s: number[]}) => number) => kept.reduce((a, x) => a + f(x), 0) / n;
  const mx = mean(x => x.p[0]), my = mean(x => x.p[1]), ml = mean(x => lum(x.s)), cxx = mean(x => x.p[0] ** 2) - mx * mx, cxy = mean(x => x.p[0] * x.p[1]) - mx * my, cyy = mean(x => x.p[1] ** 2) - my * my;
  const cxl = mean(x => x.p[0] * lum(x.s)) - mx * ml, cyl = mean(x => x.p[1] * lum(x.s)) - my * ml, det = cxx * cyy - cxy * cxy;
  const [b, c] = det < 1e-3 * Math.max(cxx * cyy, 1e-6) || det <= 0 ? [0, 0] : [(cyy * cxl - cxy * cyl) / det, (cxx * cyl - cxy * cxl) / det];
  return Math.min(PLANE.range[1], Math.max(PLANE.range[0], 1 + (b * (px[0] - mx) + c * (px[1] - my)) / ml)) ** PLANE.gamma;
}

// ---- the replacement, in the film's shader (src/scene3d-film.ts) ---------------------------------------------------------
// o: the keyed film pixel (premultiplied, graded), c: its video colour, key: the screen colour, tone: the grade and the fan's shade
// it was given. The body and its covered rim become the card, solid (the trial's composite: the film's pale rim is painted over,
// as it would be by a card with the film's outline); a pixel of card colour blurred into the felt (on the line between the card's
// lit colour and the screen's) becomes the card's colour at the coverage the key gave it; and right beside the body, what stays in
// front (a finger's edge mixed with the card) loses the card's tint, as scene3d-film.ts keyCard does, except in the shoe window,
// whose gold frame keeps its colour.
export const MATTE_GLSL = `uniform float matteOn, matteFaceBack, matteZoneOn, matteSeatOn; uniform vec4 matteBox, matteShoe; uniform vec2 matteLying, matteZone[4], matteSeatQ[4]; uniform vec3 matteBack, mattePaper, matteSeat;
uniform sampler2D matteCover, matteShade, mattePrint; uniform mat3 matteToPrint;
vec3 matteSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, 0.), vec3(1. / 2.4)) - .055, step(.0031308, c)); }
// a pixel c as the card's colour k and the screen's t, each in any light (c ≈ a·k + b·t, least squares), and how far it lies off
// the plane of the two against its own brightness: 0 for card, screen and their mixes, large for skin (as keyCard measures it)
vec3 matteUnmix(vec3 c, vec3 k, vec3 t){ float kk = dot(k, k), kt = dot(k, t), tt = dot(t, t), kc = dot(k, c), tc = dot(t, c), det = max(kk * tt - kt * kt, 1e-6);
  float a = (tt * kc - kt * tc) / det, b = (kk * tc - kt * kc) / det; return vec3(a, b, length(c - a * k - b * t) / (length(c) + .04)); }
vec4 matteCard(vec4 o, vec2 px, vec3 c, vec3 key, vec3 tone){
  vec2 pc = px - .5; // pixel centres at whole numbers, as the track counts them
  if (pc.x < matteBox.x || pc.y < matteBox.y || pc.x > matteBox.z || pc.y > matteBox.w) return o;
  vec2 uv = vec2(px.x / FILM_PX.x, 1. - px.y / FILM_PX.y), h = .5 / FILM_PX;
  // the cover softened over about a pixel: four bilinear reads half a pixel off the centre, a 3 × 3 tent
  vec4 cover = .25 * (texture2D(matteCover, uv + h) + texture2D(matteCover, uv - h) + texture2D(matteCover, uv + vec2(h.x, -h.y)) + texture2D(matteCover, uv + vec2(-h.x, h.y)));
  vec4 sh = texture2D(matteShade, uv);
  // the film's light on its own card here, against the card lying flat in the film's light (scene3d-deal.ts LYING)
  float shadeB = sh.y > .02 ? clamp(sh.x / sh.y / matteLying.x, ${MATTE.back[0]}, ${MATTE.back[1]}) : 1., shadeF = sh.w > .02 ? clamp(sh.z / sh.w / matteLying.y, ${MATTE.face[0]}, ${MATTE.face[1]}) : 1.;
  // the back: its dark colour in the film's own light on its card, the light's differences made stronger (a dark card shows them
  // less than the bright yellow it stands for, and flat it reads as a hole), and its edge, where the body's blur falls off, lighter,
  // as a card's paper edge is
  float edgeB = (1. - smoothstep(${MATTE.edge[0].toFixed(2)}, ${MATTE.edge[1].toFixed(2)}, sh.y)) * step(.02, sh.y);
  // the card seated in the shoe window keeps the window's own colour (matteSeat) while a carried card takes another: the window stays as dark as in every film
  vec3 field = mix(matteBack, matteSeat, matteSeatOn * smoothstep(-3., 3., quadIn(px, matteSeatQ)));
  vec3 back = mix(field * pow(shadeB, ${MATTE.contrast.toFixed(1)}), vec3(${MATTE.edgeLight.toFixed(3)}), edgeB * ${MATTE.edgeShare.toFixed(2)}) * mattePaper, st = matteToPrint * vec3(pc, 1.);
  vec3 face = (matteFaceBack > .5 ? field : texture2D(mattePrint, vec2(st.x / st.z, 1. - st.y / st.z)).rgb) * mattePaper * shadeF;
  float solid = max(cover.x, cover.y);
  vec3 card = matteSrgb((cover.x * back + cover.y * face) / max(cover.x + cover.y, 1e-4)) * tone;
  // blurred card over the felt, near the body or inside the track's zone of the card (not in the shoe window, whose frame and
  // dark inside are no mix of card and screen): the nearer of the two colours' planes
  bool shoe = pc.x >= matteShoe.x && pc.y >= matteShoe.y && pc.x <= matteShoe.z && pc.y <= matteShoe.w;
  float zone = shoe ? 0. : max(step(.5, cover.w), matteZoneOn * step(0., quadIn(px, matteZone))), fringe = 0.; vec3 tint = card;
  if (zone > 0. && solid < 1.) {
    vec3 ub = matteUnmix(c, ${vec(LIT.BACK)}, key), uf = matteUnmix(c, ${vec(LIT.FRONT)}, key); bool isBack = ub.z <= uf.z; vec3 u = isBack ? ub : uf;
    fringe = step(${MATTE.share.toFixed(2)}, u.x) * step(-.05, u.y) * (1. - smoothstep(${MATTE.off[0].toFixed(2)}, ${MATTE.off[1].toFixed(2)}, u.z));
    tint = matteSrgb(isBack ? back : face) * tone;
  }
  if (fringe > solid) return vec4(mix(o.rgb, tint * o.a, fringe), o.a);
  if (!shoe && cover.z > 0.) o.b = mix(o.b, clamp(o.b, .8 * o.g, o.g), cover.z * (1. - solid)); // skin keeps blue at 0.8 to 1 of green; the card's yellow has none, its face more
  return mix(o, vec4(card, 1.), solid);
}`;
function vec(v: number[]) { return `vec3(${v.map(x => x.toFixed(4)).join(', ')})`; }

// ---- where the passes run, and which quad lays the print ----------------------------------------------------------------
type Frame = {frame: number; side: string; quad?: number[][] | null; edge?: number[][] | null; film?: number[][] | null};
export type MatteTrack = {frames: Frame[]; shoeWindow?: {box: number[]} | null} | null;
const clampBox = (b: number[]) => [Math.max(0, Math.floor(b[0])), Math.max(0, Math.floor(b[1])), Math.min(FILM.width - 1, Math.ceil(b[2])), Math.min(FILM.height - 1, Math.ceil(b[3]))];
/**
 * The film pixels the matte is made in for a frame (x0, y0, x1, y1, y down, whole pixels): the shoe window, and the card where the
 * track has it over the frames around this one, grown generously. The box only bounds the work and keeps a yellow speck far off
 * (on a knuckle at the other end of the frame) from being taken for card; the card's outline is the film's, not the track's.
 */
export function matteBox(track: MatteTrack, frame: number, shoe: number[] = track?.shoeWindow?.box ?? SHOE_BOX): number[] {
  let [x0, y0, x1, y1] = [shoe[0] - MATTE.shoeRoom, shoe[1] - MATTE.shoeRoom, shoe[2] + MATTE.shoeRoom, shoe[3] + MATTE.shoeRoom];
  for (let d = -MATTE.around; d <= MATTE.around; d++) {
    const f = track?.frames?.[frame + d], p = f?.film?.length === 4 ? f.film : f?.quad?.length === 4 ? f.quad : f?.edge?.length === 2 ? f.edge : null; if (!p) continue;
    const xs = p.map(q => q[0]), ys = p.map(q => q[1]), a = Math.min(...xs), b = Math.min(...ys), c = Math.max(...xs), e = Math.max(...ys);
    const r = Math.max(MATTE.reach, MATTE.spread * Math.max(c - a, e - b));
    x0 = Math.min(x0, a - r); y0 = Math.min(y0, b - r); x1 = Math.max(x1, c + r); y1 = Math.max(y1, e + r);
  }
  return clampBox([x0, y0, x1, y1]);
}
/**
 * Where a washed-out face may be taken for the card in a frame (RULES.pale), or null: only while the track shows the face, and only
 * where the card was over this frame and the four before it (the box around their quads or edge lines, grown by 24 px and 0.15 of
 * its size), clockwise on screen. The card hardly moves while the film washes its face out, and the track keeps its last shape there.
 */
export function paleZone(track: MatteTrack, frame: number): number[][] | null {
  if (track?.frames?.[frame]?.side !== 'FRONT') return null;
  const points: number[][] = []; for (let k = frame - 4; k <= frame; k++) { const f = track.frames[k]; points.push(...(f?.quad?.length === 4 ? f.quad : f?.edge?.length === 2 ? f.edge : [])); }
  if (!points.length) return null;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]), box: Pt[] = [{x: Math.min(...xs), y: Math.min(...ys)}, {x: Math.max(...xs), y: Math.min(...ys)}, {x: Math.max(...xs), y: Math.max(...ys)}, {x: Math.min(...xs), y: Math.max(...ys)}];
  return grown(box, 24 + 0.15 * Math.sqrt(Math.abs(signedArea(box)))).map(p => [p.x, p.y]);
}
/**
 * Where the turn's colours count in a frame of the turn (turnOf), or null outside it: the box around the card over the whole turn,
 * from the last back before it to the first face after it (their quads, and the edge lines between, which may lie anywhere across
 * the card), grown by 24 px and 0.15 of its size, clockwise on screen; and which side's colours: the back's over the first half,
 * the face's over the rest. Each side's alone, because the other's rule would take the hand's edge there (seat 4, frames 51-52:
 * skin over the dark sleeve, olive as the dull back), and the film shows that side then anyway.
 */
export function turnZone(track: MatteTrack, frame: number): {zone: number[][]; back: boolean} | null {
  const turn = track ? turnOf(track as unknown as CardTrack) : null; if (!turn || frame < turn.from || frame > turn.to) return null;
  const points: number[][] = []; for (let k = turn.from - 1; k <= turn.to + 1; k++) { const f = track!.frames[k]; points.push(...(f?.quad?.length === 4 ? f.quad : f?.edge?.length === 2 ? f.edge : [])); }
  if (!points.length) return null;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]), box: Pt[] = [{x: Math.min(...xs), y: Math.min(...ys)}, {x: Math.max(...xs), y: Math.min(...ys)}, {x: Math.max(...xs), y: Math.max(...ys)}, {x: Math.min(...xs), y: Math.max(...ys)}];
  return {zone: grown(box, 24 + 0.15 * Math.sqrt(Math.abs(signedArea(box)))).map(p => [p.x, p.y]), back: frame <= (turn.from + turn.to) / 2};
}
/** The track's card in a frame as the zone where blurred card colour is unmixed (card-overlay.ts filmZone's reach), or null. */
export function matteZone(track: MatteTrack, frame: number): number[][] | null {
  const f = track?.frames?.[frame], q = f?.film?.length === 4 ? f.film : f?.quad?.length === 4 ? f.quad : null; if (!q) return null;
  const c = clockwise(q.map(([x, y]) => ({x, y}))); return grown(c, 10 + 0.12 * Math.sqrt(Math.abs(signedArea(c)))).map(p => [p.x, p.y]);
}
/**
 * The quad the face print is laid by in a frame, in texture order, or null when the track does not show the face there: the film's
 * own card (`film` where a track draws its card elsewhere, else `quad`), or the frame of `print` (another file with the same frames,
 * such as the trial's line-fitted quads, card-track-matt.json) when it has one. Grown out to the card's pale edge, and turned to
 * face the eye when the quad runs the other way round (as scene3d-deal.ts pts does), so the print never shows mirrored.
 */
export function printQuad(track: MatteTrack, frame: number, print?: Frame[] | null): number[][] | null {
  const own = track?.frames?.[frame], alt = print?.find(f => f.frame === frame);
  const q = alt?.side === 'FRONT' && alt.quad?.length === 4 ? alt.quad : own?.side === 'FRONT' ? (own.film?.length === 4 ? own.film : own.quad?.length === 4 ? own.quad : null) : null;
  if (!q) return null;
  const p: Pt[] = q.map(([x, y]) => ({x, y})), facing = signedArea(p) < 0 ? [p[1], p[0], p[3], p[2]] : p;
  return grown(facing, MATTE.print).map(v => [v.x, v.y]);
}
/** Film pixel → print coordinates (u right, v down the print, 0 to 1 over the quad): row-major 3 × 3, the inverse of squareToQuad. Null quad: every pixel off the print, where it reads the print's border. */
export function toPrint(quad: number[][] | null): number[] {
  if (!quad) return [0, 0, -1, 0, 0, -1, 0, 0, 1];
  try { return inv3(squareToQuad(quad) as [number, number, number, number, number, number, number, number, number]); } catch { return [0, 0, -1, 0, 0, -1, 0, 0, 1]; }
}
/** The mean colour of a picture (RGBA bytes, sRGB) in linear light: the back print as one colour. */
export function meanLinear(rgba: ArrayLike<number>): [number, number, number] {
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }, sum = [0, 0, 0]; let n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) { if (rgba[i + 3] < 128) continue; sum[0] += lin(rgba[i]); sum[1] += lin(rgba[i + 1]); sum[2] += lin(rgba[i + 2]); n++; }
  return n ? [sum[0] / n, sum[1] / n, sum[2] / n] : [0, 0, 0];
}

// ---- CPU mirrors of the arithmetic, for the tests -------------------------------------------------------------------------
/** The card's body as the passes make it: candidates (1/0) where the opened mask reaches and the strict colour is near. */
export function bodyOf(candidate: Uint8Array, strict: Uint8Array, w: number, h: number): Uint8Array {
  const reach = morph(morph(candidate, w, h, MATTE.thin, false), w, h, MATTE.thin + MATTE.keep, true), near = morph(strict, w, h, MATTE.near, true), out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = candidate[i] & reach[i] & near[i];
  return out;
}
/** matteUnmix in the shader: c as card·k + screen·t (least squares, 0-1 colours), and how far c lies off their plane against its brightness. */
export function unmix(c: number[], k: number[], t: number[]): {card: number; screen: number; off: number} {
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0), kk = dot(k, k), kt = dot(k, t), tt = dot(t, t), kc = dot(k, c), tc = dot(t, c), det = Math.max(kk * tt - kt * kt, 1e-6);
  const card = (tt * kc - kt * tc) / det, screen = (kk * tc - kt * kc) / det;
  return {card, screen, off: Math.hypot(...c.map((v, i) => v - card * k[i] - screen * t[i])) / (Math.hypot(...c) + 0.04)};
}

// ---- "pålägg": the film's own back, yellow, becomes the dark back in the film's own pixels (a lab trial, off: card-overlay.ts BACK) ---
// Not a matte and not a drawn card: every pixel where the film's card can be (the track's zone of the frame and the shoe window's
// seated card, nothing else, so skin, her jacket's edge and the shoe's gold frame are left alone) is split into the card's yellow, the
// screen's green and white (the card washed out light in a blurred frame), three colours that span every colour; a pixel is the card's
// as far as those shares are a card's: some yellow, no screen taken away (or, with little blue, the yellow's orange shade under a
// finger), no white taken away and not much more white than yellow (her cream blouse has five times as much), and not skin. The card's
// part becomes the dark back in the pixel's own light, and the screen's part stays screen, for the key. So the film's shape, blur and
// fingers stay as they are, with no morphology and no quad (the opening and erosion of the matte gave its edges bites). Beside surely
// card a looser rule takes the film card's pale rim and the blend of its edge with the screen; where the card is blurred over a finger,
// the pixel is split into the card, skin and white instead, and only the card's part goes dark. Prototyped on the film's own frames
// before it was a shader (Prov kort-palagg): a fixed yellow with white beside it held where a two-colour split with the frame's own
// yellow left a pale card yellow-green (seat 7 frame 26) and the turn olive (the dealer's first card, frame 140).
export const DARK_BACK = {
  card: [0.91, 0.82, 0.02], finger: [0.96, 0.64, 0.52], // the film card's yellow back lit, and skin in the film's light
  share: 0.15,                                // a pixel is card from this share of the card's colour in it
  screen: [-0.11, -0.06] as const,            // ... with no more screen than this taken away (the washed card takes 0.05 away, the shoe's
                                              // gold and her hair 0.11 to 0.14) ...
  shade: [-0.5, -0.4] as const, blue: [0.25, 0.38] as const, // ... or, with little blue (blue at most blue[0] of green), its orange shade
                                              // (its blue a quarter of green or less; the darker gold 0.43)
  noise: [0.04, 0.12] as const,               // a screen share under this inside the card is the video's noise, and goes with the card
  green: 0.15,                                // ... and a screen share stays screen only as far as the pixel is green as the key reads it (green over
                                              // red and blue against the screen's): the yellow's drift toward green is the card's
  white: [-0.12, -0.05] as const, pale: [1.8, 3.2] as const, // white: not taken away (the yellow's own lack of blue reads as a little), and at most pale times the card's share
  skinRed: [0.08, 0.16] as const, skinBlue: [0.45, 0.6] as const, // skin: red over green by this much and blue at least this of green
  near: [1.5, 3] as const, rim: [-0.4, -0.25] as const, rimPale: [3.5, 5] as const, // within near px of surely card: its rim, looser
  tolerance: 0.06, fingerWhite: [-0.5, -0.3] as const, // the card blurred with a finger: card, skin and white, none taken away beyond this; white
                                              // more: a fingertip's edge on the card is warmer than the skin colour (the dealer's films: 250/157/58 takes 0.3 away)
  shoeRoom: 10, skinNear: 4,                  // ... and not in the shoe window or this close to it, and only within skinNear px of skin: the
                                              // shoe's gold frame and trim have that blend's colours
  blurredSkin: {red: [0.06, 0.12] as const, blue: [0.3, 0.42] as const, reach: [3, 6] as const, shoeFar: 40}, // ... or, shoeFar px or more from
                                              // the shoe window, within reach px of skin blurred with the card (her hand at a fast card's end)
  bright: 1.15,                               // the dark back's light at most this many times its light lying flat
  // The dark back in the film's values, lit as the film's card lying flat: the drawn back's black field as the scene shows it (Prov
  // kort-palagg, measured at the hole card's cut into its turn film: the drawn back's darker half 55/43/26 on screen), so that the
  // film's card and the drawn card are one colour there.
  field: [0.224, 0.177, 0.108],
};
const v3 = (v: number[]) => `vec3(${v.map(x => x.toFixed(4)).join(', ')})`, f = (x: number) => x.toFixed(4);
// The film card's face, blue, as plain paper in the film's own pixels (the restart's second step, "pålägg: framsidan"; a lab trial, off:
// card-overlay.ts FACE), the same way as the back: the face's blue, the screen and white split every pixel, and the card's part
// becomes paper in the pixel's own light. The blue has about half the yellow's brightness (lying flat 0.44 against 0.835), so the light
// is taken against that and smoothed over the pixels round it (the doubling would show the video's noise); the face washed out to
// lilac (seat 1) has five times as much white as blue, which the back's rule would have left. No print: the drawn card's print comes
// in with the hand-over at rest (restFade).
export const PAPER_FACE = {
  card: [0, 0.475, 0.89],                     // the film card's blue face lit (scene3d-deal.ts COLOUR.FRONT)
  pale: [6, 10] as const,                     // white at most pale times the blue: the lilac face (seat 1, 205/206/243) has about 5
  screen: [-0.2, -0.14] as const,             // ... and screen taken away: the lilac's 0.11 to 0.13 (the face has no red, so a lilac tint reads so);
                                              // at 0.26 her fingertips on the lilac card went white
  red: [0.03, 0.07] as const,                 // ... but with red no more than this over green: her pale nails are pink (the face and its lilac are not)
  dim: [0.12, 0.2] as const,                  // a pixel darker than this (luminance) is no face: her dark jacket has some blue too
  lying: 0.44,                                // its luminance lying flat in the film's light (scene3d-deal.ts LYING.FRONT)
  smooth: 1.5,                                // the light read as the mean of the pixel and four this far round it
  bright: 1,                                  // its light at most that of lying flat: the paper is no whiter than paper (lilac at 1.95)
  response: 0.4,                              // ... and the light to this power: the film's blue swings from 0.68 to 1.95 of lying flat between
                                              // frames (seat 1, 60-80), and the takes lie at 0.9 to 0.97 of it (seat 4, the hole card's turn), a pulse
                                              // from grey to white on paper: at 0.75 the lying paper was grey beside the drawn card; at 0.4, with the
                                              // field below, it lies as the drawn face does at the hand-over in both
  finger: false,                              // no split with skin: on the face skin and white are the same light colours, and the finger's
                                              // blend with the blue went white (paper for the white share) under her fingertips
  // Plain paper in the film's values, lit as the card lying flat: the drawn face's paper as the scene shows it (225/222/216 on screen at
  // seats 4 and 7, the hole card's turn 231/227/219; Prov kort-palagg), so that the paper and the drawn face are one colour when the
  // print comes in at rest.
  field: [0.916, 0.902, 0.877],
};
type Side = {card: number[]; pale: readonly [number, number]; rimPale: readonly [number, number]; screen: readonly [number, number]; dim: readonly [number, number] | null; red: readonly [number, number] | null; shade: boolean; bright: number; response: number; finger: boolean};
const SIDES: Record<'back' | 'face', Side> = {back: {card: DARK_BACK.card, pale: DARK_BACK.pale, rimPale: DARK_BACK.rimPale, screen: DARK_BACK.screen, dim: null, red: null, shade: true, bright: DARK_BACK.bright, response: 1, finger: true}, face: {card: PAPER_FACE.card, pale: PAPER_FACE.pale, rimPale: [10, 14], screen: PAPER_FACE.screen, dim: PAPER_FACE.dim, red: PAPER_FACE.red, shade: false, bright: PAPER_FACE.bright, response: PAPER_FACE.response, finger: PAPER_FACE.finger}};
// One side of the film's card (the back, or the face) in the shader: `${name}Side(c, px, key, zone, shoe, field, lying, w)` gives the
// pixel with the side's colour taken as the card and `w`, how far it was.
const sideGlsl = (name: 'back' | 'face', S: Side) => { const D = DARK_BACK, C = `${name.toUpperCase()}_CARD`;
  return `const vec3 ${C} = ${v3(S.card)};
float ${name}CardOf(vec3 c, mat3 toCard, out vec3 u){
  u = toCard * c; float low = ${S.shade ? `1. - smoothstep(${f(D.blue[0])}, ${f(D.blue[1])}, c.b / max(c.g, .01))` : '0.'};
  float screen = max(smoothstep(${f(S.screen[0])}, ${f(S.screen[1])}, u.y), low * smoothstep(${f(D.shade[0])}, ${f(D.shade[1])}, u.y));
  float white = smoothstep(${f(D.white[0])}, ${f(D.white[1])}, u.z) * (1. - smoothstep(${f(S.pale[0])}, ${f(S.pale[1])}, u.z / max(u.x, 1e-3)));
  return smoothstep(0., ${f(D.share)}, u.x) * screen * white * (1. - backSkin(c))${S.dim ? ` * smoothstep(${f(S.dim[0])}, ${f(S.dim[1])}, dot(c, BACK_LUMA))` : ''}${S.red ? ` * (1. - smoothstep(${f(S.red[0])}, ${f(S.red[1])}, c.r - c.g))` : ''};
}
float ${name}RimOf(vec3 c, vec3 u){ return smoothstep(0., ${f(D.share)}, u.x) * smoothstep(${f(D.rim[0])}, ${f(D.rim[1])}, u.y) * (1. - smoothstep(${f(S.rimPale[0])}, ${f(S.rimPale[1])}, u.z / max(u.x, 1e-3))) * (1. - backSkin(c)); }
float ${name}FingerOf(vec3 c, mat3 toFinger, out vec3 v){
  v = toFinger * c;
  return smoothstep(0., ${f(D.share)}, v.x) * smoothstep(-${f(D.tolerance)}, 0., v.y) * smoothstep(${f(D.fingerWhite[0])}, ${f(D.fingerWhite[1])}, v.z) * (1. - smoothstep(${f(S.pale[0])}, ${f(S.pale[1])}, v.z / max(v.x, 1e-3)));
}
vec3 ${name}Side(vec3 c, vec2 px, vec3 key, float zone, float shoe, vec3 field, float lying, out float w){
  mat3 toCard = inverse(mat3(${C}, key, vec3(1.))), toFinger = inverse(mat3(${C}, BACK_FINGER, vec3(1.)));
  vec3 u, v, t; float w1 = ${name}CardOf(c, toCard, u), w2 = ${S.finger ? `${name}FingerOf(c, toFinger, v) * (1. - shoe) * (1. - backUnder)` : '0.'};${S.finger ? '' : ' v = vec3(0.);'}
  if (w2 > 0.) { float skin = 0., far = 1. - step(backShoe.x - ${f(D.blurredSkin.shoeFar)}, px.x) * step(px.x, backShoe.z + ${f(D.blurredSkin.shoeFar)}) * step(backShoe.y - ${f(D.blurredSkin.shoeFar)}, px.y) * step(px.y, backShoe.w + ${f(D.blurredSkin.shoeFar)});
    for (int k = 0; k < 8; k++) { float a = float(k) * .7854; vec2 d = vec2(cos(a), sin(a)); skin = max(skin, backSkin(filmAt(map, px + ${f(D.skinNear)} * d)));
      if (far > .5) for (int j = 0; j < 2; j++) { vec3 s = filmAt(map, px + (j == 0 ? ${f(D.blurredSkin.reach[0])} : ${f(D.blurredSkin.reach[1])}) * d); skin = max(skin, smoothstep(${f(D.blurredSkin.red[0])}, ${f(D.blurredSkin.red[1])}, s.r - s.g) * smoothstep(${f(D.blurredSkin.blue[0])}, ${f(D.blurredSkin.blue[1])}, s.b / max(s.g, .01))); } }
    w2 *= smoothstep(.3, .7, skin); }
  // the film card's pale rim and its edge blended with the screen, beside surely card
  float rim = ${name}RimOf(c, u);
  if (w1 < .7 && rim > 0.) { float near = 0.;
    for (int k = 0; k < 16; k++) { float a = float(k) * .7854 + (k < 8 ? 0. : .3927); if (${name}CardOf(filmAt(map, px + (k < 8 ? ${f(D.near[0])} : ${f(D.near[1])}) * vec2(cos(a), sin(a))), toCard, t) > .7) { near = 1.; break; } }
    w1 = max(w1, near * rim); }
  // the video's blocks where the card is blurred over a finger: there the card's weight is the mean of the 3 x 3 pixels round it, so
  // the two splits do not lie side by side in dots (seat 4, frame 43)
  if (w2 > 0. && shoe < .5) { float sum = w1, blur = w2 * (1. - w1);
    for (int k = 0; k < 8; k++) { vec3 s = filmAt(map, px + BACK_AROUND[k]);
      float n1 = ${name}CardOf(s, toCard, t), n2 = ${name}FingerOf(s, toFinger, t); sum += n1; blur = max(blur, n2 * (1. - n1)); }
    if (blur > .3) w1 = sum / 9.; }
${name === 'face' ? `  if (backUnder > .5) w1 *= smoothstep(.4, .7, u.x); // beneath the drawn card a blue rim blended into the felt reads as felt: only a solid share goes paper
` : ''}  w2 *= (1. - w1); w1 *= zone; w2 *= zone; w = w1 + w2; if (w <= 0.) return c;
  float green = (c.g - max(c.r, c.b)) / max(key.g - max(key.r, key.b), .05), screen = max(u.y, 0.) * smoothstep(${f(D.noise[0])}, ${f(D.noise[1])}, u.y) * smoothstep(0., ${f(D.green)}, green);
  float l = dot(c - screen * key, BACK_LUMA);${name === 'face' ? `
  // the face's light, a doubling of the blue's: read as the mean of the pixel and four round it, so the video's noise is not doubled too
  for (int k = 0; k < 4; k++) { vec2 d = ${f(PAPER_FACE.smooth)} * vec2(k == 0 ? 1. : k == 1 ? -1. : 0., k == 2 ? 1. : k == 3 ? -1. : 0.); vec3 s = filmAt(map, px + d); vec3 us = toCard * s; l += us.x > .3 ? dot(s - max(us.y, 0.) * smoothstep(${f(D.noise[0])}, ${f(D.noise[1])}, us.y) * key, BACK_LUMA) : dot(c - screen * key, BACK_LUMA); }
  l /= 5.;` : ''}
  vec3 card = field * ${S.response === 1 ? `clamp(l / lying, 0., ${f(S.bright)})` : `min(pow(max(l / lying, 0.), ${f(S.response)}), ${f(S.bright)})`} + screen * key;
${name === 'back' ? `  // beneath the drawn card the card blurred into skin goes as the key takes it off fingers, de-yellowed, not dark (a dark stain on her hand)
  if (backUnder > .5) { float near = 0.; for (int k = 0; k < 16; k++) { float a = float(k) * .7854 + (k < 8 ? 0. : .3927); near = max(near, backSkin(filmAt(map, px + (k < 8 ? 3. : 6.) * vec2(cos(a), sin(a))))); }
    card = mix(card, vec3(c.r, c.g, max(c.b, .8 * c.g)), near); }
` : ''}  vec3 part = max(v.x, 0.) * ${C} + vec3(max(v.z, 0.)), finger = clamp(c - part + field * ${S.response === 1 ? `clamp(dot(part, BACK_LUMA) / lying, 0., ${f(S.bright)})` : `min(pow(max(dot(part, BACK_LUMA) / lying, 0.), ${f(S.response)}), ${f(S.bright)})`}, 0., 1.);
  return c * (1. - w1 - w2) + w1 * card + w2 * finger;
}`; };
/** filmCard(c, px, key): the film pixel c at film pixel px (y down) with the film card's back dark (backOn) and its face paper (faceOn); needs scene3d-film.ts CARD_GLSL (quadIn, filmAt) and the film shader's map and colour evening (evenOn, even, evenGain, evenLift). */
export const FILM_CARD_GLSL = `uniform float backOn, faceOn, backLying, faceLying, backUnder; uniform vec2 backZone[4], backSeat[4]; uniform vec4 backShoe; uniform vec3 backFieldLit, faceFieldLit;
const vec3 BACK_FINGER = ${v3(DARK_BACK.finger)}, BACK_LUMA = vec3(.2126, .7152, .0722);
const vec2 BACK_AROUND[8] = vec2[8](vec2(-1., -1.), vec2(0., -1.), vec2(1., -1.), vec2(-1., 0.), vec2(1., 0.), vec2(-1., 1.), vec2(0., 1.), vec2(1., 1.));
float backSkin(vec3 c){ return smoothstep(${f(DARK_BACK.skinRed[0])}, ${f(DARK_BACK.skinRed[1])}, c.r - c.g) * smoothstep(${f(DARK_BACK.skinBlue[0])}, ${f(DARK_BACK.skinBlue[1])}, c.b / max(c.g, .01)); }
${sideGlsl('back', SIDES.back)}
${sideGlsl('face', SIDES.face)}
// the film's colour evening comes after this and would move the card's colours with the film: they are laid in that much the other way
vec3 beforeEven(vec3 lit){ return evenOn > .5 ? max(inverse(even) * ((lit - evenLift) / max(evenGain, vec3(.05))), 0.) : lit; } // (a solid pixel's lift)
vec3 filmCard(vec3 c, vec2 px, vec3 key){
  float zone = max(smoothstep(-2., 2., quadIn(px, backZone)), smoothstep(-1., 1., quadIn(px, backSeat))); if (zone <= 0.) return c;
  float shoe = step(backShoe.x - ${f(DARK_BACK.shoeRoom)}, px.x) * step(px.x, backShoe.z + ${f(DARK_BACK.shoeRoom)}) * step(backShoe.y - ${f(DARK_BACK.shoeRoom)}, px.y) * step(px.y, backShoe.w + ${f(DARK_BACK.shoeRoom)});
  if (backUnder > .5 && shoe > .5) return c; // beneath the drawn card the shoe window is the matte's
  float wb = 0., wf = 0.; vec3 b = c, f = c;
  if (backOn > .5) b = backSide(c, px, key, zone, shoe, beforeEven(backFieldLit), backLying, wb);
  if (faceOn > .5) f = faceSide(c, px, key, zone, shoe, beforeEven(faceFieldLit), faceLying, wf);
  return wf > wb ? f : b;
}`;
const solve3 = (cols: number[][], c: number[]): number[] => {
  const [a, b, d] = cols, det = (p: number[], q: number[], r: number[]) => p[0] * (q[1] * r[2] - q[2] * r[1]) - q[0] * (p[1] * r[2] - p[2] * r[1]) + r[0] * (p[1] * q[2] - p[2] * q[1]), D = det(a, b, d);
  return Math.abs(D) < 1e-12 ? [0, 0, 0] : [det(c, b, d) / D, det(a, c, d) / D, det(a, b, c) / D];
};
const step = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lumaOf = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
/**
 * darkBack in the shader for one pixel, for the tests: c the film's colour and key the screen's (0-1), shoe whether it lies in the shoe
 * window or within DARK_BACK.shoeRoom of it, skin how much skin lies within DARK_BACK.skinNear of it (0 to 1), rim whether surely card lies within DARK_BACK.near of it. The neighbourhood's mean over a blurred finger is left out. card
 * and finger: how far the pixel is taken as the card and as the card blurred with a finger; colour: what the film then shows.
 */
export function darkBackOf(c: number[], key: number[], o: {shoe?: boolean; skin?: number; rim?: boolean; field?: number[]; lying?: number; side?: 'back' | 'face'} = {}): {card: number; finger: number; colour: number[]} {
  const D = {...DARK_BACK, ...(o.side === 'face' ? {card: PAPER_FACE.card, pale: PAPER_FACE.pale, rimPale: SIDES.face.rimPale, screen: PAPER_FACE.screen, bright: PAPER_FACE.bright} : {})}, dimOk = o.side === 'face' ? step(PAPER_FACE.dim[0], PAPER_FACE.dim[1], lumaOf(c)) * (1 - step(PAPER_FACE.red[0], PAPER_FACE.red[1], c[0] - c[1])) : 1, response = o.side === 'face' ? PAPER_FACE.response : 1, field = o.field ?? (o.side === 'face' ? PAPER_FACE.field : DARK_BACK.field), lying = o.lying ?? (o.side === 'face' ? PAPER_FACE.lying : 0.835), shade = o.side !== 'face', skin = step(D.skinRed[0], D.skinRed[1], c[0] - c[1]) * step(D.skinBlue[0], D.skinBlue[1], c[2] / Math.max(c[1], 0.01));
  const cardOf = (u: number[]) => { const low = shade ? 1 - step(D.blue[0], D.blue[1], c[2] / Math.max(c[1], 0.01)) : 0;
    return step(0, D.share, u[0]) * Math.max(step(D.screen[0], D.screen[1], u[1]), low * step(D.shade[0], D.shade[1], u[1])) * step(D.white[0], D.white[1], u[2]) * (1 - step(D.pale[0], D.pale[1], u[2] / Math.max(u[0], 1e-3))) * (1 - skin) * dimOk; };
  const u = solve3([D.card, key, [1, 1, 1]], c), v = solve3([D.card, D.finger, [1, 1, 1]], c);
  let w1 = cardOf(u); if (o.rim && w1 < 0.7) w1 = Math.max(w1, step(0, D.share, u[0]) * step(D.rim[0], D.rim[1], u[1]) * (1 - step(D.rimPale[0], D.rimPale[1], u[2] / Math.max(u[0], 1e-3))) * (1 - skin));
  const w2 = o.shoe || o.side === 'face' ? 0 : step(0.3, 0.7, o.skin ?? 0) * step(0, D.share, v[0]) * step(-D.tolerance, 0, v[1]) * step(D.fingerWhite[0], D.fingerWhite[1], v[2]) * (1 - step(D.pale[0], D.pale[1], v[2] / Math.max(v[0], 1e-3))) * (1 - w1);
  const green = (c[1] - Math.max(c[0], c[2])) / Math.max(key[1] - Math.max(key[0], key[2]), 0.05), screen = Math.max(u[1], 0) * step(D.noise[0], D.noise[1], u[1]) * step(0, D.green, green), light = Math.min(D.bright, Math.max(0, lumaOf(c.map((x, i) => x - screen * key[i])) / lying) ** response), card = field.map((x, i) => x * light + screen * key[i]);
  const part = D.card.map(x => Math.max(v[0], 0) * x + Math.max(v[2], 0)), dim = Math.min(D.bright, Math.max(0, lumaOf(part) / lying) ** response), finger = c.map((x, i) => Math.min(1, Math.max(0, x - part[i] + field[i] * dim)));
  return {card: w1, finger: w2, colour: c.map((x, i) => x * (1 - w1 - w2) + w1 * card[i] + w2 * finger[i])};
}
/**
 * Where the film's card can be in a frame, for the dark back (clockwise on screen, film pixels, y down), or null: the box round the
 * track's card (its film quad, quad or edge line) over this frame, the four before it and the two after it, grown by 16 px. Not the
 * frame's own quad: a card slides on under her fingertips while its track already rests (the hole card's deal, frames 56-57: its
 * yellow strip lay outside), and a card turning fast has no shape in the track for frames.
 */
export const BACK_ZONE = {before: 4, after: 2, grow: 16};
export function backZone(track: MatteTrack, frame: number): number[][] | null {
  const points: number[][] = []; for (let k = frame - BACK_ZONE.before; k <= frame + BACK_ZONE.after; k++) { const g = track?.frames?.[k]; points.push(...(g?.film?.length === 4 ? g.film : g?.quad?.length === 4 ? g.quad : g?.edge?.length === 2 ? g.edge : [])); }
  if (!points.length) return null;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]), r = BACK_ZONE.grow;
  return [[Math.min(...xs) - r, Math.min(...ys) - r], [Math.max(...xs) + r, Math.min(...ys) - r], [Math.max(...xs) + r, Math.max(...ys) + r], [Math.min(...xs) - r, Math.max(...ys) + r]];
}
