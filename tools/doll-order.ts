// The order from Scen & bord, Kortplan's step 3 (Jakob 2026-11-23: "hur beställer jag nu härifrån då?"): the doll's
// movement to one player's card, or one of her own (D.C1 to D.C3, 2026-11-24), becomes its film and a draft in Kön, in one
// go. The anchor is the plan's choice as the doll follows it (dealer3d/src/doll-choices.ts dollEntry): A2.3 with handbyte,
// which the doll makes where her left arm would go over her right hand or the card is laid closed, else A2.1. Four steps,
// each the tool that already does it:
//   1. dealer3d/tools/docka-cykel.ts    the give and the way back in one movement: from A2.1 built on the doll's bones
//                                       (dealer3d/src/pinch-deal.ts); from A2.3 laid as the doll lab lays it, his saved
//                                       standard for the doll and card where there is one, else "Naturlig"
//   2. dealer3d/tools/render-reference.ts   the doll's film of it (headless Chrome under the shared lock, about a minute)
//   3. tools/doll-reference-put.ts      the film into assets/references/docka/ and data/rendered-references.json
//   4. tools/order-new.ts               the draft: giv och återgång in one film, the doll's film as reference, template 15;
//                                       the turn in her hand (dealer3d/src/turn-in-hand.ts, "I handen") adds its sentence to the
//                                       text, and so do a landing other than the default (dealer3d/src/landing.ts) and a card's
//                                       tempo over 100 % (Kortets fart: only the card's hands are quicker)
//
//   node tools/doll-order.ts <dealer> <P6.C1|D.C2> [--mall 15] [--flat-hand] [--vandning forut|i-handen] [--dry]
//
// From A2.3 the turn is the saved standard's (`lab.turn`), or --vandning's on top of it; where it does not go at the card's
// tempo saved (the cycle tool's line "vändning <id> (går inte här: …)") the doll turns the card as before, and so does the
// text. Her own card lies as the plan says (placements/default.json, Vid landning): the doll is told the plan's side.
//
// It makes a draft only: nothing here approves, places or pays (tools/order-approve.ts, tools/order-put.ts). What is saved in
// the lab is what is ordered: sliders moved and not saved are not in the film. The lab server calls dollOrder for the
// guide's "Spara utkastet" on a deal from A2.3 to a player's card (POST /api/orders/docka, tools/order-routes.ts). --dry names what would be made and makes nothing.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { StoreError } from './placement-store.ts';
import { newCommand, stepOfNotation } from './order-new.ts';
import { STEPS, edgeOf } from '../src/order-model.ts';
import { LANDINGS, LANDING_DEFAULT } from '../dealer3d/src/landing.ts';
import { TURNS, TURN_DEFAULT, type TurnId } from '../dealer3d/src/turn-in-hand.ts';
import { dollEntry, type PlanChoices } from '../dealer3d/src/doll-choices.ts';

const run = promisify(execFile);

/** `turn`: the turn in her hand to lay on top of the saved standard (docka-cykel.ts --vandning); left out, the standard's. */
export type DollOrderAsk = { dealer: string; place: string; template?: number; flatHand?: boolean; turn?: TurnId };
export type DollOrderPlan = { dealer: string; doll: string; place: string; entry: 'A2.1' | 'A2.3'; side: 'BACK' | 'FRONT' | null; notation: string; edge: string; name: string; film: string; motion: string; title: string };

