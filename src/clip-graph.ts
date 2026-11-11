// Pure clip-bank graph for the lab. Nodes are anchor poses: IDLE, READY and one landing
// anchor per card (P4.C1, D.C2 ...). Every clip is one action, so every clip is one edge "A>B".
// Two more poses have a name: REVEAL(D.C2) is rest with the dealer's hole card turned open, and AWAY is the picture without the dealer.
// No DOM, network or file access here. Scout owns rules, order and card values; this only plans motion.

export type EdgeKind = 'DEAL' | 'RETURN' | 'ENTRY' | 'IDLE' | 'REVEAL' | 'ARRIVE' | 'LEAVE';
export type Side = 'BACK' | 'FRONT';
export type ImageRef = {frame?: {video: string; videoSha256: string; index: number}; file?: {path: string; sha256: string}; note?: string};
export type BankJob = {id: string; kind: string; target: string | null; from: string; to: string; model: string; duration: number; ratio: string; audio: boolean; promptText: string; first: ImageRef; last?: ImageRef; purpose: string; playbackSpeed?: number}; // without last: a film ordered from its first image alone
export type MotionRecord = {
  source?: {path?: string; sha256?: string; bytes?: number; fps?: number; frames?: number; width?: number; height?: number};
  // idle: how a take of IDLE>IDLE takes part in the idle. weight: its share among the takes that may be picked. calm: breathing and
  // the like, as opposed to a gesture. onRequest: never picked by chance. label: what it shows, in a word or two.
  motion?: {physicalEndSide?: string; landingFrame?: number; startsOn?: {clip?: string; frame?: number; seamPixelsOverThreshold?: number}; idle?: {weight?: number; calm?: boolean; onRequest?: boolean; label?: string}};
  review?: {decision?: string; acceptedAs?: string; basis?: string; limitations?: string; userReview?: string; userAccepted?: boolean};
};
export type Receipt = {status?: string; estimatedCredits?: number; requestedAt?: string; completedAt?: string; output?: {bytes?: number; fps?: number; frames?: number; width?: number; height?: number} | null};
// track and overrides: the card track from tools/track-card.ts and hand-written occlusion overrides, when they exist locally.
// reversed: the same film written backwards (source-reversed.mp4), when someone has made one.
export type Media = {video?: string | null; first?: string | null; last?: string | null; track?: string | null; overrides?: string | null; reversed?: string | null};
// A derived take is not generated: it is frames A–B (both shown) of a clip that already exists.
export type DerivedTake = {id: string; kind?: string; from: string; to: string; clip: string; frames: [number, number]; purpose?: string};
// An edit is a corrected copy of an existing clip, made with a video-to-video model: a further take of the same edge as its source.
export type EditTake = {id: string; source?: {clip?: string; sha256?: string}; model?: string; promptText?: string; purpose?: string};
export type BankData = {jobs?: BankJob[]; derived?: DerivedTake[]; edits?: EditTake[]; budget?: {maximumCredits?: number} | null; motions?: Record<string, MotionRecord>; receipts?: Record<string, Receipt>; media?: Record<string, Media>; revisions?: Record<string, string>};

export const SEATS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'];
// Same 16 placement keys as src/placement-model.ts; D.C3 is the optional third dealer card.
export const TARGETS = [...SEATS, 'D'].flatMap(p => [`${p}.C1`, `${p}.C2`]);
export const OPTIONAL_TARGETS = ['D.C3'];
// The hole card is turned open from rest, by a hand that goes back to rest: one film, IDLE>REVEAL(D.C2). The pose it ends in
// is rest, so whatever follows it starts from IDLE.
export const HOLE_CARD = 'D.C2';
export const REVEAL_NODE = `REVEAL(${HOLE_CARD})`;
export const REVEAL_EDGE = `IDLE>${REVEAL_NODE}`;
// AWAY is the picture without the dealer: table, shoe and background. She comes in and sits down (AWAY>IDLE) and she stands
// up and leaves (IDLE>AWAY); rest is the fixed end of both.
export const AWAY = 'AWAY';
export const ARRIVE_EDGE = `${AWAY}>IDLE`, LEAVE_EDGE = `IDLE>${AWAY}`;

// ── Notation ────────────────────────────────────────────────────────────────
// base is the edge of the 54-edge model; hub names the READY variant when the edge was written with one.
export type EdgeRef = {id: string; from: string; to: string; kind: EdgeKind; target: string | null; base: string; hub: string | null};
// READY may have named variants (READY-B: another hand pose at the shoe). They are the same hub in the
// graph: "READY-B>P4.C1" is a take of the edge READY>P4.C1 that starts from that other pose.
const HUB_VARIANT = /^READY-[A-Z0-9]{1,12}$/;
export const hubOf = (node: string): 'IDLE' | 'READY' | null => node === 'IDLE' || node === REVEAL_NODE ? 'IDLE' : node === 'READY' || HUB_VARIANT.test(node) ? 'READY' : null;
export const isHub = (node: string) => hubOf(node) !== null;
export const formatEdge = (from: string, to: string) => `${from}>${to}`;

// Accepts p4.c1, P4C1, LAND(P4.C1), RELEASE(P4.C1), READY-B, REVEAL(D.C2), AWAY and the older aliases VILA/REDO.
export function parseNode(text: unknown): string | null {
  if (typeof text !== 'string') return null;
  let s = text.trim().toUpperCase().replace(/\s+/g, '');
  const turned = /^REVEAL\((.+)\)$/.exec(s);
  if (turned) return parseNode(turned[1]) === HOLE_CARD ? REVEAL_NODE : null; // only the hole card is turned on the table
  const wrapped = /^(?:LAND|RELEASE)\((.+)\)$/.exec(s);
  if (wrapped) s = wrapped[1];
  if (s === 'IDLE' || s === 'VILA') return 'IDLE';
  if (s === 'READY' || s === 'REDO') return 'READY';
  if (s === AWAY || s === 'BORTA') return AWAY;
  if (HUB_VARIANT.test(s)) return s;
  const m = /^(P[1-7]|D)\.?C([1-3])$/.exec(s);
  if (!m || (m[2] === '3' && m[1] !== 'D')) return null;
  return `${m[1]}.C${m[2]}`;
}

export function edgeKind(from: string, to: string): EdgeKind | null {
  const a = hubOf(from), b = hubOf(to);
  if (to === REVEAL_NODE) return a === 'IDLE' ? 'REVEAL' : null; // the hole card is turned from rest only
  if (from === AWAY || to === AWAY) return from === AWAY ? (to === 'IDLE' ? 'ARRIVE' : null) : a === 'IDLE' ? 'LEAVE' : null; // she is away from rest and comes back to rest
  if (a === 'IDLE') return b === 'READY' ? 'ENTRY' : b === 'IDLE' ? 'IDLE' : null;
  if (a === 'READY') return b === 'IDLE' ? 'RETURN' : b === 'READY' ? null : 'DEAL'; // READY to READY, also between variants, is not a model edge
  return b ? 'RETURN' : null; // a card is only left towards a hub
}

export function parseEdge(text: unknown): EdgeRef | null {
  if (typeof text !== 'string') return null;
  const parts = text.replace(/->|→/g, '>').split('>');
  if (parts.length !== 2) return null;
  const from = parseNode(parts[0]), to = parseNode(parts[1]);
  if (!from || !to) return null;
  const kind = edgeKind(from, to);
  if (kind === 'REVEAL') return {id: formatEdge(from, to), from, to, kind, target: HOLE_CARD, base: REVEAL_EDGE, hub: null};
  if (kind === 'ARRIVE' || kind === 'LEAVE') return {id: formatEdge(from, to), from, to, kind, target: null, base: kind === 'ARRIVE' ? ARRIVE_EDGE : LEAVE_EDGE, hub: null};
  return kind ? {id: formatEdge(from, to), from, to, kind, target: !isHub(from) ? from : !isHub(to) ? to : null,
    base: formatEdge(hubOf(from) ?? from, hubOf(to) ?? to), hub: [from, to].find(n => HUB_VARIANT.test(n)) ?? null} : null;
}

// A node as the graph names it: a model node in canonical form, anything else upper-cased as written (an experiment's "DRAWN").
export const nodeName = (text: unknown): string => parseNode(text) ?? String(text ?? '').trim().toUpperCase().replace(/\s+/g, '');

