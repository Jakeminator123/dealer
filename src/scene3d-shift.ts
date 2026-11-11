// The change of room as an event: a shimmer builds over the room that is showing, the rooms change under it while it is at
// its height, and it dies away over the new room. Here are the parts that need no GPU: the course over time, and the shader
// text that draws the shimmer from three numbers (how strong it is, how far the rooms have changed, the time since it began).
// The scene (scene3d-view.ts) owns the render targets and the passes. The picture depends on those three numbers alone, so
// the same moment always looks the same.

export const SHIFT = {
  rise: 0.42,    // share of the course in which the shimmer builds over the outgoing room
  change: 0.62,  // progress at which only the new room is left; between `rise` and here the rooms change, at the shimmer's height
  patience: 6,   // seconds the course waits at its height for a room whose picture has not arrived, before it goes on without it
  spread: 0.6,   // how unevenly the rooms change over the picture: 0 = everywhere at once, a plain cross-fade
  bloom: 1.5,    // how unevenly the shimmer arrives: it begins behind the dealer and in soft patches, and ends everywhere
};
const MIN_SECONDS = 0.2; // a change is never shorter than this, whatever it is asked to be (a length that is no number counts as this too)
const lengthOf = (seconds: number) => seconds > MIN_SECONDS ? seconds : MIN_SECONDS;
const clamp01 = (v: number) => Math.max(0, Math.min(1, v)), smooth = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };

// How strong the shimmer is, 0 to 1, at a progress 0 to 1: it builds, stays at its height while the rooms change, dies away.
// It is seen from the first moment and settles into its height; it lingers on the way down and is gone at the end.
export function shimmerLevel(progress: number): number {
  const p = clamp01(progress);
  return p < SHIFT.rise ? 1 - (1 - p / SHIFT.rise) ** 2 : p <= SHIFT.change ? 1 : 1 - ((p - SHIFT.change) / (1 - SHIFT.change)) ** 2;
}
// How far the rooms have changed, 0 (the outgoing room) to 1 (the new one).
export function roomChange(progress: number): number { return clamp01((progress - SHIFT.rise) / (SHIFT.change - SHIFT.rise)); }

// Progress 0 to 1 from the time. `elapsed`: seconds since the change began. `seconds`: how long a change takes when nothing
// holds it up. `ready`: the second at which the new room's picture was there (0 = from the start, Infinity = not yet): the
// course does not go past its height before that, or before its patience ends. `lead`: the progress it began at.
export function shiftProgress(elapsed: number, seconds: number, ready = 0, lead = 0): number {
  const length = lengthOf(seconds), from = Math.min(Math.max(0, lead), SHIFT.rise), toHeight = (SHIFT.rise - from) * length, t = Math.max(0, elapsed);
  if (t <= toHeight) return Math.min(SHIFT.rise, from + t / length);
  if (ready <= toHeight) return Math.min(1, from + t / length);
  const release = Math.min(ready, toHeight + SHIFT.patience);
  return t < release ? SHIFT.rise : Math.min(1, SHIFT.rise + (t - release) / length);
}
// The `ready` to give shiftProgress, for a room whose picture was first there at second `seen` and has been drawn once by
// second `now`. A picture that came in time counts from when it came. One that came while the course was waiting at its
// height lets it go on from now: the frame that takes a large picture in is a long one, and the course must not leap over it.
export function readyFrom(seen: number, now: number, seconds: number, lead = 0): number {
  return seen > (SHIFT.rise - Math.min(Math.max(0, lead), SHIFT.rise)) * lengthOf(seconds) ? now : seen;
}
// A new change asked for during one: the progress to go back to. On the way up, and at the height, nothing has to be undone.
// On the way down, the point on the way up at which the shimmer is as strong as it is now, so its strength makes no jump.
export function retake(progress: number): number {
  const p = clamp01(progress); if (p <= SHIFT.change) return Math.min(p, SHIFT.rise);
  return SHIFT.rise * (1 - Math.sqrt(1 - shimmerLevel(p))); // the inverse of the rise
}

// The two rules the shader uses, here so that their ends can be tested. `cloud` is the soft pattern's value at a point, 0 to 1.
// How much of the new room shows at a point: nothing anywhere before the change, everything everywhere after it.
export function changedAt(change: number, cloud: number): number { return smooth(change * (1 + SHIFT.spread) - SHIFT.spread * cloud); }
// How strong the shimmer is at a point: nowhere at level 0, everywhere in full at level 1.
export function levelAt(level: number, cloud: number): number { return smooth(level * (1 + SHIFT.bloom) - SHIFT.bloom * cloud); }

