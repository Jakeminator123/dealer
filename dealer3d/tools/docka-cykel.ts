// A doll's deal and its return in one film (Jakob 2026-11-23: "giv och återgång i en film"), for any place of the plan, laid
// as the doll lab lays it (dealer3d/page/docka.ts, "Giv och återgång"): from A2.3 "Naturlig" by default, and the standard
// Jakob saved for the doll, entry and place (dealer3d/standard/, lay.ts standardName) where there is one, laid again from
// its recipe and sliders in the way he saved it in ("hans standard vinner där den finns"). From A2.1 one way: her one-hand
// deal built on the doll's bones from her pose A2.1 (dealer3d/src/pinch-deal.ts, dealer3d/data/ankare-2-1-<doll>.json), its
// return in the same motion. The deal from A2.3 is laid with the standard doll, given its return, posed on the doll and, in
// "Naturlig", moved as a person moves: page/natural-lab.ts withReturn, as the lab does. Writes the motion to a new file
// only, and prints what to read beside it and the render command.
//   node dealer3d/tools/docka-cykel.ts --to P5.C1 --out dealer3d/data/<new>.json [--from A2.3|A2.1] [--doll paow]
//     [--way naturlig|forut] [--no-standard] [--flat-hand] [--sam-hand] [--recipe-grip-yaw] [--fingrar-som-forut] [--en-vinkel] [--hold 76] [--ready 116]
//     [--duration 4] [--lift 0.022] [--kortets-fart 150] [--sida stangt|oppet]
// --from: the pose the deal begins and ends in (A2.3 if left out; A2.2 is not built). --way: the way where no standard is
// used (the standard doll has only "forut"; from A2.1 there is one way, built). --no-standard: lay the place as if no
// standard were saved. --flat-hand: the right hand flat as it lays the card (natural.ts `flatHand`; "Naturlig" only).
// --sam-hand and --recipe-grip-yaw: "Naturlig" as it was before 2026-11-23 (natural-lab.ts AsBefore), her left hand at
// the shoe as SAM read it, and the recipe's own angle of the hand on the card where nothing steers it (the lab's is −30):
// to make a film made then again. --fingrar-som-forut: her free fingers as they were before the hand rule of 2026-11-23
// (dealer3d/src/hand-rule.ts; "Naturlig" only), to make a film made before it again. --en-vinkel: one angle of the hand on
// the card from the hand change to the end, −30 where nothing steers it, as "Naturlig" was on 2026-11-23 before the two
// angles (natural-lab.ts gripYawsOf; "Naturlig" only), to make a film made then again. The cycle's flags are
// dealer3d/tools/return-cycle.ts's, and left out they are its own defaults.
// The landing (her right hand's end pose at the laid card, dealer3d/src/landing.ts; "Naturlig" only) is the standard's
// (`lab.landing`), the default where it has none; --landning <id> lays that landing instead, without his own shaping. It
// prints one line `landning <id>` ("landning ingen" where the way has no landing: Som förut, and from A2.1).
// The turn (how her right hand turns the card face up, dealer3d/src/turn-in-hand.ts; "Naturlig" only) is the standard's
// (`lab.turn`), "forut" where it has none; --vandning <id> lays that turn instead, on top of the standard without changing
// its landing or anything else. It prints one line `vändning <id>` ("vändning ingen" where the way has no turn).
// The card's tempo (lay.ts Steer.cardTempo, Jakob 2026-11-23: only the hands with the card go faster) is the standard's,
// 100 % where it has none; --kortets-fart <percent> lays that one instead (100 to the most the recipe's turn allows; from
// A2.3 only). Its return then comes as natural-lab.ts quickReturn times it, unless --hold, --ready or --duration say otherwise.
// The side a dealer's card lies with (lay.ts Steer.side, Jakob 2026-11-24: closed or open as he chooses; D.C1 to D.C3 only)
// is the standard's (open where it says none, as every standard saved before it was laid), and where no standard is used the
// plan's as it stands (placements/default.json, the place's intent.endSide); --sida stangt|oppet lays that side instead. A
// closed card is slid face down and never turned, so it has no turn and no landing of its own. It prints one line
// `sida stängt|öppet (planen: ...)` for a dealer's card, and the side is in `made.side`.
import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {filmLens, spots} from '../src/world.ts';
import {pinchDeal, type Anchor21} from '../src/pinch-deal.ts';
import {OVER_HAND, overHand} from '../src/doll-choices.ts';
import {dollNamed} from '../src/doll.ts';
import {DEALER_CARD, NO_STEER, cardTempoMost, cardTempoOf, layDeal, placeFrom, recipeOf, sideOf, sideOfPlan, standardName, type Entry, type Recipe, type Steer, type Stored} from '../page/lay.ts';
import {NO_KNOBS, gripYawsOf, layNatural, withReturn, type AsBefore, type Knobs, type Way} from '../page/natural-lab.ts';
import {LANDINGS, asBefore, landingOf, landingWords, shaped, type Landing} from '../src/landing.ts';
import {TURNS, TURN_DEFAULT, turnOf, type TurnId} from '../src/turn-in-hand.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const USAGE = 'node dealer3d/tools/docka-cykel.ts --to <place, e.g. P5.C1> --out dealer3d/data/<new>.json [--from A2.3|A2.1] [--doll paow|standard] [--way naturlig|forut] [--no-standard] [--flat-hand] [--sam-hand] [--recipe-grip-yaw] [--fingrar-som-forut] [--en-vinkel] [--landning <id>] [--vandning forut|i-handen] [--hold <frame>] [--ready <frame>] [--duration <seconds>] [--lift <metres>] [--kortets-fart <percent>] [--sida stangt|oppet]';
const {values} = parseArgs({options: {to: {type: 'string'}, out: {type: 'string'}, from: {type: 'string'}, doll: {type: 'string'}, way: {type: 'string'}, 'no-standard': {type: 'boolean'}, 'flat-hand': {type: 'boolean'},
  'sam-hand': {type: 'boolean'}, 'recipe-grip-yaw': {type: 'boolean'}, 'fingrar-som-forut': {type: 'boolean'}, 'en-vinkel': {type: 'boolean'}, landning: {type: 'string'}, vandning: {type: 'string'}, hold: {type: 'string'}, ready: {type: 'string'}, duration: {type: 'string'}, lift: {type: 'string'}, 'kortets-fart': {type: 'string'}, sida: {type: 'string'}, help: {type: 'boolean', short: 'h'}}});
