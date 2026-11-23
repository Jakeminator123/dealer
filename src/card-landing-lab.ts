// Page code of kortlandning.html, a trial in two parts (Jakob 2026-11-23). Nothing is saved, and neither the game nor the scene
// is changed. The film is the raw one on its green table: the page is about where the drawn card lies, not its light.
//
// 1. The graphics on the films ("grafiken", the drawn back and front): every film that has a card track plays with the drawn
//    card laid on the film's card by the game's own rules, unchanged (src/card-overlay.ts, src/card-overlay-view.ts), from
//    today's track (assets/tracking/) or from the card model's (assets/proofs/kortmodell-v2-20261123/spar/, made by
//    tools/python/kort-dataset/spar_modell.ts), or both beside each other, close on the card. The model's index beside the
//    tracks says where the two differ, and "Alla filmer" lists every film with its measures.
// 2. The landing ("en provisorisk testyta … se över lite hur korten ser ut på bordet vid och när de just är släppta"): the
//    trial of src/card-settle.ts, where the card sets itself as it lands and comes back to its place as her hand leaves. The
//    trial only gives the overlay another place to land on for each frame.
//
// The address's words: klipp (the film's clip id), spar (idag, modell, bada), del (hela, landning), hand (film, ritat),
// lage (film, idag, prov: the film alone, the landing as today, the landing trial), ruta (the film stands still on that
// frame), zoom (1, 3 or 6), styrka (the trial's measures times this, to see which way the card goes).
import {TABLE_GEOMETRY, PLAN_CARD_SIZE, cardGrow} from './card-plan.ts';
import {createCardOverlay, type OverlayOptions} from './card-overlay-view.ts';
import {MARGIN, sceneOf, planScene, restOf, restFade, restShare, restingQuad, trialTrack, type CardTrack} from './card-overlay.ts';
import {centre, signedArea, type Pt} from './card-track.ts';
import {createLayout, type Slot} from './game-table.ts';
import type {PlacementPlan} from './placement-model.ts';
import {SETTLE, STILL, releaseOf, settledLand, millimetres, type Settle} from './card-settle.ts';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: (Node | string)[]) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
const $ = (id: string) => document.getElementById(id)!;
const panel = $('panel'), hud = $('hud'), frameBox = $('frame'), filmBox = $('film'), marks = $('marks'), all = $('alla');
const video = $('video') as HTMLVideoElement, view = $('view') as HTMLCanvasElement, slider = $('tid') as HTMLInputElement, ctx = view.getContext('2d')!;
const fail = (message: string) => { panel.append(el('p', {className: 'error', textContent: message})); hud.replaceChildren(el('span', {className: 'chip warn', textContent: message})); throw Error(message); };
const read = async (url: string, what: string) => { const res = await fetch(url).catch(() => null); if (!res?.ok) fail(`${what} kunde inte läsas (${url}).`); return res!.json(); };
const maybe = async (url: string) => { const res = await fetch(url).catch(() => null); return res?.ok ? res.json().catch(() => null) : null; };
const decimal = (v: number, digits = 0) => v.toFixed(digits).replace('.', ',');
const query = new URLSearchParams(location.search), word = <T extends string>(name: string, options: readonly T[], otherwise: T): T => options.find(o => o === query.get(name)) ?? otherwise;

// ---- the films: every one with a model track, and the bank's deals --------------------------------------------------
const MODEL = 'assets/proofs/kortmodell-v2-20261123';
type Sums = {stor: number[]; liten: number[]; utanKort: number[]; behallna: number};
type Row = {clip: string; kind: string | null; vag: [number, number]; franModellen: number; styva: number; idag: Sums; modell: Sums; skiljer: number[]; annanSida: number[]; styvt?: {franModellen: number; ryck: [number, number]} | null};
type Motion = {source?: {path?: string; fps?: number}; motion?: {kind?: string; to?: string; segment?: {clip?: string}}; review?: {decision?: string}};
type Film = {clip: string; path: string; fps: number; to: string | null; slot: Slot | null; row: Row | null; group: number};
const [contract, placements, bank, index] = await Promise.all([read('data/scene-contract.json', 'Scenkontraktet'), read('api/placements', 'Placeringsplanen'), read('api/clip-bank', 'Klippbanken'), maybe(`${MODEL}/index.json`)]);
const plan = (placements.plan ?? placements) as PlacementPlan;
// The resting card by the card plan's rule, as the scene has it (src/scene3d-deal.ts): a real card through the table's lens.
const scene = TABLE_GEOMETRY === 'lens' && plan.targets?.['P4.C1'] ? planScene(sceneOf(contract), plan) : sceneOf(contract);
const layout = createLayout(plan, {geometry: TABLE_GEOMETRY});