// A round is edges joined by "|". "@<clip id>" after an edge pins one take, for example an accepted variant.
// An edge outside the model is accepted only when the caller knows it (an experiment edge of the graph).
export type SequenceStep = {from: string; to: string; take?: string};
export function parseSequence(text: string, known?: (id: string) => boolean): {steps: SequenceStep[]; errors: string[]} {
  const steps: SequenceStep[] = [], errors: string[] = [];
  for (const part of String(text).split(/[|\n;,]+/).map(p => p.trim()).filter(Boolean)) {
    const [edgeText, take, ...rest] = part.split('@').map(p => p.trim()), ends = edgeText.replace(/->|→/g, '>').split('>').map(nodeName);
    const edge = parseEdge(edgeText) ?? (ends.length === 2 && known?.(formatEdge(ends[0], ends[1])) ? {from: ends[0], to: ends[1]} : null);
    if (!edge || rest.length || (take !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(take))) errors.push(part);
    else steps.push({from: edge.from, to: edge.to, ...(take ? {take} : {})});
  }
  return {steps, errors};
}
export const formatSequence = (steps: {from: string; to: string; take?: string}[]) => steps.map(s => formatEdge(s.from, s.to) + (s.take ? `@${s.take}` : '')).join(' | ');

export function describeNode(node: string): string {
  if (node === 'IDLE') return 'Vila · båda händerna på bordet';
  if (node === REVEAL_NODE) return 'Vila · hålkortet vänt upp';
  if (node === AWAY) return 'Borta · bordet utan dealer';
  if (node === 'READY') return 'Redo · handen vid skon';
  if (hubOf(node) === 'READY') return `Redo, variant ${node.slice(6)} · annan handställning vid skon`;
  const [seat, card] = node.split('.');
  return `${seat === 'D' ? 'Dealer' : `Spelare ${seat[1]}`} · kort ${card[1]}`;
}
export function describeEdge(edge: {from: string; to: string; kind: EdgeKind | null; target: string | null}): string {
  if (edge.kind === 'REVEAL') return 'Hålkortet vänds upp: från vila och tillbaka till vila';
  if (edge.kind === 'ARRIVE') return 'Hon kommer in och sätter sig: från tomt bord till vila';
  if (edge.kind === 'LEAVE') return 'Hon reser sig och går: från vila till tomt bord';
  if (edge.kind === 'ENTRY') return 'Ingång: från vila till skon';
  if (edge.kind === 'IDLE') return 'Vila: stilla klipp som börjar och slutar i vila';
  if (edge.kind === 'DEAL') return `Giv från skon till ${describeNode(edge.target!).toLowerCase()}`;
  if (!edge.target) return 'Utgång: från skon tillbaka till vila';
  return `Retur från ${describeNode(edge.target).toLowerCase()} till ${edge.to === 'READY' ? 'skon' : 'vila'}`;
}

// ── Graph ───────────────────────────────────────────────────────────────────
export type Stage = 'WRITTEN' | 'PREPARED' | 'ORDERED' | 'DONE' | 'FAILED';
export type Status = 'MISSING' | 'PREPARED' | 'ORDERED' | 'UNREVIEWED' | 'ACCEPTED' | 'VARIANT' | 'REJECTED';
// hub: the READY variant a take was written with ("READY-B"), null for the plain model poses.
// A return starts in one of two ways. anchorStart: its first image is the landing anchor file, so it follows
// every take of the deal to that card, each played to its last frame. startsOn: its first image is one frame
// of one deal clip, so it follows only that take, which is cut at that frame.
export type Take = {
  id: string; edge: string; kind: EdgeKind | null; hub: string | null; job: BankJob; order: number; stage: Stage; decision: string;
  variant: boolean; explicitMain: boolean; endSide: Side | null; fps: number | null; frames: number | null; credits: number;
  startsOn: {clip: string | null; video: string | null; frame: number} | null; anchorStart: string | null; landingFrame: number | null; landingConflict: boolean;
  segment: {clip: string; start: number; end: number} | null; // set on a derived take: the frames of that clip it shows
  revision: string | null; // of its motions record; a review decision must present it to be saved. null: no record yet
  idle: Idle | null;       // set on a take of IDLE>IDLE: its part in the idle
  editOf: string | null;   // set on a corrected copy: the clip it was made from
  speed: number;           // the speed the film is meant to be watched at (a clip generated in slow motion says 2); frame numbers stay the file's
  motion: MotionRecord | null; receipt: Receipt | null; media: Media;
};
// The idle is many short clips that all begin and end on the same frame. Breathing dominates, gestures are rare.
export type Idle = {weight: number; calm: boolean; onRequest: boolean; label: string};
export const IDLE_WEIGHT = {calm: 20, gesture: 3};
const IDLE_WORDS: [RegExp, string][] = [[/deep-breath/, 'djupt andetag'], [/breath/, 'andning'], [/hand-resettle/, 'handen läggs om'], [/glance/, 'blick åt sidan'], [/smile/, 'leende'], [/stretch/, 'sträcker på sig'], [/scratch/, 'kliar sig'], [/coffee/, 'kaffe'], [/loop/, 'lugn vila']];
// Without a word in the record, only the plain loop counts as calm; every other idle take is a gesture until its record says otherwise.
function idleOf(id: string, motion: MotionRecord | null): Idle {
  const said = motion?.motion?.idle, calm = typeof said?.calm === 'boolean' ? said.calm : /-idle-loop-/.test(id), weight = Number(said?.weight);
  return {calm, weight: Number.isFinite(weight) && weight >= 0 ? weight : calm ? IDLE_WEIGHT.calm : IDLE_WEIGHT.gesture, onRequest: said?.onRequest === true,
    label: typeof said?.label === 'string' && said.label.trim() ? said.label.trim() : IDLE_WORDS.find(([word]) => word.test(id))?.[1] ?? ''};
}
// experiment: a job whose from/to is outside the model. It keeps its takes and detail view but is never one of the 54.
// rendering: takes of this edge that are ordered and not back yet, whether or not the edge already has a main take.
// shares: in seat mode, the edge whose film this edge plays (READY>P4.C2 plays READY>P4.C1). Its own takes stay listed; they are only played when a round names one.
export type Edge = Omit<EdgeRef, 'kind'> & {kind: EdgeKind | null; optional: boolean; experiment: boolean; shares: string | null; takes: Take[]; main: Take | null; variants: Take[]; status: Status; hasVariant: boolean; hubVariants: string[]; inProgress: number; rendering: number};
export type Count = {total: number; done: number; byStatus: Record<Status, number>};
// One film per seat (Jakob's decision 2026-11-11) or one film per card. In seat mode a seat's second card has no film of its own:
// it plays the films of the first card, with the rendered card drawn at its own place.
export type FilmMode = 'SEAT' | 'CARD';
export const FILM_MODE: FilmMode = 'SEAT';
// The films the mode needs. candidates: the main take is unreviewed or accepted. flaws: the main take is a secondary
// alternative with known faults. missing: no film that may be played (none, or only rejected ones).
export type Films = {mode: FilmMode; total: number; done: number; candidates: number; flaws: number; missing: number; required: string[]};
export type Graph = {
  edges: Edge[]; experiments: Edge[]; edge: Record<string, Edge>; takes: Record<string, Take>; unplaced: {id: string; reason: string}[]; mode: FilmMode;
  summary: Count & {optional: Count; experiments: Count; films: Films; credits: {committed: number | null; maximum: number | null}};
};

export const STATUSES: Status[] = ['ACCEPTED', 'UNREVIEWED', 'VARIANT', 'ORDERED', 'PREPARED', 'REJECTED', 'MISSING'];
export const STATUS_LABEL: Record<Status, string> = {MISSING: 'saknas', PREPARED: 'förberedd', ORDERED: 'renderas', UNREVIEWED: 'klar, ogranskad', ACCEPTED: 'godkänd', VARIANT: 'bara variant', REJECTED: 'underkänd'};
export const STAGE_LABEL: Record<Stage, string> = {WRITTEN: 'jobb skrivet', PREPARED: 'förberedd', ORDERED: 'renderas', DONE: 'klar', FAILED: 'misslyckad'};
export const DECISION_LABEL: Record<string, string> = {PENDING: 'väntar på granskning', ACCEPTED: 'godkänd', REJECTED: 'underkänd', SECONDARY: 'sekundärt alternativ'};
const CREDITS_PER_SECOND: Record<string, number> = {auto_1080p: 20, auto_720p: 10, auto_480p: 5};

