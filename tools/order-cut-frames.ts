// Which cut frames hold as a last picture: data/cut-frames.json. A deal bara dit to a seat without a landing picture ends on
// the cut frame of the bank's own film to the seat (src/order-model.ts cutFrameOf), and such a frame holds only when its laid
// card lies on the plan's card (src/cut-frame.ts checkCutFrame). The store makes that check when a draft is made (it has the
// films); Material and Bordet show a seat's end picture before that, without the films. This tool makes the check once for
// every cut frame of a dealer and writes the answers down, so that all three say the same: a frame written here as not
// holding is no end picture anywhere (cutFrameOf leaves it out), and the store's own check stays the last word.
//
//   node tools/order-cut-frames.ts <dealer> [--root <folder with data and assets>] [--out <file>] [--dry]
//
// Run it again when the plan's cards have moved or new films have come into the bank. It reads films with FFmpeg and writes
// only the one file (default data/cut-frames.json of the root). Pure part: cutCheckKey and readCutChecks, tested in
// tools/order-model.test.ts and tools/order-routes.test.ts.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEAT_TARGETS, STEPS, cutCheckKey, cutFrameOf, type BankFacts, type CutCheck } from '../src/order-model.ts';
import { checkCutFrame } from '../src/cut-frame.ts';
import { H, W, pictureBytes, planQuad, readPlan, readRgb } from './order-images.ts';
import { motionRegister } from './register-store.ts';

export type CutFramesFile = { about: string; schemaVersion: 1; plan: { path: string; sha256: string }; checkedAt: string; frames: (CutCheck & { dealer: string; step: string; clip: string; frame: number; target: string })[] };

const ABOUT = "Which cut frames of the bank's own films hold as the last picture of a deal bara dit (src/order-model.ts cutFrameOf, seatEndOf): for each frame the check the store makes when a draft is made (src/cut-frame.ts checkCutFrame: the laid card within 5 px of the plan's card on the edges the fingers leave free), made once here so that Material, Bordet's row and the store say the same. holds false: the frame is no end picture, and the seat has none unless another frame or a landing picture holds. windowPrinted: the card in the shoe's window is printed, and the store puts the shoe back from anchor 1. Written by node tools/order-cut-frames.ts <dealer>; run it again when the plan's cards move or new films come into the bank. plan: the plan the frames were checked against.";

async function json<T>(file: string): Promise<T | null> { try { return JSON.parse(await readFile(file, 'utf8')) as T; } catch { return null; } }

/** The bank as cutFrameOf needs it, read from a checkout (as tools/order-store.ts readBank reads it). */
async function readBank(root: string): Promise<BankFacts> {
  const file = await json<{ jobs?: { id: string }[]; derived?: NonNullable<BankFacts['derived']> }>(path.join(root, 'data/clip-jobs.json'));
  const derived = file?.derived ?? [], motions: NonNullable<BankFacts['motions']> = {}, posts = motionRegister(root).posts();
  for (const d of derived) {
    const own = posts.get(d.id) as { review?: object; motion?: object } | undefined, clip = (posts.get(d.clip) ?? null) as { source?: object; review?: object } | null;
    motions[d.id] = { source: clip?.source, review: own?.review, motion: own?.motion } as never;
    if (!(d.clip in motions)) motions[d.clip] = clip as never;
  }
  return { jobs: (file?.jobs ?? []) as BankFacts['jobs'], derived, motions };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const dealer = args.find((a, i) => !a.startsWith('--') && !['--root', '--out'].includes(args[i - 1] ?? ''));
  const root = path.resolve(flag('--root') ?? fileURLToPath(new URL('../', import.meta.url)));
  if (!dealer) { console.error('Använd: node tools/order-cut-frames.ts <dealer> [--root <mapp>] [--out <fil>] [--dry]'); process.exit(2); }
  const out = path.resolve(flag('--out') ?? path.join(root, 'data/cut-frames.json'));
  const bank = await readBank(root), { plan, file: planFile } = await readPlan(root);
  const frames: CutFramesFile['frames'] = [];
  for (const step of STEPS.filter((s) => s.card && s.start !== 'LAND')) for (const target of SEAT_TARGETS) {
    const quad = planQuad(plan, target), side = plan.targets[target].intent.endSide;
    const box = [Math.min(...quad.map((p) => p[0])), Math.min(...quad.map((p) => p[1])), Math.max(...quad.map((p) => p[0])), Math.max(...quad.map((p) => p[1]))].map(Math.round) as [number, number, number, number];
    for (const hand of ['LH', 'RH'] as const) for (const cut of cutFrameOf(bank, { dealer, step, target, hand })) {
      let check: CutCheck;
      try {
        const r = checkCutFrame(await readRgb(await pictureBytes(root, { path: cut.path, frame: cut.frame })), W, H, box, { side });
        check = { holds: r.holds, problems: r.problems, windowPrinted: r.windowPrinted, offFromPlan: r.offFromPlan };
      } catch (error) { check = { holds: false, problems: [`filmen kunde inte läsas: ${(error as Error).message.slice(0, 120)}`], windowPrinted: false, offFromPlan: null }; }
      frames.push({ dealer, step: step.key, clip: cut.clip, frame: cut.frame, target, ...check });
      console.log(`${step.key} ${target} ${cutCheckKey(cut.clip, cut.frame, target)}: ${check.holds ? 'håller' : `faller (${check.problems.join(', ')})`}${check.windowPrinted ? ', skons kort tryckt' : ''}`);
    }
  }
  // Other dealers' frames in the file are kept as they are.
  const before = (await json<CutFramesFile>(out))?.frames.filter((f) => f.dealer !== dealer) ?? [];
  const next: CutFramesFile = { about: ABOUT, schemaVersion: 1, plan: planFile, checkedAt: new Date().toISOString().slice(0, 16) + 'Z', frames: [...before, ...frames] };
  if (!args.includes('--dry')) await writeFile(out, JSON.stringify(next, null, 2) + '\n');
  console.log(`${frames.length} snittrutor prövade för ${dealer}: ${frames.filter((f) => f.holds).length} håller.${args.includes('--dry') ? ' Inget skrivet (--dry).' : ` Skrivet: ${out}`}`);
}
