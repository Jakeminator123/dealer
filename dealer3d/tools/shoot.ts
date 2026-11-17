// Records the 3D page without a lab server: a file server of its own on 127.0.0.1 for the length of the run, one headless
// Chrome over the DevTools protocol (own profile and port), a PNG per asked moment, and everything closed at the end.
//   node dealer3d/tools/shoot.ts --out <folder> [--eyes 1,4] [--to P4.C1] [--look room|plain] [--size 1920x640] [--tags 0]
//        --times 0,0.92,1.9      stills at those seconds, named <prefix>-<seconds>.png
//        --film 24 0 4           every frame at 24 a second from 0 to 4 s, named <prefix>-0001.png ... (ffmpeg makes the film)
//        [--motion giv-pamela-p4]   a deal read off a film (dealer3d/data/<name>.json) instead of the one drawn by hand
//        [--prefix ruta] [--profile <folder>] [--port 9601] [--serve 9611]
// Run it under the shared lock for the graphics card and headless Chrome (docs/DRIFT.md): one run at a time, short.
import {createServer} from 'node:http';
import {spawn, execFileSync} from 'node:child_process';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const out = arg('--out'); if (!out) throw Error('usage: shoot.ts --out <folder> [--times a,b,c | --film fps from to] ...');
const root = fileURLToPath(new URL('../../', import.meta.url)), [W, H] = arg('--size', '1920x640')!.split('x').map(Number), prefix = arg('--prefix', 'ruta')!;
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', PORT = Number(arg('--port', '9601')), SERVE = Number(arg('--serve', '9611')), PROFILE = arg('--profile', path.join(out, '.chrome-profil'))!;
const filmAt = process.argv.indexOf('--film'), film = filmAt > 0 ? {fps: Number(process.argv[filmAt + 1]), from: Number(process.argv[filmAt + 2]), to: Number(process.argv[filmAt + 3])} : null;
const times = film ? Array.from({length: Math.round((film.to - film.from) * film.fps) + 1}, (_, i) => film.from + i / film.fps) : (arg('--times', '0')!).split(',').map(Number);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// The file server: this folder's page, modules and data and the table's lens in src/ (TypeScript stripped of its types on the way out), three.js out of the
// locked dependency, and Jakob's plan for reading. Nothing else, and only GET.
const VENDOR: Record<string, string> = {'/vendor/three.module.js': 'node_modules/three/build/three.module.js', '/vendor/three.core.js': 'node_modules/three/build/three.core.js'};
const TYPES: Record<string, string> = {'.html': 'text/html; charset=utf-8', '.ts': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8'};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x').pathname, file = VENDOR[url] ?? (url === '/placements/default.json' || url === '/src/table-lens.ts' || /^\/dealer3d\/(page|src|data)\/[\w.-]+\.(html|ts|json)$/.test(url) ? url.slice(1) : null);
    if (url === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (req.method !== 'GET' || !file) { res.writeHead(404).end('not served'); return; }
    const ext = path.extname(file), body = await readFile(path.join(root, file), 'utf8');
    res.writeHead(200, {'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'no-store'}).end(ext === '.ts' ? stripTypeScriptTypes(body) : body);
  } catch (e) { res.writeHead(500).end(String(e)); }
});
await new Promise<void>((done, fail) => server.once('error', fail).listen(SERVE, '127.0.0.1', done));

