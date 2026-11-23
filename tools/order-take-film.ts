// A delivered take of an order, for the lab to hand out, read only (Scen & bord's part Docka shows the films ordered with a
// film of the doll's beside it, also a take that has not been brought into the bank: studio/components/bordet/DollFilms.tsx).
// Only the film itself: assets/orders/<order>/take-<n>/after.mp4 (after tools/film-after.ts) or source.mp4 (as it came), or
// one of the two in one folder under the take (a cut copy, kapad-3/after.mp4), and only where the file really lies inside
// that order's folder. Nothing is written and nothing else under assets/orders/ is named here (the order's own pictures and
// reference film are the order store's, tools/order-store.ts servable).
// The lab server asks it where it hands out an order's media (tools/order-routes.ts, GET /assets/orders/…).
// Test: node --test tools/order-take-film.test.ts
import {realpath, stat} from 'node:fs/promises';
import path from 'node:path';

const NAME = '[a-z0-9]+(?:-[a-z0-9]+)*';
const TAKE = new RegExp(`^assets/orders/(${NAME})/(take-[1-9]\\d?)/(?:(${NAME})/)?((?:after|source)\\.mp4)$`);

/** Whether `file` (from the repo's root, with forward slashes) is a take's film that lies in its order's folder. */
export async function orderTakeFilm(file: string, root = process.cwd()): Promise<boolean> {
  const m = TAKE.exec(file);
  if (!m) return false;
  const parts = [m[1], m[2], ...(m[3] ? [m[3]] : []), m[4]];
  try {
    const real = await realpath(path.join(root, 'assets', 'orders', ...parts));
    if (real !== path.join(await realpath(path.join(root, 'assets', 'orders')), ...parts)) return false;
    return (await stat(real)).isFile();
  } catch {
    return false;
  }
}
