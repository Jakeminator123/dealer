// The Pamela film inside the 3D scene: keyed in the shader and projected from the film camera onto two
// surfaces, a vertical plane standing on the dealer-side table edge and the table top. Seen from the film
// camera's own position this is the film pixel for pixel, whatever the camera figures are; turning the view
// about that position stays exact, moving it is an approximation.
import * as T from 'three';
import {FILM} from './scene3d-geometry.ts';
import {FAN_GLSL} from './scene3d-light.ts';

const VERTEX = `varying vec4 vFilm; varying vec3 vWorld; uniform mat4 filmVP;
void main(){ vec4 w = modelMatrix * vec4(position, 1.); vWorld = w.xyz; vFilm = filmVP * w; gl_Position = projectionMatrix * viewMatrix * w; }`;
// Output is premultiplied and sRGB-encoded, like the video. The screen colour is read from the frame itself
// because it drifts between and inside clips. A screen pixel that is only darker than that reference comes
// out as black with partial alpha, which is how hand and shoe shadows on the green table survive the key.
const FRAGMENT = `varying vec4 vFilm; varying vec3 vWorld; uniform sampler2D map; uniform vec2 refUv, texel; uniform float lo, hi, shadow, erode;
${FAN_GLSL}
float screenAt(vec2 uv, vec3 key, float dk){ vec3 c = texture2D(map, uv).rgb; return clamp(((c.g - max(c.r, c.b)) / dk - lo) / (hi - lo), 0., 1.); }
void main(){
  if (vFilm.w <= 0.) discard;
  vec2 uv = vFilm.xy / vFilm.w * .5 + .5;
  if (uv.x < .001 || uv.x > .999 || uv.y < .001 || uv.y > .999) discard;
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
  float isShadow = (1. - smoothstep(.03, .12, tone)) * (1. - smoothstep(.7, .95, a));
  a *= mix(1., shadow, isShadow);
  if (a < .004) discard;
  gl_FragColor = vec4(pm * fanShade(vWorld), a);
}`;

export type KeySettings = {lo: number; hi: number; shadow: number};
export function createFilmLayers(filmVP: T.Matrix4, light: Record<string, {value: unknown}>) {
  const material = (refUv: T.Vector2) => new T.ShaderMaterial({vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false, side: T.DoubleSide,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcAlphaFactor, blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor,
    uniforms: {...light, map: {value: null}, filmVP: {value: filmVP}, refUv: {value: refUv}, lo: {value: 0.12}, hi: {value: 0.9}, shadow: {value: 1}, erode: {value: 0.6}, texel: {value: new T.Vector2(1.4 / FILM.width, 1.4 / FILM.height)}}});
  // The screen reference is read in a corner that stays empty: top left for the backdrop, bottom left for the table.
  const bodyMat = material(new T.Vector2(0.02, 0.97)), tableMat = material(new T.Vector2(0.02, 0.03));
  const body = new T.Mesh(new T.PlaneGeometry(10, 3), bodyMat), table = new T.Mesh(new T.PlaneGeometry(10, 2).rotateX(-Math.PI / 2), tableMat);
  body.renderOrder = 5; table.renderOrder = 6;
  return {
    body, table,
    setTexture(texture: T.Texture) { bodyMat.uniforms.map.value = tableMat.uniforms.map.value = texture; },
    setKey(key: KeySettings) { bodyMat.uniforms.lo.value = key.lo; bodyMat.uniforms.hi.value = key.hi - 0.08; tableMat.uniforms.lo.value = key.lo; tableMat.uniforms.hi.value = key.hi; tableMat.uniforms.shadow.value = key.shadow; },
    // Folded: the plane stands on the table edge and the table layer carries hands, cards and shadows.
    // Unfolded: one plane carries the whole frame and nothing follows the felt when the camera moves.
    // `depth` makes the layers write depth, which the focus blur reads; the unfolded plane then passes the depth test always instead of skipping it.
    place(edgeZ: number, fold: boolean, depth = false) { table.visible = fold; table.position.set(0, 0.0015, edgeZ + 1); body.position.set(0, fold ? 1.5 : 0.5, edgeZ); body.scale.y = fold ? 1 : 5 / 3;
      bodyMat.depthTest = fold || depth; bodyMat.depthFunc = fold ? T.LessEqualDepth : T.AlwaysDepth; bodyMat.depthWrite = tableMat.depthWrite = depth; },
  };
}