const GROUPS = ['Paow, nyaste (ankare 2.3)', 'Paow, äldre'], KIND: Record<string, string> = {DEAL: 'Giv', RETURN: 'Retur', OTHER: 'Annat'};
const groupOf = (clip: string) => /^paow-.*-2-3-/.test(clip) ? 0 : clip.startsWith('paow') ? 1 : 2;
const rows = new Map<string, Row>(((index?.filmer ?? []) as Row[]).map(r => [r.clip, r]));
const banked = new Map<string, {path: string; fps: number; to: string | null; slot: Slot | null; rejected: boolean}>();
for (const item of Object.values((bank.motions ?? {}) as Record<string, Motion>)) {
  const clip = item.motion?.segment?.clip, to = item.motion?.kind === 'DEAL' ? item.motion.to ?? '' : '', at = /^(D|P([1-7]))\.C([1-3])$/.exec(to);
  if (!clip || !item.source?.path || (banked.get(clip)?.slot && !at)) continue; // a clip's deal says where its card lands
  banked.set(clip, {path: item.source.path, fps: item.source.fps ?? 24, to: at ? to : null, rejected: item.review?.decision === 'REJECTED',
    slot: at ? {owner: at[1] === 'D' ? 'D' : 'P', seat: Number(at[2] ?? 0), hand: 0, hands: 1, index: Number(at[3]) - 1} : null});
}
const films: Film[] = [...new Set([...rows.keys(), ...[...banked].filter(([, b]) => b.slot && !b.rejected).map(([clip]) => clip)])].map(clip => { const b = banked.get(clip);
  return {clip, path: b?.path ?? `assets/motions/${clip}/source.mp4`, fps: b?.fps ?? 24, to: b?.to ?? null, slot: b?.slot ?? null, row: rows.get(clip) ?? null, group: groupOf(clip)}; }).filter(f => f.group < GROUPS.length);
films.sort((a, b) => a.group - b.group || (a.to ?? '~').localeCompare(b.to ?? '~') || b.clip.localeCompare(a.clip));
if (!films.length) fail('Det finns inga filmer med kortspår att visa.');
const nameOf = (f: Film) => `${f.to ?? KIND[f.row?.kind ?? ''] ?? 'Film'} · ${f.clip}`;

// ---- what he sets ----------------------------------------------------------------------------------------------------
const strength = Math.max(0, Number(query.get('styrka')) || 1), old = query.get('lage');
const look = {
  show: (old === 'film' ? 'film' : 'grafik') as 'film' | 'grafik',
  track: word('spar', ['idag', 'modell', 'bada'] as const, old ? 'idag' : 'bada'),
  hand: (query.get('hand') === 'film' || (old && query.get('hand') !== 'ritat') ? 'film' : 'object') as 'film' | 'object', // the card in her hand: the film's own, as the game has it, or the drawn one
  part: word('del', ['hela', 'landning'] as const, old ? 'landning' : 'hela'),
  landing: (old === 'prov' ? 'prov' : 'idag') as 'idag' | 'prov',
  rate: 0.5, zoom: [1, 3, 6].find(z => z === Number(query.get('zoom'))) ?? 3, scale: PLAN_CARD_SIZE, lines: false, blur: query.get('oskarpa') === '1',
  settle: {...SETTLE, bump: SETTLE.bump * strength, slide: SETTLE.slide * strength, turn: SETTLE.turn * strength} as Settle,
};
const still = query.get('ruta') !== null && Number.isFinite(Number(query.get('ruta'))) ? Math.round(Number(query.get('ruta'))) : null;
// "Kortens storlek" as the scene's Efterarbete has it: 1.2 is a real card, the plan's own outline (src/card-plan.ts cardGrow).
const grow = () => cardGrow(look.scale, TABLE_GEOMETRY);