if (values.help) { console.log(USAGE); process.exit(0); }
function fail(why: string): never { console.error(why); process.exit(1); }
const place = values.to, out = values.out, dollName = values.doll ?? 'paow', entry = (values.from ?? 'A2.3') as Entry;
if (!place || !out) fail(USAGE);
if (!['A2.1', 'A2.2', 'A2.3'].includes(entry)) fail('--from ska vara A2.3 eller A2.1.');
if (values.way && values.way !== 'naturlig' && values.way !== 'forut') fail('--way ska vara naturlig eller forut.');
const number = (v: string | undefined, flag: string) => { if (v === undefined) return undefined; const n = Number(v); if (!v.trim() || !Number.isFinite(n)) fail(`${flag} ska vara ett tal.`); return n; };
const before: AsBefore = {...(values['sam-hand'] ? {samHand: true} : {}), ...(values['recipe-grip-yaw'] ? {recipeGripYaw: true} : {}), ...(values['fingrar-som-forut'] ? {fingers: true} : {}), ...(values['en-vinkel'] ? {oneGripYaw: true} : {})};
if (values.landning !== undefined && !LANDINGS.some(l => l.id === values.landning)) fail(`--landning ska vara en av ${LANDINGS.map(l => l.id).join(', ')}.`);
if (values.vandning !== undefined && !TURNS.some(t => t.id === values.vandning)) fail(`--vandning ska vara en av ${TURNS.map(t => t.id).join(', ')}.`);
if (values.sida !== undefined && (values.sida !== 'stangt' && values.sida !== 'oppet')) fail('--sida ska vara stangt eller oppet.');
if (values.sida !== undefined && (!DEALER_CARD.test(place) || entry !== 'A2.3')) fail('--sida gäller dealerns egna kort (D.C1 till D.C3) från A2.3.');

const file = (rel: string) => path.join(ROOT, rel), rel = (p: string) => path.relative(ROOT, path.resolve(p)).split(path.sep).join('/');
const bytesOf = (rel: string) => readFile(file(rel)), sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const json = (b: Buffer) => JSON.parse(b.toString('utf8').replace(/^\uFEFF/, ''));
const lens = filmLens(), doll = dollNamed(dollName), planBytes = await bytesOf('placements/default.json'), plan = json(planBytes);
const used: Record<string, string> = {'placements/default.json': sha(planBytes)};
const readData = async (name: string) => { const r = `dealer3d/data/${name}.json`, b = await bytesOf(r); used[r] = sha(b); return json(b); };
const recipeNamed = async (name: string) => { const recipe: Recipe = recipeOf(name, await readData(name) as Stored); return {recipe, pose: await readData(recipe.poseFilm ?? 'till-ankare-2-3')}; };

