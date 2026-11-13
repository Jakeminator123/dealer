// A film before the game: a start picture with two buttons over the game's stage, the film with its sound after the press, and a
// fade from the film's last frame into the live game, where the dealer sits in the same place. Then nothing of it is left.
//
// The page calls createIntro(stage, canvas, {film, poster}) once, as early as it can, and goes on building the game under it; the
// promise resolves when the game is seen, with {played}, so the page knows when its own sound may start. A film that cannot be
// loaded or played never holds the game back: it counts as a skip, and so does Escape at any time. A page that wants the game to
// stand in the film's last picture when the fade begins is called a little before the film ends (onLead), while the film still
// covers the game, and again as the fade begins (onFade).
//
// Where the film lies. Its last frame is the game's own picture at 16:9 (the scene at FRAMING.wide in src/game-page.ts, pitch -8,
// zoom 0.84). The game frames that picture differently on other stages: the scene keeps the film frame's height on a stage wider
// than the film frame (1764 x 1174) and its width on a narrower one (viewFovDeg in src/scene3d-geometry.ts), always about the
// stage's middle. So the film is laid at the scale the game will have her at (introLayout), centred: on a stage between 1.50 and
// 16:9 that covers the stage; on a wider one it leaves black bars at the sides, on a narrower lying one thin bars above and below,
// and in each case she sits where the game has her. Standing (the game's tall framing, width / height under 0.8, pitch -10,
// zoom 1.9) the game shows her far larger than any whole film picture could, so the film is shown whole on black and, during a
// longer fade, grows toward where the game has her before it dissolves into the game.
//
// The first part has no page in it (tools/game-intro.test.ts runs it under Node); createIntro is the page.

/** Where the intro is: the start picture, the film, the fade into the game, gone. */
export type IntroPhase = 'waiting' | 'playing' | 'fading' | 'done';
/** What can happen to it: the press on "Spela", the film's end, a skip ("Hoppa över", Escape), a film that fails, the fade's end. */
export type IntroSignal = 'play' | 'ended' | 'skip' | 'error' | 'faded';
export type IntroState = {phase: IntroPhase; played: boolean};
export const INTRO_START: IntroState = {phase: 'waiting', played: false};

/** The next state. A skip works in every state (in the fade it ends the fade); an error counts as a skip; played is true only when the film ran to its end. */
export function introNext(state: IntroState, signal: IntroSignal): IntroState {
  switch (state.phase) {
    case 'waiting': return signal === 'play' ? {phase: 'playing', played: false} : signal === 'skip' || signal === 'error' ? {phase: 'fading', played: false} : state;
    case 'playing': return signal === 'ended' ? {phase: 'fading', played: true} : signal === 'skip' || signal === 'error' ? {phase: 'fading', played: false} : state;
    case 'fading': return signal === 'faded' || signal === 'skip' ? {phase: 'done', played: state.played} : state;
    case 'done': return state;
  }
}

// The film frame in the scene (FILM in src/scene3d-geometry.ts) and the plan camera's focal length in its pixels
// (data/scene-contract.json, keyFigures.focalPx); tools/game-intro.test.ts holds them to those files.
export const INTRO_FRAME = {width: 1764, height: 1174, focalPx: 886};
// The film: 1920 x 1080, made at the game's lying framing. The game's framings (FRAMING in src/game-page.ts).
export const INTRO_FILM = {width: 1920, height: 1080, zoom: 0.84, pitch: -8};
export const INTRO_FRAMING = {lying: {zoom: 0.84, pitch: -8}, tall: {zoom: 1.9, pitch: -10}, tallBelow: 0.8};
// Two points of her in the film's last frame (film pixels, y down): her face and her hands on the tray. Standing, the film is moved
// so that these two land where the game shows them.
export const INTRO_MARKS = {x: 960, face: 150, hands: 630};