// ---- the film on screen ----------------------------------------------------------------------------------------------
const layer = document.createElement('canvas'), overlay = createCardOverlay(layer), sheet = document.createElement('canvas'), paper = sheet.getContext('2d')!;
let film = films.find(f => f.clip === query.get('klipp')) ?? films.find(f => f.clip === 'paow-giv-2-3-p4-02-01') ?? films[0];
let today: CardTrack | null = null, model: CardTrack | null = null, land: Pt[] | null = null, focus: Pt | null = null;
let loop = {from: 0, to: 0}, shown = 0, playing = still === null, loads = 0;
const frames = () => today?.frames.length ?? 0;
const timeOf = (frame: number) => (frame + 0.5) / film.fps, frameOf = (time: number) => Math.max(0, Math.min(frames() - 1, Math.floor(time * film.fps + 0.25)));
const size = (q: Pt[]) => Math.sqrt(Math.abs(signedArea(q)));
const both = () => look.show === 'grafik' && look.track === 'bada' && !!model;
const active = () => look.track !== 'idag' && model ? model : today;
type Seen = {side?: string; quad?: number[][] | null; edge?: number[][] | null; note?: string};
const seen = (track: CardTrack | null, frame: number) => (track?.frames[frame] ?? null) as Seen | null;
const points = (q: number[][]): Pt[] => q.map(p => ({x: p[0], y: p[1]}));
// The stiff card (tools/python/kort-dataset/styvt_kort.ts) is a real card in every frame, so "Kortens storlek" sizes it in her hand as it sizes the lying card.
const stiff = (note?: string) => !!note && note.startsWith('stiff card');
let sized: {of: CardTrack; by: number; track: CardTrack} | null = null;
function sizedTrack(track: CardTrack): CardTrack {
  const by = look.scale / PLAN_CARD_SIZE; if (by === 1 || track !== model) return track;
  if (sized?.of !== track || sized.by !== by) sized = {of: track, by, track: {...track, frames: track.frames.map(f => { const q = (f as Seen).quad; if (!stiff((f as Seen).note) || q?.length !== 4) return f;
    const c = centre(points(q)); return {...f, quad: q.map(p => [c.x + (p[0] - c.x) * by, c.y + (p[1] - c.y) * by])}; }) as CardTrack['frames']}};
  return sized.track;
}
// Trial (Jakob 2026-11-23): where the film's card is smeared by its own speed, the drawn card is smeared the same way, along its
// travel in this frame, as much as a camera with the shutter open half the frame would. The card's turning is not smeared.
const SHUTTER = 0.5, SMEAR = 9, soft = document.createElement('canvas');
function travel(track: CardTrack, frame: number): Pt | null {
  const rest = restOf(track); if (rest && frame >= rest.from) return null;
  const a = cardAt(track, frame - 1) ?? cardAt(track, frame), b = cardAt(track, frame + 1) ?? cardAt(track, frame), apart = (cardAt(track, frame - 1) ? 1 : 0) + (cardAt(track, frame + 1) ? 1 : 0);
  if (!a || !b || !apart) return null; const v = {x: (b.x - a.x) / apart * SHUTTER, y: (b.y - a.y) / apart * SHUTTER};
  return Math.hypot(v.x, v.y) >= 2 ? v : null;
}
const cardAt = (track: CardTrack | null, frame: number): Pt | null => { const f = seen(track, frame); return f?.quad?.length === 4 ? centre(points(f.quad)) : f?.edge?.length === 2 ? centre(points(f.edge)) : null; };

async function open(next: Film) {
  const load = ++loads; film = next; today = null; model = null; focus = null; video.pause(); hud.replaceChildren(el('span', {className: 'chip', textContent: 'Läser …'}));
  const [stored, trial] = await Promise.all([maybe(`assets/tracking/${film.clip}/card-track.json`), film.row ? maybe(`${MODEL}/spar/${film.clip}.json`) : null]) as [(CardTrack & {fps?: string | number; source?: {path?: string}}) | null, CardTrack | null];
  if (load !== loads) return;
  if (!stored) { hud.replaceChildren(el('span', {className: 'chip warn', textContent: 'Filmen har inget kortspår.'})); ctx.clearRect(0, 0, view.width, view.height); return; }
  today = stored; const laid = trial ? trialTrack(stored, trial) : stored; model = laid === stored ? null : laid;
  const [count, per = '1'] = String(stored.fps ?? '').split('/'), rate = Number(count) / Number(per); // the track writes the film's rate as "24/1"
  if (Number.isFinite(rate) && rate > 0) film.fps = rate;
  film.path = stored.source?.path ?? film.path; land = film.slot ? layout.quad(film.slot) : null;
  span();
  video.src = '/' + film.path.replace(/^\/+/, '');
  const ok = await new Promise<boolean>(done => { video.addEventListener('loadeddata', () => done(true), {once: true}); video.addEventListener('error', () => done(false), {once: true}); });
  if (load !== loads) return;
  if (!ok) { today = null; hud.replaceChildren(el('span', {className: 'chip warn', textContent: 'Filmen kunde inte läsas.'})); ctx.clearRect(0, 0, view.width, view.height); return; }
  view.width = sheet.width = video.videoWidth; view.height = sheet.height = video.videoHeight; fit();
  video.playbackRate = look.rate; video.currentTime = timeOf(still ?? loop.from);
  if (playing) void video.play().catch(() => { playing = false; controls.sync(); });
  controls.sync();
}