const f = (v: number) => v.toFixed(3);
const NOISE = `float sHash(vec2 p){ vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float sNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(sHash(i), sHash(i + vec2(1., 0.)), f.x), mix(sHash(i + vec2(0., 1.)), sHash(i + 1.), f.x), f.y); }`;

// The half-size pass that lays the new room over the outgoing one. Each comes with its own brightness (`gainFrom`, `gainTo`),
// so the result is shown with exposure 1. The rooms change in soft clouds, not along a line and not everywhere at once.
// With change 0 it is a plain copy of `from` times its gain.
export const CHANGE_FRAGMENT = `varying vec2 vUv; uniform sampler2D from, to; uniform float gainFrom, gainTo, change, aspect;
${NOISE}
void main(){
  vec2 q = (vUv - .5) * vec2(aspect, 1.); float cloud = sNoise(q * 2.3 + 11.) * .65 + sNoise(q * 5.1 - 4.) * .35;
  float m = smoothstep(0., 1., change * ${f(1 + SHIFT.spread)} - ${f(SHIFT.spread)} * cloud);
  gl_FragColor = vec4(mix(texture2D(from, vUv).rgb * gainFrom, texture2D(to, vUv).rgb * gainTo, m), 1.);
}`;
export const CHANGE_UNIFORMS = ['from', 'to', 'gainFrom', 'gainTo', 'change', 'aspect'];

