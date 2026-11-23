// The order from Scen & bord, Kortplan's step 3 (Jakob 2026-11-23: "hur beställer jag nu härifrån då?"): the doll's saved
// movement to one player's card becomes a draft in Kön, in one go. Four steps, each the tool that already does it:
//   1. dealer3d/tools/docka-cykel.ts    the give from A2.3 and the way back in one movement, laid as the doll lab lays it:
//                                       his saved standard for the doll and card where there is one, else "Naturlig"
//   2. dealer3d/tools/render-reference.ts   the doll's film of it (headless Chrome under the shared lock, about a minute)
//   3. tools/doll-reference-put.ts      the film into assets/references/docka/ and data/rendered-references.json
//   4. tools/order-new.ts               the draft: giv och återgång in one film, the doll's film as reference, template 15;
//                                       a landing other than the default (dealer3d/src/landing.ts) adds its sentence to the text,
//                                       and so does a card's tempo over 100 % (Kortets fart: only the card's hands are quicker)
//
//   node tools/doll-order.ts <dealer> <P6.C1> [--mall 15] [--flat-hand] [--dry]
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

const run = promisify(execFile);

export type DollOrderAsk = { dealer: string; place: string; template?: number; flatHand?: boolean };
export type DollOrderPlan = { dealer: string; doll: string; place: string; notation: string; edge: string; name: string; film: string; motion: string; title: string };

/** What the order will be called and where its files go: a new name each time, since a film made again gets a new id. */
export function dollOrderPlan(root: string, ask: DollOrderAsk): DollOrderPlan {
  const m = /^p([1-7])\.?c([1-9])$/i.exec(ask.place.trim());
  if (!m) throw new StoreError(400, `${ask.place}: välj en spelares kort (P1.C1 till P7.C2).`);
  if (!/^[a-z0-9]+$/.test(ask.dealer)) throw new StoreError(400, 'Okänd dealer.');
  const place = `P${m[1]}.C${m[2]}`, code = `p${m[1]}c${m[2]}`, notation = `A2.3 - A3P${m[1]}C${m[2]}`, doll = ask.dealer;
  const found = stepOfNotation(notation), def = STEPS.find((s) => s.key === found.step);
  const edge = def ? edgeOf(def, found.target) : null;
  if (!edge) throw new StoreError(400, `Inget steg i Beställ ger ${notation}.`);
  const register = path.join(root, 'data', 'rendered-references.json');
  const taken = new Set(existsSync(register) ? ((JSON.parse(readFileSync(register, 'utf8')) as { films?: { id: string }[] }).films ?? []).map((f) => f.id) : []);
  for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
    const name = `giv-fran-2-3-${code}-bestalld-${letter}-${doll}`, film = `docka-${doll}-2-3-${code}-bestalld-${letter}`;
    const motion = `dealer3d/data/${name}.json`;
    if (taken.has(film) || existsSync(path.join(root, motion)) || existsSync(path.join(root, 'assets', 'references', 'docka', film))) continue;
    const title = `${doll[0].toUpperCase()}${doll.slice(1)} · A3P${m[1]}C${m[2]} · giv och återgång, dockans sparade rörelse`;
    return { dealer: ask.dealer, doll, place, notation, edge, name, film, motion, title };
  }
  throw new StoreError(409, `${place} har redan 26 beställda filmer av dockan.`);
}

/** What the text says of a card's tempo over 100 % (BESKED "Snabbare: bara händerna med kortet"): the film shows it, the text keeps the rest of her unhurried. */
export const CARD_TEMPO_SENTENCE = 'Only the card and the hands holding it move quickly, as in video 1; her head, her gaze and her free hand keep an ordinary, unhurried pace.';