// The part of the film that plays, and what the time line marks: the landing's moments, and the frames where the tracks differ.
function span() {
  if (!today) return;
  const rest = restOf(today), release = rest ? releaseOf(today) : null, last = frames() - 1;
  if (!rest) look.part = 'hela';
  loop = look.part === 'landning' && rest ? {from: Math.max(0, rest.from - 30), to: Math.min(last, Math.max(rest.from, release?.free ?? 0) + 30)} : {from: 0, to: last};
  slider.min = String(loop.from); slider.max = String(loop.to);
  const left = (frame: number) => `left:${(frame - loop.from) / Math.max(1, loop.to - loop.from) * 100}%`, mark = (frame: number, text: string) => el('span', {textContent: text, style: left(frame)} as Partial<HTMLSpanElement>);
  marks.replaceChildren(...(film.row?.skiljer ?? []).filter(f => f >= loop.from && f <= loop.to).map(f => el('i', {style: left(f)} as Partial<HTMLElement>)),
    ...(rest ? [mark(rest.from, 'landar')] : []), ...(look.part === 'landning' && release?.held && release.leaves ? [mark(release.from, 'släpper'), mark(release.free, 'fri')] : []));
}

// The film fills the frame at one size for all. A close view carries the card to the middle of the frame: its landing place in
// the landing, the card itself in the whole film. Two tracks beside each other are cut close in the picture itself.
function fit() {
  const w = video.videoWidth || 1764, h = video.videoHeight || 1174, k = Math.min(frameBox.clientWidth / w, frameBox.clientHeight / h), bw = w * k, bh = h * k;
  const left = (frameBox.clientWidth - bw) / 2, top = (frameBox.clientHeight - bh) / 2, z = both() ? 1 : look.zoom, rest = today ? restOf(today) : null;
  const c = (look.part === 'landning' ? land ? centre(land) : rest ? centre(rest.quad) : null : focus) ?? {x: w / 2, y: h / 2};
  // The card goes to the middle, but never so far that the frame shows what lies outside the film (seat 4 lies at its lower edge).
  const hold = (t: number, size: number, room: number) => size <= room ? (room - size) / 2 : Math.min(0, Math.max(room - size, t));
  const tx = z === 1 ? left : hold(frameBox.clientWidth / 2 - c.x * k * z, bw * z, frameBox.clientWidth), ty = z === 1 ? top : hold(frameBox.clientHeight / 2 - c.y * k * z, bh * z, frameBox.clientHeight);
  Object.assign(filmBox.style, {width: `${bw}px`, height: `${bh}px`, transform: `translate(${tx}px,${ty}px) scale(${z})`});
}
new ResizeObserver(fit).observe(frameBox);