const leftovers = () => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${PROFILE.replace(/\\/g, '/').split('/').slice(-2).join('*')}*' } | ForEach-Object { $_.ProcessId }`], {encoding: 'utf8'}).split(/\s+/).filter(Boolean).map(Number);
if (leftovers().length) { server.close(); throw Error('a Chrome of this profile is already running: ' + leftovers().join(' ')); }
await mkdir(out, {recursive: true});
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--hide-scrollbars', '--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', `--window-size=${W},${H}`, 'about:blank'], {stdio: 'ignore'});
let code = 0;
try {
  let target: {type: string; webSocketDebuggerUrl: string} | undefined; for (let i = 0; i < 60 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t: {type: string}) => t.type === 'page'); } catch { /* not up yet */ } }
  if (!target) throw Error('Chrome did not start.');
  const ws = new WebSocket(target.webSocketDebuggerUrl), pending = new Map<number, {resolve(v: any): void; reject(e: Error): void}>(), errors: string[] = []; let seq = 0;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pending.has(m.id)) { const p = pending.get(m.id)!; pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push('PAGE ERROR ' + JSON.stringify(m.params.exceptionDetails).slice(0, 700));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console error ' + m.params.args.map((a: {value?: unknown; description?: string}) => a.value ?? a.description).join(' ').slice(0, 400));
    else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push(`HTTP ${m.params.response.status} ${m.params.response.url}`); };
  const send = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => { const id = ++seq; pending.set(id, {resolve, reject}); ws.send(JSON.stringify({id, method, params})); });
  const run = async (expression: string) => { const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 700)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: W, height: H, deviceScaleFactor: 1, mobile: false});
  const query = new URLSearchParams({eyes: arg('--eyes', '1,4')!, to: arg('--to', 'P4.C1')!, look: arg('--look', 'room')!, tags: arg('--tags', '1')!, ...(arg('--motion') ? {motion: arg('--motion')!} : {})});
  await send('Page.navigate', {url: `http://127.0.0.1:${SERVE}/dealer3d/page/index.html?${query}`});
  let ready = false; for (let i = 0; i < 80 && !ready; i++) { await sleep(250); ready = await run('!!(window.dealer3d && window.dealer3d.ready)').catch(() => false); if (errors.length) break; }
  if (!ready) throw Error('The page did not come up. ' + errors.join(' | '));
  const facts = await run('JSON.stringify({dealVersion: dealer3d.dealVersion, duration: dealer3d.duration, moments: dealer3d.moments, lens: dealer3d.lens, landed: dealer3d.landed, gl: (() => { const c = document.createElement("canvas").getContext("webgl2"); const e = c && c.getExtension("WEBGL_debug_renderer_info"); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; })()})');
  console.log('page', facts);
  for (let i = 0; i < times.length; i++) {
    await run(`dealer3d.setTime(${times[i]})`);
    const shot = await send('Page.captureScreenshot', {format: 'png'}), name = film ? `${prefix}-${String(i + 1).padStart(4, '0')}.png` : `${prefix}-${times[i].toFixed(2)}.png`;
    await writeFile(path.join(out, name), Buffer.from(shot.data, 'base64'));
  }
  await writeFile(path.join(out, `${prefix}.json`), JSON.stringify({page: JSON.parse(facts), query: Object.fromEntries(query), size: [W, H], times, film}, null, 1) + '\n');
  console.log(`${times.length} pictures in ${out}`, errors.length ? 'FEL: ' + errors.join(' | ') : 'no page errors');
  if (errors.length) code = 2;
  ws.close();
} catch (e) { console.error(String(e)); code = 1; } finally {
  // Chrome is asked to close itself; only what is still there afterwards is ended by process id.
  try { const b = new WebSocket((await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl); await new Promise((r, j) => { b.onopen = r; b.onerror = j; }); b.send(JSON.stringify({id: 1, method: 'Browser.close'})); await sleep(1200); } catch { /* not reachable: ended below */ }
  for (let i = 0; i < 20 && leftovers().length; i++) await sleep(250);
  for (const pid of leftovers()) try { execFileSync('taskkill', ['/PID', String(pid), '/F']); } catch { /* gone */ }
  console.log(`chrome closed (pid ${chrome.pid}); left now: ${leftovers().length ? leftovers().join(' ') : 'none'}`);
  server.close(); await rm(PROFILE, {recursive: true, force: true}).catch(() => {});
  process.exit(code);
}