// The shimmer itself, for the pass that writes the room to the screen: a curtain of fine sequins between the dealer and the
// room. shimmerOver gives the light to add to the room (rgb, linear, before the picture's shoulder, so the brightest glints
// roll off to white the way lamps do) and how much of the room the curtain hides (a); `bent` is where to read the room,
// which wavers as through warm air. `shimmer`: strength 0-1. `glitter`: seconds since the change began. `pixels`: picture size.
//   three layers of sequins, each a grid with one sequin somewhere in every cell: fine ones, larger ones that flare, and
//   a few large soft discs, sequins out of focus, that give the curtain depth. A sequin flashes when its own turn comes round;
//   light travels over the curtain in soft folds (`band`) and the sequins in a fold flash brighter;
//   under them a warm glow with the same folds and a fine grain, so the height of the shimmer is a lit fabric, not a white sheet.
export const SHIMMER_GLSL = `uniform float shimmer, glitter; uniform vec2 pixels;
${NOISE}
// The curtain: sequins sewn in offset rows, one to a cell. Each turns at its own pace; the folds of the curtain (\`fold\`, a
// phase) make neighbours turn nearly together, so light runs along the folds. A sequin facing the light is bright gold and
// hides the room behind it; at the instant it faces it squarely it glints; one facing away is all but unseen, so that the
// curtain is glitter in the air and not a dotted screen over a bright room. rgb: its light. a: how much of the room it hides.
vec4 sSequins(vec2 px, float cell, float local, float fold, float sweep){
  vec2 g = px / cell; g.x += .5 * mod(floor(g.y), 2.);
  vec2 id = floor(g), at = fract(g) - .5;
  float r1 = sHash(id), r2 = sHash(id + 19.7), r3 = sHash(id + 41.3), r4 = sHash(id + 73.9);
  float on = smoothstep(r2 * .8, r2 * .8 + .2, local); // the curtain comes sequin by sequin as the shimmer grows
  float size = .3 + .15 * r1, disc = smoothstep(size, size - 1.3 / cell, length(at + (vec2(r3, r4) - .5) * .2)) * on;
  float turn = sin(fold + r4 * 2.6 + .7 * sin(glitter * (3. + 5. * r3) + r1 * 6.2832)), facing = smoothstep(-.4, 1., turn);
  float body = .04 + .95 * facing * facing, glint = pow(max(turn, 0.), 48.) * (.3 + .7 * sweep) * 7.;
  vec3 tint = mix(vec3(1., .36, .05), vec3(1., .58, .16), r1);
  tint = mix(tint, mix(vec3(1., .25, .3), vec3(.3, .65, 1.), step(.5, r2)), step(.86, r4) * .6); // one in seven is rose or ice blue
  return vec4((tint * body + vec3(1., .82, .5) * glint) * disc, disc * facing * facing * .85);
}
// Stars: the few glints strong enough to flare, a bright core with four thin rays. One to a large cell, kept inside it.
vec3 sStars(vec2 px, float cell, float unit, float local, float sweep){
  vec2 g = px / cell, id = floor(g) + 57., at = fract(g) - .5;
  float r1 = sHash(id), r2 = sHash(id + 19.7), r3 = sHash(id + 41.3), r4 = sHash(id + 73.9);
  vec2 d = abs(at - (vec2(r1, r2) - .5) * .36) * cell / unit; // pixels from the star's middle, at the reference picture size
  float flash = pow(max(sin(glitter * (3. + 3. * r3) + r4 * 6.2832), 0.), 10.) * smoothstep(r2 * .8, r2 * .8 + .2, local) * (.3 + .7 * sweep);
  float reach = cell / unit * .3, core = exp(-dot(d, d) / 5.);
  float rays = exp(-d.y * d.y / 1.2) * pow(max(1. - d.x / reach, 0.), 3.) + exp(-d.x * d.x / 1.2) * pow(max(1. - d.y / reach, 0.), 3.);
  return mix(vec3(1., .9, .7), vec3(1.), r3) * ((core * 7. + rays * 3.) * flash);
}
// Sequins out of focus, nearer the eye: a few large soft discs that glow and fade slowly. They give the curtain depth.
vec3 sDiscs(vec2 px, float cell, float local){
  vec2 g = px / cell, id = floor(g) + 113., at = fract(g) - .5;
  float r1 = sHash(id), r2 = sHash(id + 19.7), r3 = sHash(id + 41.3), r4 = sHash(id + 73.9);
  float size = .2 + .14 * r3, far = length(at - (vec2(r1, r2) - .5) * (.9 - 2. * size));
  float disc = smoothstep(size, size - .12, far) * (.65 + .35 * smoothstep(size * .45, size, far)); // a little brighter toward the rim, as a lens draws them
  float glow = pow(max(sin(glitter * (1.2 + 1.6 * r3) + r4 * 6.2832), 0.), 3.) * smoothstep(r2 * .8, r2 * .8 + .2, local);
  return mix(vec3(1., .45, .08), vec3(1., .7, .3), r1) * (disc * glow);
}
vec4 shimmerOver(vec2 uv, out vec2 bent){
  bent = uv; if (shimmer <= 0.) return vec4(0.);
  vec2 px = uv * pixels, q = (uv - .5) * vec2(pixels.x / pixels.y, 1.); float unit = max(.7, sqrt(pixels.x * pixels.y) / 1439.);
  float arrive = mix(sNoise(q * 1.9 + 3.), clamp(length(q * vec2(.75, 1.) - vec2(0., .08)) / .85, 0., 1.), .45);
  float local = smoothstep(0., 1., shimmer * ${f(1 + SHIFT.bloom)} - ${f(SHIFT.bloom)} * arrive);
  float fold = q.x * 13. + 1.1 * sin(q.y * 2.3 + glitter * .7) + .6 * sin(q.y * 5.1 - glitter * 1.1 + q.x * 3.) + 3. * sNoise(q * 2.6 + 5.) - glitter * 3.4;
  float crest = .5 + .5 * sin(fold); crest *= crest;
  float sweep = .5 + .5 * sin(q.x * 2.4 - glitter * 2.6 + .8 * sin(q.y * 1.7)); sweep *= sweep;
  vec2 waver = vec2(sNoise(q * 8. + vec2(0., glitter * 1.7)), sNoise(q * 8. + vec2(31., -glitter * 1.5))) - .5;
  bent = uv + waver * local * vec2(pixels.y / pixels.x, 1.) * .014;
  vec4 curtain = sSequins(px, 8. * unit, local, fold, sweep);
  vec3 light = curtain.rgb + sStars(px, 64. * unit, unit, local, sweep) + sDiscs(px, 86. * unit, local) * .4;
  light += vec3(1., .5, .12) * (local * local * crest * .14); // the light on the folds also lies in the air between the sequins
  return vec4(light, 1. - (1. - curtain.a) * (1. - .4 * local * local)); // the room also dims a little behind the curtain, as a stage does, so the glitter carries over a bright room too
}`;
export const SHIMMER_UNIFORMS = ['shimmer', 'glitter', 'pixels'];