export type Box = {x: number; y: number; width: number; height: number};
export type IntroLayout = {tall: boolean; film: Box; end: Box; covers: boolean};
const RAD = Math.PI / 180;
/** Pixels per radian at the middle of a stage of width w and height h for the game at this zoom (viewFovDeg in src/scene3d-geometry.ts). */
export function focalOf(w: number, h: number, zoom: number): number {
  const f = INTRO_FRAME, half = w / h >= f.width / f.height ? f.height / 2 / f.focalPx : f.width / 2 / f.focalPx / (w / h);
  return h / 2 * zoom / half;
}
/** Where the film lies on a stage of w x h (CSS pixels): during the film, and at the end of the fade (where the game has her). */
export function introLayout(w: number, h: number): IntroLayout {
  const F = INTRO_FILM, tall = w / Math.max(1, h) < INTRO_FRAMING.tallBelow, filmFocal = focalOf(F.width, F.height, F.zoom);
  const framing = tall ? INTRO_FRAMING.tall : INTRO_FRAMING.lying, gameFocal = focalOf(w, h, framing.zoom), tilt = (F.pitch - framing.pitch) * RAD;
  // a film row as the game's camera shows it: the same place, looking `tilt` further down
  const row = (y: number) => h / 2 + gameFocal * Math.tan(Math.atan((y - F.height / 2) / filmFocal) - tilt);
  const top = row(INTRO_MARKS.face), bottom = row(INTRO_MARKS.hands), scale = (bottom - top) / (INTRO_MARKS.hands - INTRO_MARKS.face);
  const end = {x: w / 2 - F.width / 2 * scale, y: top - INTRO_MARKS.face * scale, width: F.width * scale, height: F.height * scale};
  const whole = Math.min(w / F.width, h / F.height), film = tall ? {x: (w - F.width * whole) / 2, y: (h - F.height * whole) / 2, width: F.width * whole, height: F.height * whole} : end;
  return {tall, film, end, covers: film.x <= 0.5 && film.y <= 0.5 && film.x + film.width >= w - 0.5 && film.y + film.height >= h - 0.5};
}

// ── the page ────────────────────────────────────────────────────────────────
export type IntroOptions = {
  film: string; poster: string;
  /** The fade into the game, seconds: lying and standing. */
  fade?: {lying?: number; tall?: number};
  /** Standing: the film grows toward where the game has her during the fade (true), or only fades (false). */
  grow?: boolean;
  /** The film time from which the poster gives way to the film (the poster is that frame; the film fades up from black before it). */
  posterUntil?: number;
  /** Seconds without the film's time moving after which it counts as failed. */
  stall?: number;
  /** Called once as the film gives way to the game (the fade begins), with whether the film ran to its end: the page can then put the game in the picture the film ends in. */
  onFade?: (played: boolean) => void;
  /**
   * Called once, `lead` seconds before the film's end, only for a film that is running to its end (never after a skip), and always
   * before onFade(true). The film still covers the game then, so the page can cut the game to the picture the film ends in (the
   * dealer's rest from its first frame) without the cut being seen; when the fade begins the two agree.
   */
  onLead?: () => void;
  /** How long before the film's end onLead is called, seconds. The film's last 0.75 s is her hold in the rest pose. */
  lead?: number;
};
export const INTRO_DEFAULTS = {fade: {lying: 0.4, tall: 1.2}, grow: true, posterUntil: 12.5 / 24, stall: 10, lead: 0.4};
/** Standing: the share of the fade in which the film grows; it dissolves into the game in the rest, standing where the game has her. */
export const INTRO_GROW_SHARE = 0.6;

const BUTTON = 'box-sizing:border-box;min-width:168px;min-height:56px;padding:0 28px;border-radius:14px;font:700 17px/1 system-ui,"Segoe UI",sans-serif;letter-spacing:.06em;cursor:pointer;touch-action:manipulation';
const PRIMARY = `${BUTTON};border:0;background:linear-gradient(180deg,var(--tc-accent,#e9c873),var(--tc-accent-2,#b98f3e));color:var(--tc-ink,#1b1305);text-transform:uppercase;box-shadow:0 8px 22px -8px var(--tc-glow,rgba(233,200,115,.3)),inset 0 1px 0 rgba(255,255,255,.4)`;
const SECONDARY = `${BUTTON};border:1px solid var(--tc-line-strong,rgba(226,191,109,.32));background:var(--tc-plate,rgba(14,12,9,.88));color:var(--tc-text,#f6eedc)`;