// One frame of one track on the sheet: the film's own picture, and over it the card layer as the game's overlay draws it.
function compose(track: CardTrack | null, frame: number) {
  paper.globalAlpha = 1; paper.drawImage(video, 0, 0, sheet.width, sheet.height);
  const line = (q: Pt[], colour: string, dash: number[], width = 1) => { paper.strokeStyle = colour; paper.lineWidth = width; paper.setLineDash(dash); paper.beginPath(); q.forEach((p, i) => i ? paper.lineTo(p.x, p.y) : paper.moveTo(p.x, p.y)); paper.closePath(); paper.stroke(); paper.setLineDash([]); };
  const rest = track ? restOf(track) : null, trial = look.landing === 'prov' && !!land && !!rest, place = trial ? settledLand(land!, track!, frame, look.settle) : land;
  if (track) {
    // Under the game's line the card in her hand is the film's own, and at rest the drawn card takes over in a few frames
    // (restFade, restShare): it comes in under the film's card, and then the film's card is keyed away over it.
    const fade = look.hand === 'film' && rest ? restFade(track) : null, share = restShare(fade, frame), drawn = look.hand === 'object' || (fade !== null && frame >= fade.from);
    const material = film.slot ? layout.material(film.slot) : null;
    const options: OverlayOptions = {scale: grow(), split: false, card: {rank: 'A', suit: 'spades'} as OverlayOptions['card'], side: 'TRACK', bend: material?.bend ?? 0.07, gloss: material?.gloss ?? 0.35,
      inFront: false, land: place, target: film.to, carry: drawn ? 'object' : 'film', placed: [], cards: null};
    overlay.draw(video, frame, sizedTrack(track), scene, options);
    const smear = look.blur && drawn ? travel(track, frame) : null;
    if (smear) { soft.width = layer.width; soft.height = layer.height; const pen = soft.getContext('2d')!; pen.globalCompositeOperation = 'lighter'; pen.globalAlpha = 1 / SMEAR;
      for (let k = 0; k < SMEAR; k++) { const t = (k + 0.5) / SMEAR - 0.5; pen.drawImage(layer, smear.x * t, smear.y * t); } }
    paper.globalAlpha = drawn && fade ? share.card : 1; paper.drawImage(smear ? soft : layer, 0, 0); paper.globalAlpha = 1;
    if (drawn && fade && share.key < 1 && rest) { // what the key has left of the film's lying card still shows over the drawn one
      const own = rest.quad, c = centre(own);
      paper.save(); paper.beginPath(); own.forEach((p, i) => { const x = c.x + (p.x - c.x) * 1.06, y = c.y + (p.y - c.y) * 1.06; if (i) paper.lineTo(x, y); else paper.moveTo(x, y); }); paper.closePath(); paper.clip();
      paper.globalAlpha = 1 - share.key; paper.drawImage(video, 0, 0, sheet.width, sheet.height); paper.restore(); paper.globalAlpha = 1;
    }
  }
  if (!look.lines) return;
  for (const [t, colour] of [[today, '#ff5a4d'], [model, '#5dff8a']] as const) { const f = t && (!track || !both() || t === track) ? seen(t, frame) : null;
    if (f?.quad?.length === 4) { const q = points(f.quad), c = centre(q), by = stiff(f.note) ? MARGIN * look.scale / PLAN_CARD_SIZE : 1; line(q.map(p => ({x: c.x + (p.x - c.x) * by, y: c.y + (p.y - c.y) * by})), colour, [], 2); } else if (f?.edge?.length === 2) line(points(f.edge), colour, [], 2); }
  if (look.part === 'landning' && rest) { if (land) line(land, '#ffffff', []); line(rest.quad, '#ffe14d', [4, 3]); if (trial && place) line(place, '#ff7ac8', [2, 2]); }
}

function paint(frame: number) {
  if (!today || !video.videoWidth) return;
  shown = frame; slider.value = String(frame);
  const at = cardAt(active(), frame) ?? cardAt(today, frame) ?? focus;
  focus = at && focus && playing ? {x: focus.x + (at.x - focus.x) * 0.3, y: focus.y + (at.y - focus.y) * 0.3} : at;
  const w = view.width, h = view.height;
  if (both()) { // each track's half: the same cut of the film round the card, the size the close view asks for
    const sw = w / 2 / look.zoom, sh = h / look.zoom, c = focus ?? {x: w / 2, y: h / 2}, sx = Math.max(0, Math.min(w - sw, c.x - sw / 2)), sy = Math.max(0, Math.min(h - sh, c.y - sh / 2));
    [today, model!].forEach((track, k) => { compose(track, frame); ctx.drawImage(sheet, sx, sy, sw, sh, k * w / 2, 0, w / 2, h); });
    ctx.fillStyle = '#060706'; ctx.fillRect(w / 2 - 2, 0, 4, h); ctx.font = '600 30px system-ui, "Segoe UI", sans-serif'; ctx.textBaseline = 'bottom';
    ['Dagens spår', film.row?.styvt ? 'Styvt kort' : 'Modellens spår'].forEach((text, k) => { const x = k * w / 2 + 22, y = h - 20, wide = ctx.measureText(text).width; ctx.fillStyle = 'rgba(10,12,11,.78)'; ctx.fillRect(x - 12, y - 40, wide + 24, 50); ctx.fillStyle = '#e8ece9'; ctx.fillText(text, x, y); });
  } else { compose(look.show === 'film' ? null : active(), frame); ctx.drawImage(sheet, 0, 0); if (look.part === 'hela' && look.zoom > 1) fit(); }
  facts(frame);
}