/** What the order will be called and where its files go: a new name each time, since a film made again gets a new id. */
export function dollOrderPlan(root: string, ask: DollOrderAsk): DollOrderPlan {
  const m = /^(?:p([1-7])\.?c([1-9])|d\.?c([1-3]))$/i.exec(ask.place.trim());
  if (!m) throw new StoreError(400, `${ask.place}: välj en spelares kort (P1.C1 till P7.C2) eller dealerns (D.C1 till D.C3).`);
  if (!/^[a-z0-9]+$/.test(ask.dealer)) throw new StoreError(400, 'Okänd dealer.');
  const seat = m[3] ? 'D' : `P${m[1]}`, card = m[3] ?? m[2];
  const plan = JSON.parse(readFileSync(path.join(root, 'placements', 'default.json'), 'utf8')) as PlanChoices, place = `${seat}.C${card}`, doll = ask.dealer;
  const entry = dollEntry(plan, place), side = seat === 'D' ? (plan.targets[place]?.intent.endSide ?? null) : null, from = entry.slice(1).replace('.', '-');
  const code = `${seat.toLowerCase()}c${card}`, notation = `${entry} - A3${seat}C${card}`;
  const found = stepOfNotation(notation), def = STEPS.find((s) => s.key === found.step);
  const edge = def ? edgeOf(def, found.target) : null;
  if (!edge) throw new StoreError(400, `Inget steg i Beställ ger ${notation}.`);
  const register = path.join(root, 'data', 'rendered-references.json');
  const taken = new Set(existsSync(register) ? ((JSON.parse(readFileSync(register, 'utf8')) as { films?: { id: string }[] }).films ?? []).map((f) => f.id) : []);
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const name = `giv-fran-${from}-${code}-bestalld-${letter}-${doll}`, film = `docka-${doll}-${from}-${code}-bestalld-${letter}`;
    const motion = `dealer3d/data/${name}.json`;
    if (taken.has(film) || existsSync(path.join(root, motion)) || existsSync(path.join(root, 'assets', 'references', 'docka', film))) continue;
    const title = `${doll[0].toUpperCase()}${doll.slice(1)} · A3${seat}C${card} · giv och återgång, ${entry === 'A2.1' ? 'dockans byggda giv från A2.1' : 'dockans sparade rörelse'}`;
    return { dealer: ask.dealer, doll, place, entry, side, notation, edge, name, film, motion, title };
  }
  throw new StoreError(409, `${place} har redan 26 beställda filmer av dockan.`);
}

/** What the text says of a card's tempo over 100 % (BESKED "Snabbare: bara händerna med kortet"): the film shows it, the text keeps the rest of her unhurried. */
export const CARD_TEMPO_SENTENCE = 'Only the card and the hands holding it move quickly, as in video 1; her head, her gaze and her free hand keep an ordinary, unhurried pace.';

/**
 * What the cycle tool said it laid (dealer3d/tools/docka-cykel.ts's lines), as the order needs it: the film's length, the
 * standard, the card's tempo, the turn in her hand and the landing where they are not the default, and the sentences the
 * order's text adds for them, so that the text says the same as the film shows. A turn that does not go here (line
 * "vändning <id> (går inte här: …)") is not the film's: the doll turns the card as before, and `unturned` says why.
 */
export function readLaid(place: string, laid: string) {
  const seconds = /--seconds (\d+(?:\.\d+)?) --fps 24/.exec(laid)?.[1];
  if (!seconds) throw new StoreError(500, 'Dockans rörelse sade inte hur lång den är.');
  const turned = /^vändning (\S+)(?: \(går inte här: ([^;)]+))?/m.exec(laid), found = TURNS.find((t) => t.id === turned?.[1]);
  const unturned = found && found.id !== TURN_DEFAULT && turned?.[2] ? `vändningen "${found.label}" går inte här (${turned[2]}); filmen och texten vänder kortet som förut` : null;
  const turn = found && found.id !== TURN_DEFAULT && !unturned ? found : null, landing = LANDINGS.find((l) => l.id === /^landning (\S+)/m.exec(laid)?.[1]);
  const tempo = Number(/^kortets fart (\d+) %/m.exec(laid)?.[1] ?? 100), standard = /hans standard (\S+?),/.exec(laid)?.[1] ?? null;
  const sentences = [turn?.sentence ?? null, landing && landing.id !== LANDING_DEFAULT ? landing.sentence : null, tempo !== 100 ? CARD_TEMPO_SENTENCE : null].filter((x): x is string => !!x);
  return { seconds, standard, tempo, turn, unturned, landing: landing ?? null, sentences };
}