// The place's deal from the entry, as the lab finds it (lay.ts placeFrom), and the standard saved for the doll, entry and place, as the lab reads it.
if (entry === 'A2.1') { await fromPinch(); process.exit(0); }
const found = placeFrom(entry, place!); if (!found) fail(`${place} är ingen plats som docklabbet känner.`);
if (!('recipe' in found)) fail('none' in found && found.none === 'unbuilt' ? 'A2.2 är inte byggd: bara ankarbilden finns, ingen ställning är läst ur den och ingen giv börjar där.' : `${place}: docklabbet lägger ingen giv dit från ${entry}${'none' in found ? ` (${found.none})` : ''}.`);
const standardPath = `dealer3d/standard/${standardName(dollName, entry, place)}.json`, saved = !values['no-standard'] && existsSync(file(standardPath));
let steer: Steer = {...NO_STEER}, knobs: Knobs = structuredClone(NO_KNOBS), standard: string | null = null, savedLab: {recipe?: string; steer?: Partial<Steer>; naturlig?: {knobs?: Partial<Knobs>}; landing?: unknown; turn?: unknown} = {};
if (saved) { const b = await bytesOf(standardPath); savedLab = json(b).lab ?? {}; used[standardPath] = sha(b); standard = standardPath; }
// The landing: the flag's, else the standard's, else the default (the hand as before). The turn likewise.
const landing: Landing = values.landning ? {id: values.landning as Landing['id']} : landingOf(savedLab.landing);
const turn: TurnId = values.vandning ? values.vandning as TurnId : turnOf(savedLab.turn);

// The deal with the standard doll, as the lab lays it the chosen way, and the file it is laid from.
let way: Way, laid: Parameters<typeof withReturn>[0], recipe: Recipe | null = null, source: string;
{
  let pose; ({recipe, pose} = await recipeNamed(found.recipe)); way = dollName === 'standard' ? 'forut' : (values.way as Way | undefined) ?? 'naturlig';
  if (saved) { steer = {...NO_STEER, ...savedLab.steer};
    knobs = {shoulderR: [...(savedLab.naturlig?.knobs?.shoulderR ?? NO_KNOBS.shoulderR)], shoulderL: [...(savedLab.naturlig?.knobs?.shoulderL ?? NO_KNOBS.shoulderL)], elbowOut: [...(savedLab.naturlig?.knobs?.elbowOut ?? NO_KNOBS.elbowOut)]} as Knobs;
    way = dollName === 'standard' ? 'forut' : savedLab.naturlig ? 'naturlig' : 'forut';
    if (savedLab.recipe && savedLab.recipe !== recipe.from) ({recipe, pose} = await recipeNamed(savedLab.recipe)); }
  const fast = number(values['kortets-fart'], '--kortets-fart');
  if (fast !== undefined) { const most = Math.round(cardTempoMost(recipe!, steer) * 100); if (fast < 100 || fast > most) fail(`--kortets-fart ska vara från 100 till ${most} (procent) för ${place}: vändningen behöver sina rutor.`); if (fast === 100) delete steer.cardTempo; else steer.cardTempo = fast / 100; }
  if (values['flat-hand'] && way !== 'naturlig') fail(`--flat-hand finns bara i Naturlig; ${place} läggs ${standard ? `som hans sparade standard (${standard}), ` : ''}i Som förut.`);
  if (values.landning && way !== 'naturlig') fail(`--landning finns bara i Naturlig; ${place} läggs ${standard ? `som hans sparade standard (${standard}), ` : ''}i Som förut.`);
  if (values.vandning && way !== 'naturlig') fail(`--vandning finns bara i Naturlig; ${place} läggs ${standard ? `som hans sparade standard (${standard}), ` : ''}i Som förut.`);
  // (the side: the flag's, else the standard's, else the plan's as it stands; only 'BACK' is kept in the steering, so an open card is laid and written as before)
  if (DEALER_CARD.test(place)) { const side = values.sida ? (values.sida === 'stangt' ? 'BACK' : 'FRONT') : saved ? sideOf(steer) : sideOfPlan(plan, place) ?? 'FRONT';
    if (side === 'BACK') steer.side = 'BACK'; else delete steer.side;
    if (side === 'BACK' && (values.landning || values.vandning || !asBefore(landing) || turn !== TURN_DEFAULT)) fail(`${place} läggs stängt: kortet skjuts med baksidan upp och vänds aldrig, så det har ingen egen landning eller vändning.`); }
  laid = (way === 'naturlig' ? layNatural({plan, target: place, recipe: recipe!, pose, steer, lens, doll, before}).deal : layDeal({plan, target: place, recipe: recipe!, pose, steer})) as never;
  source = `dealer3d/data/${recipe!.from}.json`;
}
// Its return (return-cycle.ts checks the standard's arms), on the doll, moved as a person moves.
const options = {holdThrough: number(values.hold, '--hold'), readyFrom: number(values.ready, '--ready'), durationSeconds: number(values.duration, '--duration'), liftMeters: number(values.lift, '--lift')};
const done = withReturn(laid, {way, body: steer.body, knobs, lens, doll, source: {path: source, sha256: used[source]}, cycle: options, cardTempo: cardTempoOf(steer), flatHand: !!values['flat-hand'], before, landing, turn});
const landingSaid = way === 'naturlig' ? landing : null, turnSaid = way === 'naturlig' ? turn : null;
const cycle = done.cycle, motion = done.motion as typeof done.motion & {frames: {card: {c: number[]}; L: Limb; R: Limb}[]}, flatDeg = done.receipt?.frames.map(f => f.flatDeg ?? 0) ?? [];