// What the tracks say about this frame, as short chips over the film; in the landing, what the film and the plan say about it.
const SIDE: Record<string, string> = {BACK: 'baksida', FRONT: 'framsida', EDGE: 'högkant'};
function facts(frame: number) {
  if (!today) return;
  const chips: [string, boolean?][] = [[`Ruta ${frame} av ${frames() - 1}`]], rest = restOf(today), f = seen(active(), frame), note = f?.note ?? '';
  if (look.show === 'grafik') {
    if (rest && frame >= rest.from) chips.push(['Kortet ligger: planens plats']);
    else if (!f?.quad && !f?.edge) chips.push(['Inget kort i spåret', true]);
    else if (active() === model && stiff(note)) chips.push([`Styvt kort: ${/model/.test(note) ? 'följer modellens hörn' : /track/.test(note) ? 'följer dagens ruta' : /edge/.test(note) ? 'på högkant' : 'buret av rutorna omkring'} · ${SIDE[f?.side ?? ''] ?? ''}`]);
    else if (active() === model) chips.push([`${note.startsWith('model') ? 'Modellens hörn' : /leading part/.test(note) ? 'Ur skon: kortad till kortlängd' : 'Dagens ruta står kvar'} · ${SIDE[f?.side ?? ''] ?? ''}`]);
    else chips.push([`Dagens spår · ${SIDE[f?.side ?? ''] ?? ''}`]);
    if (model && film.row?.skiljer.includes(frame)) chips.push(['Spåren skiljer här', true]);
    if (!model) chips.push(['Filmen har inget modellspår', true]);
    else if (!film.row?.styvt && film.row?.kind === 'DEAL') chips.push(['Inget styvt kort: kortet bärs högt eller lägger sig aldrig', true]);
  }
  if (look.part === 'landning' && rest && land) { const release = releaseOf(today)!, on = restingQuad(scene, land, grow()).quad, more = (size(rest.quad) / (size(on) || 1) - 1) * 100;
    const a = centre(rest.quad), b = centre(land), off = millimetres(land, {x: a.x - b.x, y: a.y - b.y});
    chips.push([`Landar ${rest.from}`], [!release.held ? 'Ingen hand på kortet efter landningen' : release.leaves ? `Handen lämnar ${release.from}–${release.free}` : 'Handen ligger kvar filmen ut'],
      [`Filmens kort ${more >= 0 ? '+' : '−'}${decimal(Math.abs(more))} % mot det ritade`], [`Filmen landar ${decimal(off)} mm från planens plats`]); }
  hud.replaceChildren(...chips.map(([text, warn]) => el('span', {className: warn ? 'chip warn' : 'chip', textContent: text})));
}

// The film tells when it shows a new frame; the loop turns back at its end.
const next = () => { const v = video as HTMLVideoElement & {requestVideoFrameCallback?: (fn: (now: number, meta: {mediaTime: number}) => void) => number};
  if (v.requestVideoFrameCallback) v.requestVideoFrameCallback((_now, meta) => tick(meta.mediaTime)); else requestAnimationFrame(() => tick(video.currentTime)); };
function tick(time: number) {
  const frame = frameOf(time); paint(frame);
  if (playing && today && (frame >= loop.to || frame < loop.from)) video.currentTime = timeOf(loop.from);
  next();
}
video.addEventListener('ended', () => { if (playing) { video.currentTime = timeOf(loop.from); void video.play(); } });
next();
video.addEventListener('seeked', () => paint(frameOf(video.currentTime))); // a film standing still on a frame shows it at once
const go = (frame: number) => { playing = false; video.pause(); video.currentTime = timeOf(Math.max(0, Math.min(frames() - 1, frame))); controls.sync(); };
const toggle = () => { playing = !playing; if (playing) void video.play(); else video.pause(); controls.sync(); };
// The nearest frame where the two tracks differ, before or after the one shown.
const differs = (way: 1 | -1) => { const list = film.row?.skiljer ?? [], to = way > 0 ? list.find(f => f > shown) : [...list].reverse().find(f => f < shown); if (to !== undefined) go(to); };
const step = (way: 1 | -1) => { const to = films[films.indexOf(film) + way]; if (to) void open(to); };
slider.addEventListener('input', () => go(Number(slider.value)));
addEventListener('keydown', event => { if ((event.target as HTMLElement)?.tagName === 'SELECT') return;
  if (event.key === ' ') { event.preventDefault(); toggle(); } else if (event.key === 'ArrowLeft') { event.preventDefault(); go(shown - 1); } else if (event.key === 'ArrowRight') { event.preventDefault(); go(shown + 1); }
  else if (event.key === 'm' || event.key === 'M') { look.show = 'grafik'; look.track = look.track === 'modell' ? 'idag' : 'modell'; controls.again(); }
  else if (event.key === 'Escape') all.hidden = true; });

