// node --test tools/order-take-film.test.ts
// What the lab may hand out of an order's takes: the take's film where it lies, and nothing else of the folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {orderTakeFilm} from './order-take-film.ts';

test('only a take\'s film inside its order\'s folder is handed out', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'take-film-'));
  try {
    const put = async (rel: string) => { await mkdir(path.dirname(path.join(root, rel)), {recursive: true}); await writeFile(path.join(root, rel), 'film'); };
    for (const rel of ['assets/orders/paow-giv-2-3-p5-03/take-1/after.mp4', 'assets/orders/paow-giv-2-3-p5-03/take-1/source.mp4', 'assets/orders/paow-giv-2-3-p5-03/take-1/kapad-3/after.mp4',
      'assets/orders/paow-giv-2-3-p5-03/take-1/after.json', 'assets/orders/paow-giv-2-3-p5-03/receipt.json', 'assets/secret/take-1/after.mp4', '.env.mp4']) await put(rel);
    const yes = ['assets/orders/paow-giv-2-3-p5-03/take-1/after.mp4', 'assets/orders/paow-giv-2-3-p5-03/take-1/source.mp4', 'assets/orders/paow-giv-2-3-p5-03/take-1/kapad-3/after.mp4'];
    for (const file of yes) assert.equal(await orderTakeFilm(file, root), true, file);
    const no = [
      'assets/orders/paow-giv-2-3-p5-03/take-2/after.mp4', // not on this machine
      'assets/orders/paow-giv-2-3-p5-03/take-1/after.json', 'assets/orders/paow-giv-2-3-p5-03/receipt.json', // not a film
      'assets/orders/paow-giv-2-3-p5-03/take-1/../../../secret/take-1/after.mp4', 'assets/orders/../secret/take-1/after.mp4', 'assets/orders/paow-giv-2-3-p5-03/take-1/../../../../.env.mp4',
      'assets/secret/take-1/after.mp4', 'assets\\orders\\paow-giv-2-3-p5-03\\take-1\\after.mp4', '/assets/orders/paow-giv-2-3-p5-03/take-1/after.mp4', 'assets/orders/Paow/take-1/after.mp4',
    ];
    for (const file of no) assert.equal(await orderTakeFilm(file, root), false, file);
  } finally { await rm(root, {recursive: true, force: true}); }
});
