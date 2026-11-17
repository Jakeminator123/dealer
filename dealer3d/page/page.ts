// The page: one deal, seen through the eyes named in the address.
//   ?eyes=1,4      which views, from the left: a seat 1-7, or "film" for the bank's camera (seat 4 is the same eye)
//   ?to=P4.C1      the card place dealt to
//   ?motion=giv-pamela-p4   a deal read off a film (dealer3d/data/<name>.json) instead of the one drawn by hand; ?to= is then the film's own place
//   ?look=room     room (felt table) or plain (white figure on grey, for a reference film)
//   ?tags=0        no names on the views and no clock
//   ?t=1.9         the moment shown, seconds; ?play=1 runs the deal in a loop
// The recorder (dealer3d/tools/shoot.ts) drives it through window.dealer3d: setTime(seconds) draws that moment.
import {createStage, type Look, type View} from '../src/stage.ts';
import {DEAL_VERSION, sideSeen} from '../src/deal.ts';

const q = new URLSearchParams(location.search), canvas = document.getElementById('stage') as HTMLCanvasElement;
const views: View[] = (q.get('eyes') ?? '1,4').split(',').map(s => s.trim() === 'film' ? 'film' : Number(s)).filter(v => v === 'film' || (Number.isInteger(v) && v >= 1 && v <= 7));
const tags = q.get('tags') !== '0', plan = await (await fetch('/placements/default.json')).json();
canvas.width = innerWidth; canvas.height = innerHeight;
const motion = /^[\w-]+$/.test(q.get('motion') ?? '') ? q.get('motion') : null, read = motion ? await (await fetch(`/dealer3d/data/${motion}.json`)).json() : null;
const stage = createStage(canvas, plan, {look: (q.get('look') === 'plain' ? 'plain' : 'room') as Look, target: q.get('to') ?? 'P4.C1', read});
const names = {FRONT: 'ser framsidan', BACK: 'ser baksidan', EDGE: 'ser kortet på kant'}, host = document.getElementById('tags')!, clock = document.getElementById('clock')!;
function draw() {
  const boxes = stage.render(views), shown = stage.state();
  if (!tags) { clock.style.display = 'none'; return; }
  host.replaceChildren(...boxes.map((b, i) => { const view = views[i], tag = document.createElement('div'); tag.className = 'tag'; tag.style.left = `${b.left}px`; tag.style.top = `${b.top}px`;
    tag.textContent = view === 'film' ? 'Bankens kamera' : view === 4 ? 'Stol 4 (bankens kamera)' : `Stol ${view}`;
    if (shown) { const small = document.createElement('small'); small.textContent = names[sideSeen(shown.card, stage.eyeOf(view).position)]; tag.append(small); }
    return tag; }));
  clock.textContent = `${stage.time().toFixed(2).replace('.', ',')} s`;
}
const setTime = (t: number) => { stage.setTime(t); draw(); return new Promise<void>(done => requestAnimationFrame(() => requestAnimationFrame(() => done()))); };
await setTime(Number(q.get('t') ?? 0));
if (q.get('play') === '1') { const began = performance.now(); const tick = () => { stage.setTime(((performance.now() - began) / 1000) % (stage.duration + 0.6)); draw(); requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
addEventListener('resize', () => location.reload());
(window as unknown as {dealer3d: unknown}).dealer3d = {ready: true, dealVersion: DEAL_VERSION, duration: stage.duration, moments: stage.moments, setTime, lens: stage.lens, landed: stage.landed()};