// ---- every film with its measures ------------------------------------------------------------------------------------
function overview() {
  const sum = (list: Film[], pick: (r: Row) => number) => list.reduce((s, f) => s + (f.row ? pick(f.row) : 0), 0), way = (r: Row) => r.vag[1] - r.vag[0];
  const cell = (text: string, className = '') => el('td', {textContent: text, className}), change = (a: number, b: number) => cell(`${a} → ${b}`, b < a ? 'ok' : b > a ? 'warn' : '');
  const body = el('tbody');
  GROUPS.forEach((title, g) => { const list = films.filter(f => f.group === g && f.row); if (!list.length) return;
    const n = sum(list, way), from = sum(list, r => r.franModellen);
    body.append(el('tr', {className: 'group'}, el('th', {textContent: `${title} · ${list.length} filmer`}), cell(String(n)), cell(`${decimal(from / Math.max(1, n) * 100)} %`), cell(String(sum(list, r => r.skiljer.length))),
      change(sum(list, r => r.idag.stor.length), sum(list, r => r.modell.stor.length)), change(sum(list, r => r.idag.liten.length), sum(list, r => r.modell.liten.length)), change(sum(list, r => r.idag.behallna), sum(list, r => r.modell.behallna))));
    for (const f of [...list].sort((a, b) => b.row!.skiljer.length - a.row!.skiljer.length)) { const r = f.row!, name = el('button', {type: 'button', textContent: nameOf(f)});
      name.addEventListener('click', () => { all.hidden = true; void open(f); });
      body.append(el('tr', {}, el('td', {}, name), cell(String(way(r))), cell(`${decimal(r.franModellen / Math.max(1, way(r)) * 100)} %`), cell(String(r.skiljer.length)),
        change(r.idag.stor.length, r.modell.stor.length), change(r.idag.liten.length, r.modell.liten.length), change(r.idag.behallna, r.modell.behallna))); } });
  const close = el('button', {type: 'button', textContent: 'Stäng'}); close.addEventListener('click', () => { all.hidden = true; });
  all.replaceChildren(el('div', {className: 'head'}, el('h2', {textContent: 'Alla filmer: dagens spår mot modellens'}), close),
    el('p', {className: 'note', textContent: 'Rutor räknas medan kortet är på väg, från skon till vilan. Talen med pil är i dag → modellen. Välj en film för att se den.'}),
    el('table', {}, el('thead', {}, el('tr', {}, ...['Film', 'Rutor på väg', 'Från modellen', 'Spåren skiljer', 'Kortet för stort', 'Kortet för litet', 'Formen bara behållen'].map(text => el('th', {textContent: text})))), body));
}