/** Makes the doll's film from the saved movement and the draft that orders with it; returns what the command prints. */
export async function dollOrder(root: string, ask: DollOrderAsk, options: { dry?: boolean } = {}): Promise<Record<string, unknown>> {
  if (ask.turn !== undefined && !TURNS.some((t) => t.id === ask.turn)) throw new StoreError(400, `Vändningen ska vara en av ${TURNS.map((t) => t.id).join(', ')}.`);
  const plan = dollOrderPlan(root, ask);
  if (options.dry) return { ok: true, dry: true, ...plan, ...(ask.turn ? { turn: ask.turn } : {}) };
  const node = async (what: string, args: string[]) => {
    try { return (await run(process.execPath, args, { cwd: root, maxBuffer: 32 * 1024 * 1024, windowsHide: true })).stdout; }
    catch (error) {
      const said = String((error as { stderr?: string }).stderr ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^at |^Node\.js|^\^|^node:/.test(l));
      const line = said.find((l) => /^(?:Error: |\[RÖD\] )/.test(l))?.replace(/^(?:Error: |\[RÖD\] )/, '') ?? said.at(-1) ?? (error as Error).message;
      throw new StoreError(/låset/i.test(line) ? 409 : 500, `${what} gick inte: ${line}`);
    }
  };
  const [from, to] = plan.edge.split('>'), folder = path.join(root, '.runtime', 'docka-bestall'), out = path.join(folder, plan.name);
  const own = plan.entry === 'A2.3' ? [...(plan.side ? ['--sida', plan.side === 'BACK' ? 'stangt' : 'oppet'] : []), ...(ask.flatHand ? ['--flat-hand'] : []), ...(ask.turn ? ['--vandning', ask.turn] : [])] : ['--from', 'A2.1'];
  const laid = await node('Dockans rörelse', ['dealer3d/tools/docka-cykel.ts', '--to', plan.place, '--out', plan.motion, '--doll', plan.doll, ...own]);
  try {
    const { seconds, standard, tempo, turn, unturned, landing, sentences } = readLaid(plan.place, laid);
    mkdirSync(folder, { recursive: true });
    rmSync(out, { recursive: true, force: true });
    await node('Dockans film', ['dealer3d/tools/render-reference.ts', '--motion', plan.motion, '--out', out, '--seconds', seconds, '--fps', '24']);
    const how = plan.entry === 'A2.1' ? 'byggd på dockan från A2.1' : standard ? `hans sparade standard ${standard}` : 'ingen sparad standard, Naturlig som förval';
    const note = `Gjord från Scen & bord, Kortplan: ${how}, giv och återgång i en film${turn ? `, vändningen ${turn.label.toLowerCase()}` : ''}${unturned ? ` (${unturned})` : ''}${tempo !== 100 ? `, kortets fart ${tempo} %` : ''}.`;
    await node('Registret över dockans filmer', ['tools/doll-reference-put.ts', out, '--id', plan.film, '--from', from, '--to', to, '--shape', 'ROUND_TRIP', '--doll', plan.doll, '--lays', plan.entry === 'A2.1' ? 'LH' : 'RH', '--motion', plan.motion, '--note', note]);
    rmSync(out, { recursive: true, force: true });
    const said = sentences.length ? ['--extra-efter', sentences.join(' ')] : [];
    const draft = await newCommand(root, [plan.dealer, plan.notation, '--tur-retur', '--docka', plan.doll, '--mall', String(ask.template ?? 15), '--sekunder', String(Math.round(Number(seconds))), '--title', plan.title, ...said]);
    return { ok: true, dry: false, id: draft.id, title: draft.title, place: plan.place, entry: plan.entry, film: plan.film, motion: plan.motion, standard, turn: turn?.id ?? null, unturned, landing: landing?.id ?? null, cardTempo: tempo, seconds: draft.seconds, cost: draft.cost, notes: draft.notes };
  } catch (error) {
    // a movement that got no film in the register is taken away again, so that the name is free
    const kept = existsSync(path.join(root, 'assets', 'references', 'docka', plan.film));
    if (!kept) rmSync(path.join(root, plan.motion), { force: true });
    rmSync(out, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  try {
    if (path.resolve(process.cwd()).toLowerCase() !== root.toLowerCase()) throw new StoreError(400, 'Kör från dealer-katalogen.');
    const args = process.argv.slice(2), at = args.indexOf('--mall'), template = at > 0 ? Number(args[at + 1]) : undefined, tv = args.indexOf('--vandning'), turn = tv >= 0 ? args[tv + 1] as TurnId : undefined;
    const plain = args.filter((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1) && (tv < 0 || i !== tv + 1));
    if (plain.length !== 2 || (at > 0 && !Number.isInteger(template)) || (tv >= 0 && !turn)) throw new StoreError(400, 'Använd: node tools/doll-order.ts <dealer> <P6.C1|D.C2> [--mall 15] [--flat-hand] [--vandning forut|i-handen] [--dry]');
    console.log(JSON.stringify(await dollOrder(root, { dealer: plain[0], place: plain[1], template, flatHand: args.includes('--flat-hand'), ...(turn ? { turn } : {}) }, { dry: args.includes('--dry') }), null, 2));
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