// One piece of film: source frames start … end − 1 of a clip. end null = to the clip's last frame.
// A deal followed by a return that was generated from one of the deal's own frames must stop at that frame
// (src/clip-graph.ts resolveRound gives the range); played to its end, the hand lifts and then jumps back.
export type Part = {path: string; start?: number; end?: number | null};
type Player = {path: string; start: number; end: number | null; video: HTMLVideoElement; texture: T.VideoTexture};
const FPS = 30;
// One or more parts played as a chain, each on its own video element so the next one is decoded before it is shown.
export function createPlayers(onShow: (texture: T.Texture, path: string) => void, onChange: () => void) {
  let players: Player[] = [], current = 0, paused = false;
  const show = (i: number) => { current = i; onShow(players[i].texture, players[i].path); onChange(); };
  const startTime = (p: Player) => p.start ? (p.start + 0.5) / FPS : 0;
  const make = (part: Part): Player => {
    const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.preload = 'auto'; video.src = part.path;
    const texture = new T.VideoTexture(video); texture.colorSpace = T.NoColorSpace; texture.minFilter = texture.magFilter = T.LinearFilter; texture.generateMipmaps = false;
    return {path: part.path, start: part.start ?? 0, end: part.end ?? null, video, texture};
  };
  // The part on screen is done: stop it where it is and bring in the next one on its first decoded frame.
  function advance(list: Player[], i: number) {
    if (paused || list !== players || current !== i) return;
    const n = (i + 1) % list.length, next = list[n]; list[i].video.pause(); next.video.currentTime = startTime(next);
    const swap = () => { if (list === players) show(n); };
    if (next.video.requestVideoFrameCallback) next.video.requestVideoFrameCallback(swap); else setTimeout(swap, 40);
    next.video.play().catch(() => {});
  }
  async function load(parts: Part[]) {
    for (const p of players) { p.video.pause(); p.video.removeAttribute('src'); p.video.load(); p.texture.dispose(); }
    const list = players = parts.map(make);
    list.forEach((p, i) => {
      p.video.addEventListener('ended', () => advance(list, i));
      if (p.end === null) return;
      const last = p.end - 1, reached = (seconds: number) => Math.floor(seconds * FPS + 1e-6) >= last;
      if (p.video.requestVideoFrameCallback) { const watch = (_now: number, frame: {mediaTime: number}) => { if (list !== players) return; if (reached(frame.mediaTime)) advance(list, i); p.video.requestVideoFrameCallback(watch); }; p.video.requestVideoFrameCallback(watch); }
      else p.video.addEventListener('timeupdate', () => { if (reached(p.video.currentTime)) advance(list, i); });
    });
    await Promise.all(list.map(p => new Promise<void>((resolve, reject) => { if (p.video.readyState >= 2) resolve(); else { p.video.addEventListener('loadeddata', () => resolve(), {once: true}); p.video.addEventListener('error', () => reject(Error(`Filmen kunde inte läsas: ${p.path}`)), {once: true}); } })));
    if (list !== players) return;
    list[0].video.currentTime = startTime(list[0]); show(0); if (!paused) list[0].video.play().catch(() => {});
  }
  async function seek(i: number, seconds: number) {
    paused = true; players.forEach(p => p.video.pause()); const v = players[i].video;
    await new Promise<void>(resolve => { const done = () => { if (v.requestVideoFrameCallback) { const fallback = setTimeout(resolve, 250); v.requestVideoFrameCallback(() => { clearTimeout(fallback); resolve(); }); } else setTimeout(resolve, 60); };
      if (Math.abs(v.currentTime - seconds) < 1e-4 && v.readyState >= 2) done(); else { v.addEventListener('seeked', done, {once: true}); v.currentTime = seconds; } });
    players[i].texture.needsUpdate = true; show(i);
  }
  return {
    load, seek,
    toggle(force?: boolean) { paused = force ?? !paused; const v = players[current]?.video; if (v) { if (paused) v.pause(); else v.play().catch(() => {}); } onChange(); },
    // Half a frame past the frame start, so the decoder lands on that frame and not the one before it.
    // Stays inside the part on screen.
    step(frames: number) { const p = players[current]; if (!p) return Promise.resolve(); const last = (p.end ?? Math.max(1, Math.round(p.video.duration * FPS))) - 1, frame = Math.max(p.start, Math.min(last, Math.floor(p.video.currentTime * FPS + 1e-6) + frames)); return seek(current, (frame + 0.5) / FPS); },
    get paused() { return paused; }, get path() { return players[current]?.path ?? ''; },
    // The video on screen and its texture, for a layer that draws on the film frame (rendered cards).
    get current() { const p = players[current]; return p ? {video: p.video, texture: p.texture} : null; }, get count() { return players.length; },
    // The chain as source frame ranges, end exclusive; for stepping through it frame by frame from outside.
    get parts() { return players.map(p => ({path: p.path, start: p.start, end: p.end ?? Math.round(p.video.duration * FPS)})); },
    // Source frame of the clip on screen: card tracks are indexed by it.
    frame() { const v = players[current]?.video; return v ? Math.floor(v.currentTime * FPS + 1e-6) : 0; },
  };
}
