import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { buildReturnCycle, type DealMotion } from '../src/return-cycle.ts';

const usage = 'node dealer3d/tools/return-cycle.ts <source.json> <new.json> [--hold <frame>] [--ready <frame>] [--duration <seconds>] [--lift <metres>]';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      hold: { type: 'string' },
      ready: { type: 'string' },
      duration: { type: 'string' },
      lift: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  if (positionals.length !== 2) throw new Error(usage);

  const [source, target] = positionals;
  const bytes = await readFile(source);
  const motion: DealMotion = JSON.parse(bytes.toString('utf8'));
  const path = relative(process.cwd(), resolve(source)).split(sep).join('/');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const options = {
    holdThrough: numberOption(values.hold, '--hold'),
    readyFrom: numberOption(values.ready, '--ready'),
    durationSeconds: numberOption(values.duration, '--duration'),
    liftMeters: numberOption(values.lift, '--lift'),
  };
  const cycle = buildReturnCycle(motion, { path, sha256 }, options);
  await writeFile(target, JSON.stringify(cycle) + '\n', { flag: 'wx' });
  console.log(`${target}: ${cycle.frameCount} frames, first ready frame ${cycle.cycle.readyFrom}, source SHA-256 ${sha256}`);
}

function numberOption(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return;
  const number = Number(value);
  if (!value.trim() || !Number.isFinite(number)) throw new Error(`${flag} expects a finite number`);
  return number;
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