/**
 * Lays the intro over the stage and resolves when the game is seen. `canvas` is the game's picture under it (the intro only reads
 * the stage's size; the canvas is named so that the call says what the film fades into). Removes everything it made when it is done.
 */
export function createIntro(stage: HTMLElement, canvas: HTMLCanvasElement, options: IntroOptions): Promise<{played: boolean}> {
  const fade = {...INTRO_DEFAULTS.fade, ...(options.fade ?? {})}, grow = options.grow ?? INTRO_DEFAULTS.grow;
  const posterUntil = options.posterUntil ?? INTRO_DEFAULTS.posterUntil, stall = options.stall ?? INTRO_DEFAULTS.stall, lead = options.lead ?? INTRO_DEFAULTS.lead;
  const doc = stage.ownerDocument, made = (tag: string, css: string) => { const el = doc.createElement(tag); el.style.cssText = css; return el; };
  const root = made('div', 'position:absolute;inset:0;z-index:1000;overflow:hidden;background:#000;opacity:1');
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Film före spelet'); root.dataset.intro = canvas.id || 'intro';
  const video = made('video', 'position:absolute;object-fit:fill;background:#000') as HTMLVideoElement;
  video.playsInline = true; video.preload = 'none'; video.controls = false; video.setAttribute('playsinline', ''); video.disablePictureInPicture = true;
  // The start picture is shown whole or not at all: one still arriving would be drawn in halves over the black.
  const still = made('img', 'position:absolute;object-fit:fill;pointer-events:none;visibility:hidden') as HTMLImageElement;
  still.alt = ''; still.decoding = 'async';
  const bar = made('div', 'position:absolute;left:0;right:0;bottom:max(7%,24px);display:flex;flex-wrap:wrap;justify-content:center;gap:14px;padding:0 16px');
  const play = made('button', PRIMARY) as HTMLButtonElement, skip = made('button', SECONDARY) as HTMLButtonElement;
  play.type = skip.type = 'button'; play.textContent = 'Spela'; skip.textContent = 'Hoppa över';
  bar.append(play, skip); root.append(video, still, bar); stage.append(root);

  let state = INTRO_START, layout = introLayout(1, 1), timer: ReturnType<typeof setTimeout> | null = null, watch: ReturnType<typeof setInterval> | null = null;
  let lastTime = -1, still0 = 0, posterGone = false, led = false, resolve: (value: {played: boolean}) => void = () => {};
  const done = new Promise<{played: boolean}>(r => { resolve = r; });
  const place = (el: HTMLElement, box: Box) => { el.style.left = `${box.x}px`; el.style.top = `${box.y}px`; el.style.width = `${box.width}px`; el.style.height = `${box.height}px`; };
  const lay = () => { const r = stage.getBoundingClientRect(); layout = introLayout(r.width, r.height); if (state.phase !== 'fading') { place(video, layout.film); place(still, layout.film); } };
  const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(lay) : null; resized?.observe(stage); lay();
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); send('skip'); } };
  doc.addEventListener('keydown', key, true);
  const clear = () => { if (timer !== null) clearTimeout(timer); if (watch !== null) clearInterval(watch); timer = watch = null; };
  // From the lead on the game under the film is composed with it (an opacity a hair under 1, which nobody sees): the first
  // frame in which the browser composes the two cost 0.08 s lying and 0.18 s standing, a stall in the middle of the picture when it
  // came with the fade's first frame. Here it falls in the film's last hold, where nothing moves.
  const leadNow = () => { if (led) return; led = true; root.style.opacity = '0.999'; try { options.onLead?.(); } catch { /* the page's own business never holds the game back */ } };
  const onEnded = () => send('ended'), onError = () => send('error'), onStill = () => { if (!posterGone) still.style.visibility = 'visible'; };
  const onTime = () => {
    if (!posterGone && video.currentTime >= posterUntil) { posterGone = true; still.style.visibility = 'hidden'; }
    if (!led && state.phase === 'playing' && video.duration - video.currentTime <= lead) leadNow(); // no duration yet: not a number, so not yet
  };
  video.addEventListener('ended', onEnded); video.addEventListener('error', onError); video.addEventListener('timeupdate', onTime);
  still.addEventListener('load', onStill); still.src = options.poster;
  play.addEventListener('click', () => send('play')); skip.addEventListener('click', () => send('skip'));
  play.focus({preventScroll: true});

  function send(signal: IntroSignal) {
    const before = state.phase; state = introNext(state, signal);
    if (state.phase === before) return;
    if (state.phase === 'playing') start();
    else if (state.phase === 'fading') fadeOut();
    else if (state.phase === 'done') finish();
  }
  function start() {
    bar.style.display = 'none';
    video.preload = 'auto'; video.muted = false; video.src = options.film;
    const frames = (video as {requestVideoFrameCallback?: (cb: () => void) => number}).requestVideoFrameCallback?.bind(video);
    // each frame the film shows, for as long as something waits on its time: the poster's frame, and the lead before its end
    if (frames) { const look = () => { if (state.phase !== 'playing') return; onTime(); if (!posterGone || !led) frames(look); }; frames(look); }
    video.play().catch(() => send('error'));
    // a film that stops moving (a network that gives up) counts as failed
    watch = setInterval(() => { if (state.phase !== 'playing' || video.paused && video.ended) return; if (video.currentTime !== lastTime) { lastTime = video.currentTime; still0 = Date.now(); } else if (Date.now() - still0 > stall * 1000) send('error'); }, 500);
    still0 = Date.now();
  }
  function fadeOut() {
    clear(); bar.style.display = 'none';
    if (state.played) leadNow(); // a film whose time was never read near its end: the lead comes late, but before the fade
    try { options.onFade?.(state.played); } catch { /* the page's own business never holds the game back */ }
    const seconds = layout.tall ? fade.tall : fade.lying;
    if (!state.played) video.pause();
    // Standing, the film first grows on black toward where the game has her (a transform, so that the browser moves it smoothly)
    // and dissolves into the game only when it has arrived: dissolving while it still grew showed her twice, 20 to 30 px apart.
    const growing = layout.tall && grow && state.played, growFor = seconds * INTRO_GROW_SHARE;
    if (growing) {
      const from = layout.film, to = layout.end, s = to.width / from.width;
      video.style.transformOrigin = '0 0'; video.style.transition = `transform ${growFor}s cubic-bezier(.4,0,.2,1)`;
      void video.offsetWidth; video.style.transform = `translate(${to.x - from.x}px,${to.y - from.y}px) scale(${s})`;
    }
    root.style.transition = growing ? `opacity ${seconds - growFor}s ease ${growFor}s` : `opacity ${seconds}s ease`; void root.offsetWidth; root.style.opacity = '0';
    root.addEventListener('transitionend', onFaded);
    timer = setTimeout(() => send('faded'), seconds * 1000 + 250); // a fade the browser never reports ends all the same
  }
  function onFaded(e: TransitionEvent) { if (e.target === root && e.propertyName === 'opacity') send('faded'); }
  function finish() {
    clear(); resized?.disconnect(); doc.removeEventListener('keydown', key, true); root.removeEventListener('transitionend', onFaded);
    video.removeEventListener('ended', onEnded); video.removeEventListener('error', onError); video.removeEventListener('timeupdate', onTime);
    video.pause(); video.removeAttribute('src'); video.load(); // the browser lets go of the film's data
    still.removeEventListener('load', onStill); still.removeAttribute('src'); root.remove();
    resolve({played: state.played});
  }
  return done;
}