/** Makes the doll's film from the saved movement and the draft that orders with it; returns what the command prints. */
export async function dollOrder(root: string, ask: DollOrderAsk, options: { dry?: boolean } = {}): Promise<Record<string, unknown>> {
  const plan = dollOrderPlan(root, ask);
  if (options.dry) return { ok: true, dry: true, ...plan };
  const node = async (what: string, args: string[]) => {
    try { return (await run(process.execPath, args, { cwd: root, maxBuffer: 32 * 1024 * 1024, windowsHide: true })).stdout; }
    catch (error) {
      const said = String((error as { stderr?: string }).stderr ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^at |^Node\.js|^\^|^node:/.test(l));
      const line = said.find((l) => /^(?:Error: |\[RÖD\] )/.test(l))?.replace(/^(?:Error: |\[RÖD\] )/, '') ?? said.at(-1) ?? (error as Error).message;
      throw new StoreError(/låset/i.test(line) ? 409 : 500, `${what} gick inte: ${line}`);
    }
  };
  const [from, to] = plan.edge.split('>'), folder = path.join(root, '.runtime', 'docka-bestall'), out = path.join(folder, plan.name);
  const laid = await node('Dockans rörelse', ['dealer3d/tools/docka-cykel.ts', '--to', plan.place, '--out', plan.motion, '--doll', plan.doll, ...(ask.flatHand ? ['--flat-hand'] : [])]);
  try {
    const seconds = /--seconds (\d+(?:\.\d+)?) --fps 24/.exec(laid)?.[1];
    if (!seconds) throw new StoreError(500, 'Dockans rörelse sade inte hur lång den är.');
    mkdirSync(folder, { recursive: true });
    rmSync(out, { recursive: true, force: true });
    await node('Dockans film', ['dealer3d/tools/render-reference.ts', '--motion', plan.motion, '--out', out, '--seconds', seconds, '--fps', '24']);
    const standard = /hans standard (\S+?),/.exec(laid)?.[1] ?? null;
    const tempo = Number(/^kortets fart (\d+) %/m.exec(laid)?.[1] ?? 100);
    const note = `Gjord från Scen & bord, Kortplan: ${standard ? `hans sparade standard ${standard}` : 'ingen sparad standard, Naturlig som förval'}, giv och återgång i en film${tempo !== 100 ? `, kortets fart ${tempo} %` : ''}.`;
    await node('Registret över dockans filmer', ['tools/doll-reference-put.ts', out, '--id', plan.film, '--from', from, '--to', to, '--shape', 'ROUND_TRIP', '--doll', plan.doll, '--lays', 'RH', '--motion', plan.motion, '--note', note]);
    rmSync(out, { recursive: true, force: true });
    // The hand's landing at the laid card as the doll laid it (the cycle tool's line "landning <id>"), and the card's tempo
    // (its line "kortets fart N %"): the text says the same as the film shows.
    const landing = LANDINGS.find((l) => l.id === /^landning (\S+)/m.exec(laid)?.[1]);
    const sentences = [landing && landing.id !== LANDING_DEFAULT ? landing.sentence : null, tempo !== 100 ? CARD_TEMPO_SENTENCE : null].filter((x): x is string => !!x);
    const said = sentences.length ? ['--extra-efter', sentences.join(' ')] : [];
    const draft = await newCommand(root, [plan.dealer, plan.notation, '--tur-retur', '--docka', plan.doll, '--mall', String(ask.template ?? 15), '--sekunder', String(Math.round(Number(seconds))), '--title', plan.title, ...said]);
    return { ok: true, dry: false, id: draft.id, title: draft.title, place: plan.place, film: plan.film, motion: plan.motion, standard, landing: landing?.id ?? null, cardTempo: tempo, seconds: draft.seconds, cost: draft.cost, notes: draft.notes };
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
    const args = process.argv.slice(2), at = args.indexOf('--mall'), template = at > 0 ? Number(args[at + 1]) : undefined;
    const plain = args.filter((a, i) => !a.startsWith('--') && (at < 0 || i !== at + 1));
    if (plain.length !== 2 || (at > 0 && !Number.isInteger(template))) throw new StoreError(400, 'Använd: node tools/doll-order.ts <dealer> <P6.C1> [--mall 15] [--flat-hand] [--dry]');
    console.log(JSON.stringify(await dollOrder(root, { dealer: plain[0], place: plain[1], template, flatHand: args.includes('--flat-hand') }, { dry: args.includes('--dry') }), null, 2));
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
