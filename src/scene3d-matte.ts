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
  edge: [0.45, 0.95] as const, edgeLight: 0.16, edgeShare: 0.6, // the back's edge: where the body's blurred weight falls from 0.95 to 0.45, lighter (linear) by this share
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

// ---- the replacement, in the film's shader (src/scene3d-film.ts) ---------------------------------------------------------
// o: the keyed film pixel (premultiplied, graded), c: its video colour, key: the screen colour, tone: the grade and the fan's shade
// it was given. The body and its covered rim become the card, solid (the trial's composite: the film's pale rim is painted over,
// as it would be by a card with the film's outline); a pixel of card colour blurred into the felt (on the line between the card's
// lit colour and the screen's) becomes the card's colour at the coverage the key gave it; and right beside the body, what stays in
// front (a finger's edge mixed with the card) loses the card's tint, as scene3d-film.ts keyCard does, except in the shoe window,
// whose gold frame keeps its colour.
export const MATTE_GLSL = `uniform float matteOn, matteFaceBack, matteZoneOn; uniform vec4 matteBox, matteShoe; uniform vec2 matteLying, matteZone[4]; uniform vec3 matteBack, mattePaper;
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
  vec3 back = mix(matteBack * pow(shadeB, ${MATTE.contrast.toFixed(1)}), vec3(${MATTE.edgeLight.toFixed(3)}), edgeB * ${MATTE.edgeShare.toFixed(2)}) * mattePaper, st = matteToPrint * vec3(pc, 1.);
  vec3 face = (matteFaceBack > .5 ? matteBack : texture2D(mattePrint, vec2(st.x / st.z, 1. - st.y / st.z)).rgb) * mattePaper * shadeF;
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