const words = place.replace(/^P(\d)\.C(\d)$/, 'plats $1 kort $2').replace(/^D\.C(\d)$/, 'dealerns kort $1'), WAY = {naturlig: 'Naturlig', forut: 'Som förut'};
const how = standard ? `hans sparade standard ${standard} (i ${WAY[way]})` : `${WAY[way]}, inget reglage rört`;
const about = `${doll.name === 'paow' ? 'Paow' : 'Standarddockan'}, ${entry} till ${words} och tillbaka till ${entry} i samma film, lagd som docklabbet lägger den: ${how}${cardTempoOf(steer) !== 1 ? `, kortets fart ${Math.round(cardTempoOf(steer) * 100)} % (bara händerna med kortet går fortare)` : ''}${values['flat-hand'] ? ', högerhanden plan vid nedsläppet (natural.ts flatHand)' : ''}${before.samHand ? ', vänsterhanden vid skon som SAM läste den' : ''}${before.recipeGripYaw ? ', handens vinkel på kortet receptets' : ''}${before.oneGripYaw && !before.recipeGripYaw ? ', en vinkel för handen på kortet hela vägen' : ''}${landingSaid && !asBefore(landingSaid) ? `, landningen: ${landingWords(landingSaid).toLowerCase()}` : ''}${done.turn?.laid ? ', kortet vänt i högerhanden av handleden (turn-in-hand.ts)' : ''}${sideOf(steer) === 'BACK' ? ', lagt stängt (baksidan upp hela vägen, aldrig vänt)' : ''}. Skriven av dealer3d/tools/docka-cykel.ts; filmas med render-reference.ts --seconds ${cycle.frameCount / cycle.fps} --fps 24.`;
const made = {tool: 'dealer3d/tools/docka-cykel.ts', place, from: entry, doll: doll.name, way, standard, recipe: recipe?.from ?? null, poseFilm: recipe ? recipe.poseFilm ?? 'till-ankare-2-3' : null, steer, knobs,
  gripYaw: recipe ? gripYawsOf(recipe, steer, way, before) : null, ...(DEALER_CARD.test(place) ? {side: sideOf(steer)} : {}), flatHand: !!values['flat-hand'], before, landing: landingSaid, landed: done.landing, ...(turnSaid && turnSaid !== TURN_DEFAULT ? {turn: turnSaid, turned: done.turn} : {}), cycle: options, sources: used};
await writeFile(out, JSON.stringify({...motion, about, made}) + '\n', {flag: 'wx'});

