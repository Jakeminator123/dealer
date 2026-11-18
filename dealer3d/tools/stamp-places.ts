// Writes into a laid deal (dealer3d/data/giv-*.json) the places it was laid for: each card's place as the plan had it, a
// point on the felt in metres and its pixel in the bank's picture. The tests then check the file against itself and not
// against placements/default.json, which Jakob's saved plan changes. deal-film.ts writes them itself; this is for a file
// laid before it did, with the plan as it stood then (the plan in Git, read here; the files were laid with it).
//   node dealer3d/tools/stamp-places.ts dealer3d/data/giv-fran-2-3-p5.json [...]
import {readFile, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {TABLE_LENS} from '../../src/table-lens.ts';
import {spots} from '../src/world.ts';

const plan = JSON.parse(execFileSync('git', ['show', 'HEAD:placements/default.json'], {encoding: 'utf8'})), all = spots(plan, TABLE_LENS);
for (const file of process.argv.slice(2)) { const data = JSON.parse(await readFile(file, 'utf8'));
  data.places = (data.to as string[]).map(id => { const s = all.find(s => s.id === id); if (!s) throw Error(`${file}: the plan has no place ${id}.`); return {id, at: s.at, pixel: s.pixel}; });
  await writeFile(file, JSON.stringify(data) + '\n'); console.log(`${file}: ${data.places.length} platser`); }