// The 54 edges of the bank (entry, exit, the idle clip, the turn of the hole card, her coming to the table and her leaving
// it, then 16 cards × deal, return to READY, return to IDLE) followed by the three optional D.C3 edges.
export function bankEdges(): EdgeRef[] {
  return ['IDLE>READY', 'READY>IDLE', 'IDLE>IDLE', REVEAL_EDGE, ARRIVE_EDGE, LEAVE_EDGE, ...[...TARGETS, ...OPTIONAL_TARGETS].flatMap(t => [`READY>${t}`, `${t}>READY`, `${t}>IDLE`])].map(id => parseEdge(id)!);
}

export const clipOfVideo = (video: unknown): string | null => typeof video === 'string' ? /^assets\/motions\/([a-z0-9-]+)\/source\.mp4$/.exec(video)?.[1] ?? null : null;
export const playable = (take: Take) => take.stage === 'DONE' && take.decision !== 'REJECTED';
// Does this return continue that deal take without a jump? A return cut from a frame fits the clip it was cut
// from. A return from a landing anchor fits every deal that ends on that same anchor image: variant B deals
// end on their own anchor, so their returns do not fit the model's deals and the other way round.
// Was this film cut out of that deal? Its first frame is a frame of the deal's own film: the deal itself, the clip a corrected copy
// was made from, or, for a derived deal (frames A–B of a longer film), a frame of that film inside the deal's range or the one right after it.
export function cutFrom(back: Take, deal: Take): boolean {
  const s = back.startsOn;
  if (!s?.clip) return false;
  if (deal.segment && (s.clip === deal.segment.clip || s.clip === deal.id)) return s.frame > deal.segment.start && s.frame <= deal.segment.end + 1;
  return s.clip === deal.id || s.clip === deal.editOf;
}
export function returnFits(back: Take, deal: Take): boolean {
  // A corrected copy keeps its source's timing and landing, so the returns cut from the source follow the copy too.
  if (!back.anchorStart) return cutFrom(back, deal);
  const end = deal.job.last?.file, start = back.job.first?.file;
  return !!end && (end.path === back.anchorStart || (!!end.sha256 && end.sha256 === start?.sha256));
}

function stageOf(receipt: Receipt | null, motion: MotionRecord | null, media: Media): Stage {
  const s = receipt?.status;
  if (s === 'SUCCEEDED') return 'DONE';
  if (s === 'FAILED' || s === 'CANCELLED') return 'FAILED';
  if (s && s !== 'PREPARED') return 'ORDERED'; // SUBMITTING, PENDING, RUNNING, THROTTLED: a request may have been sent
  // Receipts are local only. A registered motion or a present film proves the clip exists.
  if (!s && (Number.isInteger(motion?.source?.frames) || media.video)) return 'DONE';
  return s === 'PREPARED' ? 'PREPARED' : 'WRITTEN';
}
// Explicit main > accepted > unreviewed > unknown decision > secondary > variant. Rejected takes are never chosen.
const rank = (t: Take) => t.explicitMain ? 5 : t.variant ? 0 : t.decision === 'ACCEPTED' ? 4 : t.decision === 'PENDING' ? 3 : t.decision === 'SECONDARY' ? 1 : 2;
function best(takes: Take[], ...keys: ((t: Take) => number)[]): Take | null {
  return takes.filter(playable).sort((a, b) => { for (const key of keys) { const d = key(b) - key(a); if (d) return d; } return b.order - a.order; })[0] ?? null;
}

