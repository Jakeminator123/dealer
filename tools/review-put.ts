// A provisional verdict on one take, while Jakob cannot judge it himself: the main agent and an independent reviewer
// approve (ACCEPTED, or VARIANT) or reject (REJECTED) it under his mandate, and the take plays like an approved one until he
// judges. It never looks like his word: no userReview, userAccepted false, and a block review.provisional
// {by, at, mandate, note} (tools/review-store.ts applyProvisional). Granska lists it first among what waits for him;
// his decision there, a reset included, takes the provisional verdict away.
//
//   node tools/review-put.ts <clip-id> <ACCEPTED|VARIANT|REJECTED> --by "<who>" --mandate "<his words and date>" --note "<why>"
//   … --dry                  prints the review block it would write and writes nothing
//   … --root <folder>        another checkout (a temporary copy of the data)
//
// Same store as the lab's decisions: the revision read is the one presented, writes are queued and atomic, and only the
// `review` block of motions/<clip-id>.json changes. Refused where his verdict stands (a userReview, or a decision other than
// PENDING without a provisional block); an earlier provisional verdict may be replaced. Tests: tools/review-put.test.ts.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {StoreError} from './placement-store.ts';
import {applyProvisional, refusesProvisional, reviewStore, validateProvisional} from './review-store.ts';

const USAGE = 'Använd: node tools/review-put.ts <klipp-id> <ACCEPTED|VARIANT|REJECTED> --by "<vem>" --mandate "<Jakobs ord och datum>" --note "<varför>" [--dry] [--root <mapp>]';
const VALUED = ['--by', '--mandate', '--note', '--root'];

export type PutResult = {id: string; dry: boolean; review: Record<string, unknown>; revision: string | null; text: string};

/** Runs the command on `args` (process.argv without node and the script). Throws a StoreError with a message in Swedish. */
export async function reviewPut(args: string[], options: {root?: string; now?: () => string} = {}): Promise<PutResult> {
  const flag = (name: string) => { const i = args.indexOf(name); if (i < 0) return undefined; const v = args[i + 1]; if (v === undefined || v.startsWith('--')) throw new StoreError(400, `${name} saknar värde. ${USAGE}`); return v; };
  for (const a of args) if (a.startsWith('--') && !VALUED.includes(a) && a !== '--dry') throw new StoreError(400, `Okänd flagga ${a}. ${USAGE}`);
  const loose = args.filter((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1] ?? ''));
  if (loose.length !== 2) throw new StoreError(400, USAGE);
  const [id, word] = loose;
  const change = validateProvisional({decision: word.toUpperCase(), by: flag('--by'), mandate: flag('--mandate'), note: flag('--note')});
  const root = path.resolve(flag('--root') ?? options.root ?? fileURLToPath(new URL('../', import.meta.url)));
  const now = options.now ?? (() => new Date().toISOString());
  const store = reviewStore(root, undefined, now);
  const read = await store.load(id);
  const refused = refusesProvisional(read.record.review);
  if (refused) throw new StoreError(409, refused);
  if (args.includes('--dry')) {
    const review = applyProvisional(read.record.review, change, now());
    return {id, dry: true, review, revision: null, text: `Torrkörning, inget skrivet. motions/${id}.json skulle få review:\n${JSON.stringify(review, null, 2)}`};
  }
  const saved = await store.saveProvisional(id, change, read.revision);
  const said = change.decision === 'REJECTED' ? 'preliminärt underkänd' : change.decision === 'VARIANT' ? 'preliminärt godkänd som variant' : 'preliminärt godkänd';
  return {id, dry: false, review: saved.review, revision: saved.revision, text: `motions/${id}.json: ${said} av ${change.by}. Väntar på Jakobs dom i Granska; hans beslut ersätter den.`};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log((await reviewPut(process.argv.slice(2))).text); }
  catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