// ---- the panel -------------------------------------------------------------------------------------------------------
const controls = (() => {
  const syncs: (() => void)[] = [], again = () => { span(); for (const s of syncs) s(); fit(); paint(shown); };
  const choice = <T,>(get: () => T, set: (value: T) => void, options: [T, string][]) => { const buttons = options.map(([value, text]) => { const b = el('button', {type: 'button', textContent: text}); b.addEventListener('click', () => { set(value); again(); }); syncs.push(() => b.setAttribute('aria-pressed', String(get() === value))); return b; });
    return el('div', {className: 'btns seg'}, ...buttons); };
  const range = (text: string, get: () => number, set: (value: number) => void, min: number, max: number, step: number, unit: string, digits: number) => { const input = el('input', {type: 'range', min: String(min), max: String(max), step: String(step)}), out = el('output');
    input.addEventListener('input', () => { set(Number(input.value)); again(); }); syncs.push(() => { input.value = String(get()); out.textContent = `${decimal(get(), digits)} ${unit}`; });
    return el('label', {className: 'row'}, text, input, out); };
  const button = (text: string, act: () => void) => { const b = el('button', {type: 'button', textContent: text}); b.addEventListener('click', () => { act(); again(); }); return b; };
  const group = (title: string, ...kids: Node[]) => el('fieldset', {}, el('legend', {textContent: title}), ...kids);
  const name = (text: string) => el('p', {className: 'name', textContent: text});
  const s = look.settle, pick = el('select', {ariaLabel: 'Film'}, ...GROUPS.map((title, g) => el('optgroup', {label: title}, ...films.filter(f => f.group === g).map(f => el('option', {value: f.clip, textContent: `${nameOf(f)}${f.row?.skiljer.length ? ` · ${f.row.skiljer.length} skiljer` : ''}`})))));
  pick.addEventListener('change', () => void open(films.find(f => f.clip === pick.value)!)); syncs.push(() => { pick.value = film.clip; });
  const play = button('', toggle); syncs.push(() => { play.textContent = playing ? 'Paus' : 'Spela'; });
  const lines = el('input', {type: 'checkbox'}); lines.addEventListener('change', () => { look.lines = lines.checked; again(); });
  const blur = el('input', {type: 'checkbox', checked: look.blur}); blur.addEventListener('change', () => { look.blur = blur.checked; again(); });
  const part = choice(() => look.part, v => { look.part = v; span(); if (playing) video.currentTime = timeOf(loop.from); }, [['hela', 'Hela filmen'], ['landning', 'Landningen']]);
  const list = el('button', {type: 'button', textContent: 'Alla filmer'}); list.addEventListener('click', () => { overview(); all.hidden = false; });
  panel.append(
    el('h1', {textContent: 'Grafiken på filmerna'}), el('p', {className: 'sub', textContent: 'Prov. Det ritade kortet lagt på filmens kort. Rå film på grön duk. Inget sparas.'}),
    group('Film', pick, el('div', {className: 'btns seg'}, button('◀ film', () => step(-1)), button('film ▶', () => step(1)), list)),
    group('Visa', choice(() => look.show, v => { look.show = v; }, [['film', 'Filmen'], ['grafik', 'Grafiken']]),
      name('Spår'), choice(() => look.track, v => { look.track = v; look.show = 'grafik'; }, [['idag', 'Dagens'], ['modell', 'Styvt kort'], ['bada', 'Båda']]),
      name('Kortet i handen'), choice(() => look.hand, v => { look.hand = v; }, [['film', 'Filmens'], ['object', 'Ritat']]),
      name('Del av filmen'), part,
      el('label', {className: 'check'}, lines, 'Visa spårens konturer (dagens röd, det styva kortets grön)')),
    group('Fart', choice(() => look.rate, v => { look.rate = v; video.playbackRate = v; }, [[1, '1×'], [0.5, '½'], [0.25, '¼']]),
      el('div', {className: 'btns seg'}, button('◀ ruta', () => go(shown - 1)), play, button('ruta ▶', () => go(shown + 1))),
      el('div', {className: 'btns seg'}, button('◀ skillnad', () => differs(-1)), button('skillnad ▶', () => differs(1)))),
    group('Storlek', choice(() => look.zoom, v => { look.zoom = v; }, [[1, 'Hela'], [3, 'Närbild'], [6, 'Nära']])),
    group('Det ritade kortet', range('Kortens storlek', () => look.scale, v => { look.scale = v; }, 0.8, 2, 0.05, '×', 2),
      el('p', {className: 'note', textContent: '1,2 är ett verkligt kort, det planen ritar. Det styva kortet har samma storlek i handen som när det ligger; dagens spår har filmens storlek i handen.'}),
      el('label', {className: 'check'}, blur, 'Rörelseoskärpa (prov): kortet suddas där det rör sig fort')),
    group('Landningen (prov)', choice(() => look.landing, v => { look.landing = v; }, [['idag', 'Som i dag'], ['prov', 'Kortet rör sig']]),
      range('Sätter sig', () => s.bump, v => { s.bump = v; }, 0, 5, 0.1, 'mm', 1), range('Under fingrarna', () => s.slide, v => { s.slide = v; }, 0, 10, 0.1, 'mm', 1),
      range('Vridet', () => s.turn, v => { s.turn = v; }, 0, 6, 0.1, '°', 1), range('Vägen tillbaka', () => s.frames, v => { s.frames = v; }, 2, 12, 1, 'rutor', 0),
      range('Tidigare, senare', () => s.shift, v => { s.shift = v; }, -8, 8, 1, 'rutor', 0),
      el('div', {className: 'btns'}, button('Förval', () => { Object.assign(s, SETTLE); }), button('Dubbelt', () => { Object.assign(s, {bump: SETTLE.bump * 2, slide: SETTLE.slide * 2, turn: SETTLE.turn * 2}); }), button('Stilla', () => { Object.assign(s, STILL); })),
      el('p', {className: 'note', textContent: 'Kortet ligger en aning förbi sin plats och lite vridet under fingrarna, sätter sig när det landar och går tillbaka till planens plats när handen lämnar det.'})));
  const sync = () => { for (const s of syncs) s(); };
  sync();
  return {sync, again};
})();

await open(film);