const KINDS = ['DEAL', 'RETURN', 'ENTRY', 'IDLE', 'REVEAL', 'ARRIVE', 'LEAVE'];
export function buildGraph(data: BankData, options: {mode?: FilmMode; holeCardDown?: boolean} = {}): Graph {
  const blank = (ref: Omit<EdgeRef, 'kind'> & {kind: EdgeKind | null}, experiment: boolean): Edge => ({...ref, optional: !!ref.target && OPTIONAL_TARGETS.includes(ref.target), experiment, shares: null, takes: [], main: null, variants: [], status: 'MISSING', hasVariant: false, hubVariants: [], inProgress: 0, rendering: 0});
  const edges: Edge[] = bankEdges().map(e => blank(e, false)), experiments: Edge[] = [];
  const edge: Record<string, Edge> = Object.fromEntries(edges.map(e => [e.id, e]));
  const takes: Record<string, Take> = {}, unplaced: {id: string; reason: string}[] = [], segments = new Map<string, {clip: string; start: number; end: number}>();
  // A derived take enters as a job without prompt or cost whose images are the first and last frame of its range.
  const derived = (Array.isArray(data?.derived) ? data.derived : []).flatMap((d): BankJob[] => {
    const [start, end] = Array.isArray(d?.frames) ? d.frames : [], video = `assets/motions/${d?.clip}/source.mp4`;
    if (!d || typeof d.id !== 'string' || !/^[a-z0-9-]+$/.test(String(d.clip)) || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) { unplaced.push({id: String(d?.id), reason: 'Utsnittet saknar klipp eller giltiga rutor.'}); return []; }
    segments.set(d.id, {clip: d.clip, start, end});
    return [{id: d.id, kind: d.kind ?? '', target: null, from: d.from, to: d.to, model: 'utsnitt', duration: 0, ratio: '', audio: false, promptText: '', purpose: d.purpose ?? '',
      first: {frame: {video, videoSha256: '', index: start}}, last: {frame: {video, videoSha256: '', index: end}}}];
  });
  // A corrected copy enters as its source's job under its own id, with its own model, prompt and purpose: same edge, same images.
  const sources = new Map((Array.isArray(data?.jobs) ? data.jobs : []).filter(j => j && typeof j.id === 'string').map(j => [j.id, j])), editOf = new Map<string, string>();
  const edits = (Array.isArray(data?.edits) ? data.edits : []).flatMap((x): BankJob[] => {
    const source = sources.get(String(x?.source?.clip));
    if (!x || typeof x.id !== 'string' || !source) { unplaced.push({id: String(x?.id), reason: 'Den rättade kopians källklipp finns inte bland jobben.'}); return []; }
    editOf.set(x.id, source.id);
    return [{...source, id: x.id, model: x.model ?? source.model, promptText: x.promptText ?? '', purpose: x.purpose ?? ''}];
  });
  [...(Array.isArray(data?.jobs) ? data.jobs : []), ...derived, ...edits].forEach((job, order) => {
    // Only a job that cannot be told apart from the others is left out, and it is named in unplaced.
    if (!job || typeof job.id !== 'string' || !job.id || takes[job.id]) { unplaced.push({id: String(job?.id), reason: job && takes[job.id] ? 'Samma jobb-id förekommer två gånger.' : 'Jobbet saknar id.'}); return; }
    const ref = parseEdge(`${job.from}>${job.to}`), from = nodeName(job.from), to = nodeName(job.to), key = formatEdge(from, to);
    let e = ref ? edge[ref.base] : edge[key];
    // A from/to outside the model is kept as an experiment edge under its own notation, never dropped.
    if (!e) { e = blank({id: key, from, to, kind: KINDS.includes(job.kind) ? job.kind as EdgeKind : null, target: null, base: key, hub: null}, true); edge[key] = e; experiments.push(e); }
    const motion = data.motions?.[job.id] ?? null, receipt = data.receipts?.[job.id] ?? null, media = data.media?.[job.id] ?? {};
    const decision = String(motion?.review?.decision ?? 'PENDING').toUpperCase().replace('APPROVED', 'ACCEPTED');
    const segment = segments.get(job.id) ?? null, frame = segment ? undefined : job.first?.frame, seam = motion?.motion?.startsOn; // a derived take was not cut to follow anything
    const anchorStart = e.kind === 'RETURN' && !frame && typeof job.first?.file?.path === 'string' ? job.first.file.path : null;
    // Any film whose first image is a frame of another clip starts on that frame, whatever its kind.
    const startsOn = frame && Number.isInteger(frame.index) ? {clip: clipOfVideo(frame.video), video: frame.video, frame: frame.index}
      : e.kind === 'RETURN' && !anchorStart && seam?.clip && Number.isInteger(seam.frame) ? {clip: seam.clip, video: null, frame: seam.frame!} : null;
    const endSide = motion?.motion?.physicalEndSide === 'BACK' || motion?.motion?.physicalEndSide === 'FRONT' ? motion.motion.physicalEndSide : null;
    const take: Take = {id: job.id, edge: e.id, kind: e.kind, hub: ref && !e.experiment ? ref.hub : null, job, order, stage: stageOf(receipt, motion, media), decision,
      variant: motion?.review?.acceptedAs === 'VARIANT', explicitMain: motion?.review?.acceptedAs === 'MAIN', endSide,
      fps: motion?.source?.fps ?? receipt?.output?.fps ?? null, frames: motion?.source?.frames ?? receipt?.output?.frames ?? null,
      credits: receipt?.estimatedCredits ?? job.duration * (CREDITS_PER_SECOND[job.ratio] ?? 0), startsOn, anchorStart, landingFrame: null, landingConflict: false, segment, revision: data.revisions?.[job.id] ?? null,
      idle: e.id === 'IDLE>IDLE' ? idleOf(job.id, motion) : null, editOf: editOf.get(job.id) ?? null, speed: Number(job.playbackSpeed) >= 0.25 && Number(job.playbackSpeed) <= 4 ? Number(job.playbackSpeed) : 1, motion, receipt, media};
    takes[job.id] = take; e.takes.push(take);
  });
  const all = Object.values(takes);
  // A deal's landing/cut frame is the frame its returns start on. An explicit motion.landingFrame wins.
  for (const deal of all.filter(t => t.kind === 'DEAL')) {
    const returns = all.filter(r => r !== deal && cutFrom(r, deal)), kept = returns.filter(r => r.decision !== 'REJECTED' && r.stage !== 'FAILED');
    const frames = (kept.length ? kept : returns).map(r => r.startsOn!.frame), explicit = deal.motion?.motion?.landingFrame;
    const counts = new Map<number, number>(); for (const f of frames) counts.set(f, (counts.get(f) ?? 0) + 1);
    deal.landingFrame = Number.isInteger(explicit) ? explicit! : [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    deal.landingConflict = counts.size > 1;
  }
  // Main deal first: a deal that already has a playable return that fits it wins among equals.
  // A return's main is one that continues the main deal, so the default chain is seamless.
  const backs = all.filter(r => r.kind === 'RETURN' && playable(r));
  // Takes written with a READY variant are offered beside the edge; status and main take follow the plain model poses.
  const plain = (e: Edge) => e.takes.filter(t => !t.hub);
  for (const e of edges.filter(e => e.kind === 'DEAL')) e.main = best(plain(e), rank, t => backs.some(r => edge[r.edge].from === e.to && returnFits(r, t)) ? 1 : 0);
  for (const e of edges.filter(e => e.kind !== 'DEAL')) {
    const deal = e.kind === 'RETURN' && e.target ? edge[`READY>${e.target}`]?.main : null;
    e.main = best(plain(e), t => t.explicitMain ? 1 : 0, t => deal && returnFits(t, deal) ? 1 : 0, rank);
  }
  // The idle step of a round is the calmest film there is, not the newest: an explicit main or an accepted take first, as everywhere;
  // then a calm take before a gesture, the highest weight, and the older take on a tie.
  edge['IDLE>IDLE'].main = best(plain(edge['IDLE>IDLE']), t => t.explicitMain ? 1 : 0, t => t.decision === 'ACCEPTED' && !t.variant ? 1 : 0, t => t.idle?.calm ? 1 : 0, t => t.idle?.weight ?? 0, t => -t.order);
  for (const e of experiments) e.main = best(e.takes, rank);
  for (const e of [...edges, ...experiments]) {
    const own = plain(e);
    e.hubVariants = [...new Set(e.takes.flatMap(t => t.hub ? [t.hub] : []))];
    e.variants = own.filter(t => playable(t) && t.variant && t !== e.main);
    e.hasVariant = e.variants.length > 0;
    e.inProgress = own.filter(t => t.stage === 'WRITTEN' || t.stage === 'PREPARED' || t.stage === 'ORDERED').length;
    e.rendering = e.takes.filter(t => t.stage === 'ORDERED').length;
    e.status = e.main ? (e.main.variant ? 'VARIANT' : e.main.decision === 'ACCEPTED' ? 'ACCEPTED' : 'UNREVIEWED')
      : own.some(t => t.stage === 'ORDERED') ? 'ORDERED' : own.some(t => t.stage === 'PREPARED' || t.stage === 'WRITTEN') ? 'PREPARED'
      : own.some(t => t.stage === 'DONE') ? 'REJECTED' : 'MISSING';
  }
  const count = (list: Edge[]): Count => ({total: list.length, done: list.filter(e => e.main).length,
    byStatus: Object.fromEntries(STATUSES.map(s => [s, list.filter(e => e.status === s).length])) as Record<Status, number>});
  const sent = all.filter(t => t.receipt?.status && t.receipt.status !== 'PREPARED');
  // Seat mode: a second card that ends on the same side as the first shares the first card's three films, and is not a film to make.
  const mode = options.mode ?? FILM_MODE;
  if (mode === 'SEAT') for (const e of edges) { const card = e.target && e.kind !== 'REVEAL' ? filmCard(e.target, options.holeCardDown !== false) : null; if (card && card !== e.target) e.shares = e.id.replace(e.target!, card); }
  // A hole card that is dealt open is never turned, so that round needs no film for it.
  const required = edges.filter(e => !e.optional && !e.shares && !(e.kind === 'REVEAL' && options.holeCardDown === false)), flawed = (e: Edge) => e.main?.decision === 'SECONDARY';
  const films: Films = {mode, total: required.length, done: required.filter(e => e.main).length, candidates: required.filter(e => e.main && !flawed(e)).length, flaws: required.filter(flawed).length,
    missing: required.filter(e => !e.main).length, required: required.map(e => e.id)};
  return {edges, experiments, edge, takes, unplaced, mode, summary: {...count(edges.filter(e => !e.optional)), optional: count(edges.filter(e => e.optional)), experiments: count(experiments), films,
    credits: {committed: all.some(t => t.receipt) ? sent.reduce((sum, t) => sum + t.credits, 0) : null, maximum: data?.budget?.maximumCredits ?? null}}};
}

// The returns that can follow one deal take: those cut to one of its frames and those starting from the landing anchor.
export function returnsOf(graph: Graph, deal: Take): {frame: Take[]; anchor: Take[]} {
  // Every return that leaves the card this deal lands on, in the model or among the experiments.
  const card = graph.edge[deal.edge]?.to, list = Object.values(graph.takes).filter(r => r.kind === 'RETURN' && graph.edge[r.edge].from === card && r.decision !== 'REJECTED' && r.stage !== 'FAILED');
  return {frame: list.filter(r => !r.anchorStart && returnFits(r, deal)), anchor: list.filter(r => r.anchorStart && returnFits(r, deal))};
}

export type Role = 'MAIN' | 'VARIANT' | 'START' | 'REJECTED' | 'FAILED' | 'WAITING' | 'OTHER';
export function takeRole(edge: Edge, take: Take): Role {
  if (take === edge.main) return 'MAIN';
  if (take.stage === 'FAILED') return 'FAILED';
  if (take.stage !== 'DONE') return 'WAITING';
  return take.decision === 'REJECTED' ? 'REJECTED' : take.hub ? 'START' : take.variant ? 'VARIANT' : 'OTHER';
}
export const ROLE_LABEL: Record<Role, string> = {MAIN: 'huvudtagning', VARIANT: 'variant', START: 'variant-start', REJECTED: 'underkänd', FAILED: 'misslyckad', WAITING: 'inte klar', OTHER: 'alternativ'};

// What matters now on an edge: its main take, accepted variants, variant starts and work on its way.
// The rest (rejected, failed, replaced by a newer take) is kept, but belongs folded away.
// A corrected copy that nobody has reviewed yet is current too: it was made to be looked at, even while its source is still the main take.
export const isCurrent = (edge: Edge, take: Take) => { const role = takeRole(edge, take); return !['REJECTED', 'FAILED', 'OTHER'].includes(role) || (role === 'OTHER' && !!take.editOf && take.decision === 'PENDING'); };
export type Leftover = {take: Take; edge: Edge; role: Role; bytes: number | null};
export function leftovers(graph: Graph): Leftover[] {
  return [...graph.edges, ...graph.experiments].flatMap(edge => edge.takes.filter(take => !isCurrent(edge, take))
    .map(take => ({take, edge, role: takeRole(edge, take), bytes: take.receipt?.output?.bytes ?? take.motion?.source?.bytes ?? null})));
}

// Experiments read as chains: READY-B > DRAWN > P4.C1 is two films played after each other, and a deal
// written from a READY variant is a chain of one film. target is the card a chain ends on, if it does.
export type Chain = {nodes: string[]; steps: Step[]; target: string | null};
export function experimentChains(graph: Graph): Chain[] {
  const cards = [...TARGETS, ...OPTIONAL_TARGETS], chains: Chain[] = [];
  // Links are the experiment edges that lead somewhere and the model edges that have a take written with a READY variant.
  const links: Step[] = [...graph.experiments.filter(e => e.from !== e.to).map(e => ({from: e.from, to: e.to})),
    ...graph.edges.flatMap(e => e.hubVariants.map(hub => ({from: e.from === 'READY' ? hub : e.from, to: e.to === 'READY' ? hub : e.to})))];
  // A chain runs from one rest pose to the next: READY and its variants, IDLE and anything named after it.
  const rests = (node: string) => hubOf(node) !== null || node.startsWith('IDLE');
  const grow = (path: Step[]) => {
    const tail = path[path.length - 1].to, next = rests(tail) ? [] : links.filter(link => link.from === tail && !path.includes(link));
    if (next.length && path.length < 6) { for (const link of next) grow([...path, link]); return; }
    const nodes = [path[0].from, ...path.map(step => step.to)], target = [...nodes].reverse().find(node => cards.includes(node)) ?? null;
    if (chains.length < 12 && (path.length > 1 || target)) chains.push({nodes, steps: path, target});
  };
  for (const head of links.filter(link => rests(link.from) || !links.some(other => other.to === link.from))) grow([head]);
  return chains;
}

// ── Idle ────────────────────────────────────────────────────────────────────
// The rules, borrowed as they are: a weighted pick among the takes; never the same clip twice in a row; at least three calm
// clips between two gestures; rejected takes and takes marked on request are never picked by chance. Unreviewed takes may be picked.
export const IDLE_RULE = {calmBetweenGestures: 3, exitRate: 2.5, skipStart: 3, skipEnd: 3};
export type IdlePick = {take: Take; why: string};
export function pickIdle(takes: Take[], played: string[], random: number): IdlePick | null {
  const pool = takes.filter(t => t.idle && playable(t) && !t.idle.onRequest && t.idle.weight > 0 && !!t.media.video), last = played[played.length - 1];
  if (!pool.length) return null;
  const calmOf = (id: string) => takes.find(t => t.id === id)?.idle?.calm !== false; // a clip that is no longer known counts as calm
  let since = 0; for (let i = played.length - 1; i >= 0 && calmOf(played[i]); i--) since++;
  const gestureDue = since >= IDLE_RULE.calmBetweenGestures && played.some(id => !calmOf(id)) || (since >= IDLE_RULE.calmBetweenGestures && since === played.length);
  const fresh = pool.filter(t => t.id !== last), calm = (list: Take[]) => list.filter(t => t.idle!.calm);
  // What may come now, most wanted rule first; each later line gives up one rule only when nothing is left otherwise.
  const [allowed, note] = gestureDue && fresh.length ? [fresh, ''] : calm(fresh).length ? [calm(fresh), ''] : calm(pool).length ? [calm(pool), 'enda lugna klippet, så det går igen'] : fresh.length ? [fresh, 'inget lugnt klipp finns'] : [pool, 'enda klippet'];
  const total = allowed.reduce((sum, t) => sum + t.idle!.weight, 0); let at = Math.min(0.999999, Math.max(0, random)) * total, take = allowed[allowed.length - 1];
  for (const t of allowed) { if (at < t.idle!.weight) { take = t; break; } at -= t.idle!.weight; }
  const share = `${Math.round(100 * take.idle!.weight / total)} % chans`;
  const why = note || (take.idle!.calm ? gestureDue ? `lugnt klipp · en gest hade fått komma · ${share}` : `lugnt klipp · ${since < IDLE_RULE.calmBetweenGestures ? `${IDLE_RULE.calmBetweenGestures - since} lugna kvar till nästa gest` : share}` : `gest · ${since} lugna klipp har gått · ${share}`);
  return {take, why};
}
// The frames of an idle clip that are played: a generated clip is brighter in its first frames and jumps in its last two.
export const idleRange = (frames: number): {start: number; end: number} => ({start: Math.min(IDLE_RULE.skipStart, Math.max(0, frames - 1)), end: Math.max(Math.min(IDLE_RULE.skipStart, Math.max(0, frames - 1)) + 1, frames - IDLE_RULE.skipEnd)});
// Leaving the idle to deal: a calm clip is cut at once; a gesture is played out faster, so that it lands, and then the entry starts.
export const idleExit = (take: Take): 'CUT' | 'FINISH_FAST' => take.idle?.calm === false ? 'FINISH_FAST' : 'CUT';

// ── Round ───────────────────────────────────────────────────────────────────
export type RoundOptions = {seats: string[]; dealer?: boolean; cards?: number; reveal?: boolean; thirdDealerCard?: boolean};
// Standard initial deal in table order: one card to each seat and the dealer, then the second.
// Every deal returns to READY except the last, which returns to IDLE. The hole card is turned and a
// third dealer card is drawn after the players have acted, so both start again from IDLE.
export function roundSequence(options: RoundOptions): EdgeRef[] {
  const seats = SEATS.filter(s => options.seats.includes(s)), dealer = options.dealer !== false, cards = options.cards === 1 ? 1 : 2;
  const deals: string[] = [];
  for (let card = 1; card <= cards; card++) { for (const seat of seats) deals.push(`${seat}.C${card}`); if (dealer) deals.push(`D.C${card}`); }
  if (!deals.length) return [];
  const ids = ['IDLE>READY', ...deals.flatMap((t, i) => [`READY>${t}`, `${t}>${i === deals.length - 1 ? 'IDLE' : 'READY'}`])];
  if (options.reveal && dealer && cards === 2) ids.push(REVEAL_EDGE);
  if (options.thirdDealerCard && dealer) ids.push('IDLE>READY', 'READY>D.C3', 'D.C3>IDLE');
  return ids.map(id => parseEdge(id)!);
}
// D.C2 is the hole card and stays closed unless the round says otherwise; every other card is turned open.
export const wantedSide = (target: string, holeCardDown = true): Side => target === 'D.C2' && holeCardDown ? 'BACK' : 'FRONT';

// The card whose films a card plays in seat mode. The rule is the side, not the name: a second card shares the first card's films
// only when it ends on the same side. The dealer's hole card stays closed while the first dealer card is turned, so it keeps its own.
export function filmCard(target: string, holeCardDown = true): string {
  const [seat, card] = target.split('.');
  return card === 'C2' && wantedSide(target, holeCardDown) === wantedSide(`${seat}.C1`, holeCardDown) ? `${seat}.C1` : target;
}

export type Step = {from: string; to: string; take?: string};
export type Gap = 'INVALID' | 'MISSING' | 'WAITING' | 'REJECTED' | 'LOCAL_ONLY';
export const GAP_LABEL: Record<Gap, string> = {INVALID: 'ogiltig kant', MISSING: 'saknas', WAITING: 'inte klar', REJECTED: 'underkänd', LOCAL_ONLY: 'finns bara lokalt'};
// start/end are source frames; end is exclusive and null means "play to the last frame".
// cut says how a deal ends: FRAME = at the frame its return starts on, END = at its last frame because the
// return starts from the landing anchor, null = not a deal or nothing known.
// film: the edge whose film the step plays; in seat mode a second card's step plays the seat edge. shift: how far the rendered
// card is then moved from the film's own card to this step's card, in the pixels of the places the caller gave.
export type Segment = {index: number; id: string; from: string; to: string; kind: EdgeKind | null; edge: Edge | null; film: Edge | null; shift: {x: number; y: number} | null; take: Take | null; video: string | null; fps: number; start: number; end: number | null; cut: 'FRAME' | 'END' | null; gap: Gap | null; side: Side | null; notes: string[]};

// Chooses one take per step and the frame range to play. A return prefers a take that continues the
// deal chosen just before it. The deal is then cut by the anchor rule: at the frame a frame-started
// return begins on, or at its own last frame when the return starts from the landing anchor.
// places: each card's centre in film pixels (the placement plan); it gives a shared step its shift.
export function resolveRound(graph: Graph, steps: Step[], options: {holeCardDown?: boolean; places?: Record<string, {x: number; y: number}> | null} = {}): Segment[] {
  const out: Segment[] = [];
  steps.forEach((step, index) => {
    // A model edge in any spelling, or an experiment edge under the exact name the graph gave it.
    const id = formatEdge(step.from, step.to), ref = parseEdge(id), found = graph.edge[ref?.base ?? id], e = found && (ref || found.experiment) ? found : null, prev = out[index - 1], notes: string[] = [];
    // The turn of the hole card ends in rest, so a step from IDLE continues it.
    if (prev && prev.to !== step.from && !(hubOf(prev.to) === 'IDLE' && hubOf(step.from) === 'IDLE')) notes.push(`Bryter kedjan: föregående steg slutar i ${prev.to}.`);
    const seg: Segment = {index, id, from: step.from, to: step.to, kind: e?.kind ?? null, edge: e, film: e, shift: null, take: null, video: null, fps: 30, start: 0, end: null, cut: null, gap: null, side: null, notes};
    out.push(seg);
    if (!e) { seg.gap = 'INVALID'; notes.push('Kanten finns inte i klippbanken.'); return; }
    seg.side = e.kind === 'REVEAL' ? 'FRONT' : e.kind === 'DEAL' && e.target ? wantedSide(e.target, options.holeCardDown !== false) : null;
    // A step written with a READY variant only uses takes made from that pose; a plain step never does.
    // Seat mode: the step plays the seat's film unless it names a film of its own card.
    const film = e.shares && !(step.take && e.takes.some(t => t.id === step.take && playable(t))) ? graph.edge[e.shares] : e;
    if (film !== e) { seg.film = film; const a = options.places?.[film.target!], b = options.places?.[e.target!];
      if (a && b && [a.x, a.y, b.x, b.y].every(Number.isFinite)) seg.shift = {x: b.x - a.x, y: b.y - a.y}; else notes.push('Kortets flytt är okänd utan placeringsplan: det renderade kortet ritas där filmens kort ligger.'); }
    const hub = ref?.hub ?? null, pool = film.takes.filter(t => t.hub === hub), main = hub ? best(pool, rank) : film.main;
    const after = prev?.take && prev.kind === 'DEAL' && prev.to === step.from ? prev.take : null;
    let take = step.take ? film.takes.find(t => t.id === step.take && playable(t)) ?? null : null;
    if (step.take && !take) notes.push(`Låst tagning ${step.take} kan inte spelas här; huvudtagningen används.`);
    if (!take && e.kind === 'DEAL' && main?.endSide && main.endSide !== seg.side) take = best(pool.filter(t => t.endSide === seg.side), rank);
    if (!take && after) take = best(pool.filter(t => returnFits(t, after)), rank);
    take ??= main;
    if (!take) { seg.gap = pool.some(t => t.stage === 'ORDERED' || t.stage === 'PREPARED' || t.stage === 'WRITTEN') ? 'WAITING' : pool.some(t => t.stage === 'DONE') ? 'REJECTED' : 'MISSING'; return; }
    seg.take = take; seg.fps = take.fps ?? 30; seg.video = take.media.video ?? null;
    if (take.segment) { seg.start = take.segment.start; seg.end = take.frames !== null && take.segment.end >= take.frames - 1 ? null : take.segment.end + 1; } // a derived take shows only its own frames
    // A turn runs from rest to rest like an idle clip, and her coming and leaving have rest at one end: a generated film is brighter in its first frames and jumps in its last two, so they are not played.
    if (e.kind === 'REVEAL' || e.kind === 'ARRIVE' || e.kind === 'LEAVE') { const last = seg.end ?? take.frames; seg.start += IDLE_RULE.skipStart; if (last !== null && last - IDLE_RULE.skipEnd > seg.start) seg.end = last - IDLE_RULE.skipEnd; }
    if (!seg.video) seg.gap = 'LOCAL_ONLY';
    if (seg.side && take.endSide && take.endSide !== seg.side) notes.push(`Tagningen slutar med ${take.endSide === 'BACK' ? 'stängt (gult)' : 'öppet (blått)'} kort; rundan vill ha ${seg.side === 'BACK' ? 'stängt' : 'öppet'}.`);
    if (after && !returnFits(take, after)) notes.push(take.anchorStart ? `Skarv: returen startar från ett annat landningsankare än given ${after.id} slutar på.`
      : `Skarv: returen startar på ${take.startsOn?.clip ?? 'en annan film'}, inte på föregående giv ${after.id}.`);
  });
  out.forEach((seg, i) => {
    if (!seg.take) return;
    const film = seg.take, next = out[i + 1], follower = next?.take && next.from === seg.to ? next.take : null, known = returnsOf(graph, film);
    const usable = (frame: number | null | undefined): frame is number => typeof frame === 'number' && frame > seg.start && (film.frames === null || frame < film.frames) && (seg.end === null || frame <= seg.end);
    // Any film is cut where the film after it was cut out of it. Beyond that only a deal has a rule.
    const own = follower?.startsOn && (follower.startsOn.clip === film.id || follower.startsOn.clip === film.segment?.clip || follower.startsOn.clip === film.editOf) ? follower.startsOn.frame : null;
    if (seg.kind !== 'DEAL') { if (usable(own)) { seg.end = own; seg.cut = 'FRAME'; } return; }
    // The return that follows decides. Without one in the chain, the deal ends as its known returns would cut it.
    const back = follower && next.kind === 'RETURN' ? follower : null, viaAnchor = back ? !!back.anchorStart && returnFits(back, film) : known.anchor.some(playable);
    const frame = own ?? (viaAnchor ? null : film.landingFrame);
    if (usable(frame)) { seg.end = frame; seg.cut = 'FRAME'; }
    else if (viaAnchor) seg.cut = 'END';
    else if (!seg.edge?.experiment) seg.notes.push('Landningsrutan är okänd; given spelas till sista rutan.');
  });
  return out;
}

// ── Job drafts for missing edges ────────────────────────────────────────────
// Never written anywhere by the lab: ordering is a paid, CLI-only step (tools/clip-job.ts).
const TODO_SHA = 'TODO: sha256 of this file';
const PLACE: Record<string, {deal: string; spot: string; lies: string}> = {
  P1: {deal: 'to the far left of the image', spot: 'far-left', lies: 'at the far left of the image'},
  P2: {deal: 'to the left side of the image', spot: 'left', lies: 'at the left side of the image'},
  P3: {deal: 'slightly left of centre in the image', spot: 'centre-left', lies: 'slightly left of centre in the image'},
  P4: {deal: 'directly in front, centred in the image', spot: 'centre', lies: 'in front of her'},
  P5: {deal: 'slightly right of centre in the image', spot: 'centre-right', lies: 'slightly right of centre in the image'},
  P6: {deal: 'to the right side of the image', spot: 'right', lies: 'at the right side of the image'},
  P7: {deal: 'to the right side of the image, just in front of the shoe', spot: 'far-right', lies: 'at the right side of the image, just in front of the shoe'},
  D: {deal: 'to her own dealer position, close in front of her at the centre of the table', spot: 'dealer', lies: 'close in front of her at the centre of the table'},
};
const SCENE = 'Locked camera on the same Pamela, black suit, green felt and fixed shoe.';
const BLANK = 'Both faces of the card are blank: one plain solid yellow, the other plain solid blue, with no print, pips, pattern or picture.';
// Fallbacks carry the wording of the recipe that worked 2026-11-10; they are used only when the bank has no take of that kind yet.
const FALLBACK = {
  DEAL: `Locked camera. Same Pamela, black suit, green felt and fixed shoe. One continuous, calm and unhurried four-second deal to the far left of the image. From the exact first pose her left hand removes one card from the shoe, broad yellow back visible, and carries it low across the table in front of her to the far-left position of the last image. While carrying it she rolls that same wrist once: yellow visibly narrows to a thin pale edge and the opposite blue face opens fully before table contact. Yellow and blue stay on opposite surfaces of the same rigid card. She lays the blue-face-up card flat on the exact blue footprint of the last image and the clip ends there, her fingertips still resting lightly on the card as in the last image. ${BLANK} The other hand rests throughout. The next yellow card stays in the shoe. No slide, second touch, display gesture, handoff, second flip, colour swap, camera motion or cut.`,
  CLOSED: `Locked camera. Same Pamela, black suit, green felt and fixed shoe. One continuous, calm and unhurried four-second deal to the far left of the image. From the exact first pose her left hand removes one card from the shoe, broad yellow back visible, and carries it low over the table to the far-left position of the last image. The card is never turned: its broad yellow back faces up the whole way and the blue face is never seen. She lays the yellow-back-up card flat on the exact yellow footprint of the last image and the clip ends there, her fingertips still resting lightly on the card as in the last image. ${BLANK} The other hand rests throughout. The next yellow card stays in the shoe. No flip, wrist roll, slide, second touch, display gesture, handoff, colour swap, camera motion or cut.`,
  READY: `${SCENE} One plain solid blue card lies flat and still on the table in front of her. Her left index fingertip rests lightly on the corner of the card. She lifts the fingers gently straight off the card, and in one calm, unhurried movement the hand glides low over the table straight toward the shoe on the right, staying below chest height the whole way, fingers relaxed and naturally curved. It arrives gently at the yellow card in the shoe and settles into the exact grip of the last image, thumb and index finger on the top edge of the yellow card. Her eyes follow the hand to the shoe. The other hand rests on the table throughout. The blue card stays flat, still and untouched after the fingers leave it. The yellow card stays fully seated in the shoe. No second touch of the blue card, raised hand, fist, flourish, extraction, handoff, camera motion or cut.`,
  IDLE: `${SCENE} One plain solid blue card lies flat and still on the table in front of her. Her left index fingertip rests lightly on the corner of the card. She lifts the fingers gently straight off the card, and in one calm, unhurried movement draws the hand low and straight back toward herself, then lays it flat on the table in front of her, matching the last image: both hands resting side by side, shoulders level, upright posture. As the hand settles she lifts her head and looks into the camera with a slight friendly smile. The other hand rests on the table throughout. The blue card stays flat, still and untouched after the fingers leave it. The yellow card stays fully seated in the shoe. No second touch of the blue card, raised hand, fist, flourish, reach toward the shoe, extra card, camera motion or cut.`,
  ENTRY: `${SCENE} She sits upright with both hands resting flat on the table in front of her, exactly as in the first image. In one calm, unhurried movement her left hand lifts slightly and glides low over the table straight toward the shoe on the right, staying below chest height the whole way, fingers relaxed and naturally curved. It arrives gently at the yellow card in the shoe and settles into the exact grip of the last image, thumb and index finger on the top edge of the yellow card. Her eyes follow the hand to the shoe. The other hand rests on the table throughout. The yellow card stays fully seated in the shoe. No raised hand, fist, flourish, extraction, handoff, camera motion or cut.`,
  EXIT: `${SCENE} Her left hand rests at the shoe in the exact grip of the first image, thumb and index finger on the top edge of the yellow card. She lets go of the card, and in one calm, unhurried movement draws the hand low and straight back toward herself, then lays it flat on the table in front of her, matching the last image: both hands resting side by side, shoulders level, upright posture. As the hand settles she lifts her head and looks into the camera with a slight friendly smile. The other hand rests on the table throughout. The yellow card stays fully seated in the shoe. No raised hand, fist, flourish, extraction, extra card, camera motion or cut.`,
  REVEAL: `${SCENE} She sits upright with both hands resting flat on the table, exactly as in the first image. One plain solid yellow card lies flat and still on the table close in front of her. In one calm, unhurried movement her left hand reaches to that yellow card, lifts it by its edge and turns it over once just above the table: yellow visibly narrows to a thin pale edge and the opposite blue face opens fully. She lays the same card flat, blue face up, on the exact place it was lifted from, lets go of it, and draws the hand low and straight back to rest flat on the table in front of her. She ends in the exact pose of the last image, looking into the camera with a slight friendly smile. ${BLANK} The other hand rests on the table throughout. Every other card on the table stays flat, still and untouched. The yellow card in the shoe stays fully seated. No slide, second flip, colour swap, reach toward the shoe, extra card, display gesture, camera motion or cut.`,
  LEAVE: `${SCENE} She sits upright with both hands resting flat on the table, exactly as in the first image. In one calm, unhurried movement she lifts her hands from the table, pushes back, stands up, turns to her left and walks out of the picture past its right edge, behind the shoe. From then on nobody is in the picture: only the plain green background, the plain green table and the black shoe remain, and the clip holds that empty picture, perfectly still, to its end. The shoe never moves and the yellow card stays fully seated in it. The green background and the table keep their exact colour and light, and the left edge of the picture stays empty the whole time. No other person, no chair or other object appears, no card is touched, no wave or gesture, no camera motion or cut.`,
  ARRIVE: `${SCENE} The picture begins empty, exactly as the first image: the plain green background, the plain green table and the black shoe, and nobody there. The same Pamela walks in from the right edge of the picture, behind the shoe, to the middle behind the table, turns to face the camera and sits down. She lays both hands flat on the table in front of her, side by side, and ends in the exact pose of the last image, looking into the camera with a slight friendly smile. The shoe never moves and the yellow card stays fully seated in it. The green background and the table keep their exact colour and light, and the left edge of the picture stays empty the whole time. No other person, no chair or other object appears, no card is touched, no wave or gesture, no camera motion or cut.`,
  LOOP: `${SCENE} She sits upright with both hands resting flat on the table in front of her, exactly as in the first image, and looks into the camera with a slight friendly smile. For the whole clip she only breathes calmly and blinks naturally, and ends in the exact pose of the last image. Both hands stay flat and still on the table. The yellow card stays fully seated in the shoe. No reach, gesture, raised hand, head turn, extra card, camera motion or cut.`,
};
const seatIndex = (target: string) => target[0] === 'D' ? 4 : Number(target[1]);

export type Draft = {job: BankJob; basedOn: string | null; notes: string[]};
export function draftJob(graph: Graph, edgeId: string, options: {holeCardDown?: boolean} = {}): Draft | null {
  const e = graph.edge[edgeId];
  if (!e || e.experiment || !e.kind) return null; // drafts follow the model's recipe; an experiment has none
  const notes: string[] = [], jobs = Object.values(graph.takes).map(t => t.job);
  const [seat, card] = e.target ? e.target.split('.') : ['', ''], slug = e.target ? `${seat.toLowerCase()}-${card.toLowerCase()}` : '';
  const side = e.target ? wantedSide(e.target, options.holeCardDown !== false) : null;
  const stem = e.kind === 'DEAL' ? `pamela-${slug}-plan-deal` : e.kind === 'REVEAL' ? `pamela-${slug}-reveal` : e.kind === 'ARRIVE' ? 'pamela-table-arrive' : e.kind === 'LEAVE' ? 'pamela-table-leave' : e.kind === 'ENTRY' ? 'pamela-idle-ready-entry' : e.kind === 'IDLE' ? 'pamela-idle-loop'
    : e.target ? `pamela-${slug}-plan-return-${e.to.toLowerCase()}` : 'pamela-ready-idle-exit';
  const taken = Object.keys(graph.takes).map(id => id.startsWith(`${stem}-`) ? Number(id.slice(stem.length + 1)) : 0).filter(Number.isInteger);
  const id = `${stem}-${String(Math.max(0, ...taken) + 1).padStart(2, '0')}`;
  // A known file keeps its recorded hash; an anchor that is not built yet gets a visible TODO, which validateJob refuses.
  const file = (path: string, note: string): ImageRef => {
    const known = jobs.flatMap(j => [j.first, j.last]).find(ref => ref?.file?.path === path)?.file;
    return {file: {path, sha256: known?.sha256 ?? TODO_SHA}, note: known ? note : `${note} Build or locate it first, then replace the hash.`};
  };
  const readyStart = jobs.find(j => j.kind === 'DEAL' && j.target?.endsWith('.C1') && j.first?.file)?.first ?? file('assets/motions/pamela-p4-c1-color-control-01/start.png', 'Proven READY anchor: real video frame with the pinch on the yellow card.');
  const idleEmpty = file('assets/anchors/pamela-idle-empty-01/anchor.png', 'IDLE anchor with an empty table.');
  // Wording comes from the main take of the same kind at the nearest seat, so later prompt lessons follow along.
  const source = e.target ? graph.edges.filter(o => o.kind === e.kind && (e.kind === 'DEAL' || o.to === e.to) && o.target && o.main)
    .sort((a, b) => Math.abs(seatIndex(a.target!) - seatIndex(e.target!)) - Math.abs(seatIndex(b.target!) - seatIndex(e.target!)) || Number(a.target!.slice(-1) !== card.slice(-1)) - Number(b.target!.slice(-1) !== card.slice(-1)) || b.main!.order - a.main!.order)[0]?.main ?? null : null;
  let promptText: string, first: ImageRef, last: ImageRef | undefined;
  if (e.kind === 'DEAL') {
    const closed = side === 'BACK', base = closed ? FALLBACK.CLOSED : source?.job.promptText ?? FALLBACK.DEAL;
    promptText = base.replace(/(four-second deal )[^.]*\./, `$1${PLACE[seat].deal}.`).replace(/to the [a-z-]+ position of the last image/, `to the ${PLACE[seat].spot} position of the last image`);
    if (!/four-second deal /.test(base)) notes.push('Platsformuleringen hittades inte i förlagan; skriv in var kortet ska landa.');
    if (closed) notes.push('Stängt kort har ingen tidigare tagning; formuleringen utan vändning är oprövad.');
    else if (source && source.job.target !== e.target) notes.push(`Rörelsen är skriven för ${source.job.target}; kontrollera att den passar ${e.target}.`);
    if (card !== 'C1') notes.push('Tidigare kort ligger redan på bordet: börja från READY-ankaret med de korten, eller använd samma film med renderat kort.');
    first = card === 'C1' ? readyStart : file(`assets/anchors/pamela-ready-${seat.toLowerCase()}-c${Number(card[1]) - 1}-plan-01/anchor.png`, 'READY anchor with the earlier card already lying at the plan position.');
    last = file(`assets/anchors/pamela-${slug}-plan-land-01/anchor.png`, `Landing anchor for ${e.target}: fingertip resting on the card at the saved plan position (tools/build-anchor.ts).`);
  } else if (e.kind === 'RETURN' && e.target) {
    const base = source?.job.promptText ?? (e.to === 'READY' ? FALLBACK.READY : FALLBACK.IDLE), deal = graph.edge[`READY>${e.target}`]?.main ?? null;
    promptText = base.replace(/(lies flat and still on the table )[^.]*\./, `$1${PLACE[seat].lies}.`);
    if (!/lies flat and still on the table /.test(base)) notes.push('Platsformuleringen hittades inte i förlagan; skriv in var kortet ligger.');
    if (side === 'BACK') { promptText = promptText.replace('One plain solid blue card', 'One plain solid yellow card').replace('The blue card stays', 'The card on the table stays').replace('second touch of the blue card', 'second touch of the card on the table'); notes.push('Kortet på bordet är stängt (gult); kontrollera färgorden i prompten.'); }
    if (source && source.job.target !== e.target) notes.push(`Rörelsen är skriven för ${source.job.target}; kontrollera att den passar ${e.target}.`);
    // Anchor rule: start from the deal's own end image, so the return follows every take of that deal.
    const end = (deal ?? [...graph.edge[`READY>${e.target}`].takes].reverse().find(t => !t.hub && t.stage !== 'FAILED'))?.job.last;
    first = end?.file ? {file: end.file, note: `Landing anchor for ${e.target}: the deal's own end image, so this return follows every take of that deal.`}
      : file(`assets/anchors/pamela-${slug}-plan-land-01/anchor.png`, `Landing anchor for ${e.target}: the deal's own end image, so this return follows every take of that deal.`);
    if (!end?.file) notes.push('Ingen giv med landningsankare finns ännu: bygg ankaret och använd samma bild som givens slutbild.');
    last = file(`assets/anchors/pamela-${e.to.toLowerCase()}-${slug}-plan-01/anchor.png`, `${e.to} anchor with the ${e.target} card at the saved plan position.`);
  } else if (e.kind === 'REVEAL') {
    // Rest with the closed card is where the return to rest after the hole card ends; rest with the open card is where the last turn ended.
    promptText = source?.job.promptText || FALLBACK.REVEAL;
    first = graph.edge[`${HOLE_CARD}>IDLE`]?.main?.job.last ?? file('assets/anchors/pamela-idle-d-c2-closed-01/anchor.png', 'IDLE with the closed hole card lying at D.C2.');
    last = e.main?.job.last ?? file('assets/anchors/pamela-idle-d-c2-open-01/anchor.png', 'IDLE with the hole card turned open at D.C2.');
    notes.push('Första bild: vila med det stängda hålkortet. Sista bild: vila med kortet uppvänt. Välj rutor minst tre före respektive films slut och fyll i filmens hash.');
  } else if (e.kind === 'ARRIVE' || e.kind === 'LEAVE') {
    // Rest is the keystone frame the idle clips start on. The picture without her is a real frame from the end of a leave film,
    // which is why leaving is ordered first, from its first image alone.
    const rest = graph.edge['IDLE>IDLE']?.main?.job.first ?? idleEmpty, empty = file('assets/anchors/pamela-away-01/anchor.png', 'The set without the dealer: a whole real frame from the end of a leave film.');
    promptText = e.kind === 'ARRIVE' ? FALLBACK.ARRIVE : FALLBACK.LEAVE;
    first = e.kind === 'ARRIVE' ? empty : rest; last = e.kind === 'ARRIVE' ? rest : undefined;
    notes.push(e.kind === 'ARRIVE' ? 'Första bild ska vara en verklig ruta utan henne, ur slutet av en utgångsfilm.' : 'Utgången beställs med enbart första bild; dess sista rutor blir bilden utan henne.');
  } else {
    promptText = e.kind === 'ENTRY' ? FALLBACK.ENTRY : e.kind === 'IDLE' ? FALLBACK.LOOP : FALLBACK.EXIT;
    notes.push('Mall utan tidigare tagning i banken; ett äldre klipp finns bara i arkivet.');
    first = e.kind === 'RETURN' ? readyStart : idleEmpty; last = e.kind === 'ENTRY' ? readyStart : idleEmpty;
  }
  notes.push('Jämför alltid prompten med start- och slutbilden innan jobbet fryses.');
  const wrap = (node: string) => isHub(node) || node === AWAY ? node : `LAND(${node})`;
  return {basedOn: source?.id ?? null, notes, job: {id, kind: e.kind, target: e.target, from: wrap(e.from), to: wrap(e.to), model: 'wan3', duration: e.kind === 'ARRIVE' || e.kind === 'LEAVE' ? 5 : e.kind === 'DEAL' || e.kind === 'IDLE' || e.kind === 'REVEAL' ? 4 : 3, ratio: 'auto_1080p', audio: false,
    promptText, first, ...(last ? {last} : {}), purpose: `Draft from the lab clip bank for ${e.id}${source ? `; wording based on ${source.id}` : ''}. Check the wording against both images before freezing.`}};
}

// ── Tree layout ─────────────────────────────────────────────────────────────
// Schematic table: seats left to right as in the placement plan, the arc keeps the plan's
// depth order, the dealer's cards sit above. Input is each card's image-pixel centre.
export const TREE = {width: 1000, height: 600, nodeWidth: 50, nodeHeight: 58, readyBus: 300, idleBus: 566, idleRail: 124, idleTrunk: 40, readyTrunk: 960, dealerY: 205};
export type TreePoint = {x: number; y: number};
export function tableLayout(points?: Record<string, TreePoint> | null): Record<string, TreePoint> {
  const centre = (seat: string) => { const a = points?.[`${seat}.C1`], b = points?.[`${seat}.C2`]; return a && b && [a.x, a.y, b.x, b.y].every(Number.isFinite) ? {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, flip: b.x < a.x} : null; };
  const measured = [...SEATS, 'D'].map(centre), usable = measured.every(Boolean);
  const raw = usable ? measured.slice(0, 7).map(p => p!) : SEATS.map((_, i) => ({x: i, y: -Math.abs(i - 3), flip: false}));
  const xs = raw.map(p => p.x), ys = raw.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (x: number) => x1 > x0 ? 124 + (x - x0) / (x1 - x0) * 766 : 500, Y = (y: number) => y1 > y0 ? 392 + (y - y0) / (y1 - y0) * 96 : 440;
  const seats = SEATS.map((seat, i) => ({seat, x: X(raw[i].x), y: Y(raw[i].y), flip: raw[i].flip})).sort((a, b) => a.x - b.x);
  for (let i = 1; i < seats.length; i++) seats[i].x = Math.max(seats[i].x, seats[i - 1].x + 114); // pairs never overlap
  seats[seats.length - 1].x = Math.min(seats[seats.length - 1].x, 890);
  for (let i = seats.length - 2; i >= 0; i--) seats[i].x = Math.min(seats[i].x, seats[i + 1].x - 114);
  const out: Record<string, TreePoint> = {IDLE: {x: 96, y: 70}, READY: {x: 904, y: 70}};
  for (const s of seats) { out[`${s.seat}.C1`] = {x: s.x + (s.flip ? 28 : -28), y: s.y}; out[`${s.seat}.C2`] = {x: s.x + (s.flip ? -28 : 28), y: s.y}; }
  const d = usable ? Math.max(180, Math.min(760, X(measured[7]!.x))) : 500;
  out['D.C1'] = {x: d - 28, y: TREE.dealerY}; out['D.C2'] = {x: d + 28, y: TREE.dealerY}; out['D.C3'] = {x: d + 84, y: TREE.dealerY};
  return out;
}