type Limb = {s: number[]; e: number[]; w: number[]; p: number[][]};
const far = (a: Limb, b: Limb) => Math.max(...[a.s, a.e, a.w, ...a.p].map((q, i) => Math.hypot(...q.map((x, k) => (x - [b.s, b.e, b.w, ...b.p][i][k]) * 1000))));
const first = motion.frames[0], last = motion.frames.at(-1)!, c = cycle.cycle;
console.log(`skrev ${rel(out)}: ${motion.frames.length} rutor à ${cycle.fps}/s (${cycle.frameCount / cycle.fps} s); ${standard ? `hans standard ${standard}, ` : ''}${WAY[way]}, receptet ${recipe!.from}${'lent' in found && found.lent && !standard ? ` (lånat: ${found.lent})` : ''}`);
console.log(`landning ${landingSaid ? `${landingSaid.id}${shaped(landingSaid) ? ` (egen: ${landingWords(landingSaid).split(', egen: ')[1]})` : ''}` : 'ingen'}`);
console.log(`kortets fart ${Math.round(cardTempoOf(steer) * 100)} %`);
const SIDE = {BACK: 'stängt', FRONT: 'öppet'} as const, planSide = sideOfPlan(plan, place);
if (DEALER_CARD.test(place)) console.log(`sida ${SIDE[sideOf(steer)]} (planen: ${planSide ? SIDE[planSide] : 'säger inget'})`);
const td = done.turn;
console.log(`vändning ${turnSaid ?? 'ingen'}${td ? td.laid ? ` (höger hand tar kortet i ${td.edge === 'long' ? 'långsidan' : 'kortsidan'} i ruta ${td.take}, vrider det ${Math.round(td.heldInAll!)}° i greppet, släpper i ruta ${td.letGo}; handleden högst ${td.wrist!.most}°, förut ${td.wristBefore!.most}°)` : ` (går inte här: ${td.why}; kortet vänds som förut)` : ''}`);
console.log(`kortet ligger från ruta ${cycle.rests}, given hålls t.o.m. ruta ${c.holdThrough}, lyftet ${c.liftStarts}-${c.liftEnds}, åter i ${entry} från ruta ${c.readyFrom}${'gazeReadyFrom' in c ? `, blicken åter från ruta ${c.gazeReadyFrom}` : ''}; armen för kort ${done.shortMm} mm${done.bodyShare === null ? '' : `; kroppen tar ${Math.round(done.bodyShare * 100)} % av styrningen`}`);
const closes = [far(last.R, first.R), far(last.L, first.L)];
console.log(`sista rutan mot första: höger hand och arm ${closes[0].toFixed(2)} mm, vänster ${closes[1].toFixed(2)} mm${Math.max(...closes) > 1 ? '  OBS: cykeln sluter inte' : ''}`);
if (values['flat-hand']) console.log(`högerhanden vriden på kortet (grader, var femte ruta från ${cycle.rests - 25}):`, flatDeg.map((x, i) => [i, x] as const).filter(([i]) => i >= cycle.rests - 25 && i % 5 === 0).map(([i, x]) => `${i}:${x}`).join(' '));
const name = path.basename(out, '.json'), seconds = cycle.frameCount / cycle.fps;
console.log(`rendera: node dealer3d/tools/render-reference.ts --motion ${rel(out)} --out D:/dealer-scratch/tmp/dealer-3d/ut/${name} --seconds ${seconds} --fps 24`);
console.log(`ruta för ruta: node dealer3d/tools/deal-check.ts ${rel(out)} 0 ${cycle.frameCount - 1}`);

/** The deal from A2.1, the one way from there: built on the doll's bones from her pose A2.1 (pinch-deal.ts), its return in the same motion. */
async function fromPinch() {
  const anchorPath = `dealer3d/data/ankare-2-1-${dollName}.json`;
  if (!existsSync(file(anchorPath))) fail(`Ställningen A2.1 finns bara för de dockor som har den (${anchorPath} saknas).`);
  const bytes = await bytesOf(anchorPath), anchor = json(bytes) as Anchor21; used[anchorPath] = sha(bytes);
  const spot = spots(plan, lens).find(s => s.id === place); if (!spot) fail(`${place} är ingen plats i kortplanen.`);
  if (overHand(plan, place!, lens)) fail(`${place}: ${OVER_HAND} (dealer3d/src/doll-choices.ts)`);
  const fast = number(values['kortets-fart'], '--kortets-fart'); if (fast !== undefined && fast < 100) fail('--kortets-fart ska vara minst 100 (procent).');
  const asked = ['way', 'no-standard', 'flat-hand', 'sam-hand', 'recipe-grip-yaw', 'fingrar-som-forut', 'en-vinkel', 'landning', 'vandning', 'hold', 'ready', 'duration', 'lift'].filter(k => values[k as keyof typeof values] !== undefined);
  const deal = pinchDeal({start: {hip: anchor.hip, frame: anchor.frame}, place: place!, at: spot.at as [number, number, number], doll, lens, steer: fast && fast !== 100 ? {cardTempo: fast / 100} : {}});
  const m = deal.motion, t = deal.times, seconds = m.frameCount / m.fps, deg = (r: number) => Math.round(r * 180 / Math.PI);
  const words = place!.replace(/^P(\d)\.C(\d)$/, 'plats $1 kort $2').replace(/^D\.C(\d)$/, 'dealerns kort $1');
  const about = `${doll.name === 'paow' ? 'Paow' : doll.name}, A2.1 till ${words} och tillbaka till A2.1 i samma film, byggd på dockans ben från ställningen A2.1 (dealer3d/src/pinch-deal.ts): nyp i skons fönster, kortet glider ned längs plåten, bärs lågt medan underarmen vänder det med framsidan upp i fingrarna, läggs med bortre kanten först på platsen, pekfingret håller det, handen lyfts och går tillbaka${deal.steer.cardTempo !== 1 ? `, kortets fart ${Math.round(deal.steer.cardTempo * 100)} %` : ''}. Skriven av dealer3d/tools/docka-cykel.ts; filmas med render-reference.ts --seconds ${seconds} --fps 24.`;
  const made = {tool: 'dealer3d/tools/docka-cykel.ts', place, from: 'A2.1', doll: doll.name, way: 'byggd', anchor: anchorPath, steer: deal.steer, reach: {leanDeg: deg(deal.reach.lean), twistDeg: deg(deal.reach.twist)}, grip: deal.grip, times: t, sources: used};
  await writeFile(out!, JSON.stringify({...m, about, made}) + '\n', {flag: 'wx'});
  type Limb = {s: number[]; e: number[]; w: number[]; p: number[][]};
  const far = (a: Limb, b: Limb) => Math.max(...[a.s, a.e, a.w, ...a.p].map((q, i) => Math.hypot(...q.map((x, k) => (x - [b.s, b.e, b.w, ...b.p][i][k]) * 1000))));
  const frames = m.frames as unknown as {L: Limb; R: Limb}[], first = frames[0], last = frames.at(-1)!, closes = [far(last.R, first.R), far(last.L, first.L)];
  console.log(`skrev ${rel(out!)}: ${m.frameCount} rutor à ${m.fps}/s (${seconds} s); från A2.1, byggd på dockan (dealer3d/src/pinch-deal.ts)`);
  if (asked.length) console.log(`används inte från A2.1: ${asked.map(k => `--${k}`).join(', ')} (de gäller given från A2.3)`);
  console.log('landning ingen');
  console.log(`kortets fart ${Math.round(deal.steer.cardTempo * 100)} %`);
  const SIDE = {BACK: 'stängt', FRONT: 'öppet'} as const, planSide = sideOfPlan(plan, place!);
  if (DEALER_CARD.test(place!)) console.log(`sida öppet (planen: ${planSide ? SIDE[planSide] : 'säger inget'})`);
  console.log('vändning ingen');
  console.log(`kortet ligger från ruta ${t.rests}, given hålls t.o.m. ruta ${t.holdThrough}, lyftet ${t.holdThrough + 1}-${t.lifted}, åter i A2.1 från ruta ${t.ready}; armen för kort ${deal.shortMm} mm; kroppen lutar ${deg(deal.reach.lean)}° och vrids ${deg(deal.reach.twist)}°; kortet snurrar ${deal.grip.spinDeg}° i nypet`);
  console.log(`sista rutan mot första: höger hand och arm ${closes[0].toFixed(2)} mm, vänster ${closes[1].toFixed(2)} mm${Math.max(...closes) > 1 ? '  OBS: cykeln sluter inte' : ''}`);
  const name = path.basename(out!, '.json');
  console.log(`rendera: node dealer3d/tools/render-reference.ts --motion ${rel(out!)} --out D:/dealer-scratch/tmp/dealer-3d/ut/${name} --seconds ${seconds} --fps 24`);
  console.log(`ruta för ruta: node dealer3d/tools/deal-check.ts ${rel(out!)} 0 ${m.frameCount - 1}`);
}
