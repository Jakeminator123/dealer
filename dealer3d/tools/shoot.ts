// Records the 3D page without a lab server: a file server of its own on 127.0.0.1 for the length of the run, one headless
// Chrome over the DevTools protocol (own profile and port), a PNG per asked moment, and everything closed at the end.
//   node dealer3d/tools/shoot.ts --out <folder> [--eyes 1,4] [--to P4.C1] [--look room|plain] [--size 1920x640] [--tags 0]
//        --times 0,0.92,1.9      stills at those seconds, named <prefix>-<seconds>.png
//        --film 24 0 4           every frame at 24 a second from 0 to 4 s, named <prefix>-0001.png ... (ffmpeg makes the film)
//        [--motion giv-pamela-p4]   a deal read off a film (dealer3d/data/<name>.json) instead of the one drawn by hand
//        [--doll paow]              a doll other than the standard, or than the one the motion names (dealer3d/src/doll.ts)
//        [--model <file.glb>]       a rigged model in the white figure's place (dealer3d/src/figure-model.ts); the file stays where it is
//        [--motion-file <file.json>] [--plan <file.json>]   serve these frozen inputs for the named motion and plan
//        [--prefix ruta] [--profile <new folder>] [--port 0] [--serve 0]   0 chooses a free port
// Run it under the shared lock for the graphics card and headless Chrome (docs/DRIFT.md): one run at a time, short.
import {createServer} from 'node:http';
import {spawn, execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const out = arg('--out'); if (!out) throw Error('usage: shoot.ts --out <folder> [--times a,b,c | --film fps from to] ...');
const root = fileURLToPath(new URL('../../', import.meta.url)), [W, H] = arg('--size', '1920x640')!.split('x').map(Number), prefix = arg('--prefix', 'ruta')!;
const CHROME = await realpath(process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const PORT = Number(arg('--port', '0')), SERVE = Number(arg('--serve', '0')), profileArg = arg('--profile');
if (![PORT, SERVE].every(port => Number.isInteger(port) && port >= 0 && port <= 65535)) throw Error('Portarna måste vara heltal 0–65535.');
const motion = arg('--motion'), motionFile = arg('--motion-file'), planFile = arg('--plan');
if (motionFile && !/^[\w-]+$/.test(motion ?? '')) throw Error('--motion-file needs a name from --motion');
const motionBytes = motionFile ? await readFile(motionFile, 'utf8') : null;
const planBytes = planFile ? await readFile(planFile, 'utf8') : null;
const filmAt = process.argv.indexOf('--film'), film = filmAt > 0 ? {fps: Number(process.argv[filmAt + 1]), from: Number(process.argv[filmAt + 2]), to: Number(process.argv[filmAt + 3])} : null;
const times = film ? Array.from({length: Math.round((film.to - film.from) * film.fps) + 1}, (_, i) => film.from + i / film.fps) : (arg('--times', '0')!).split(',').map(Number);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const jsonFrom = async (url: string) => (await fetch(url, {signal: AbortSignal.timeout(1500)})).json();
async function connect(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('DevTools svarade inte.')), 3000);
      socket.onopen = () => { clearTimeout(timeout); resolve(); };
      socket.onerror = () => { clearTimeout(timeout); reject(Error('DevTools kunde inte anslutas.')); };
    });
    return socket;
  } catch (error) {
    socket.close();
    throw error;
  }
}

// The file server: this folder's page, modules and data and the table's lens in src/ (TypeScript stripped of its types on the way out), three.js out of the
// locked dependency, and Jakob's plan for reading. Nothing else, and only GET.
const VENDOR: Record<string, string> = {'/vendor/three.module.js': 'node_modules/three/build/three.module.js', '/vendor/three.core.js': 'node_modules/three/build/three.core.js',
  '/vendor/addons/loaders/GLTFLoader.js': 'node_modules/three/examples/jsm/loaders/GLTFLoader.js', '/vendor/addons/utils/BufferGeometryUtils.js': 'node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'};
// --model: one rigged model from outside the repo, served as /model.glb for the length of the run (that file and nothing beside it).
const MODEL = arg('--model') ? path.resolve(arg('--model')!) : null; if (MODEL && !/\.glb$/i.test(MODEL)) throw Error('--model takes the path of one .glb file');
const TYPES: Record<string, string> = {'.html': 'text/html; charset=utf-8', '.ts': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8'};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x').pathname, file = VENDOR[url] ?? (url === '/placements/default.json' || url === '/src/table-lens.ts' || /^\/dealer3d\/(page|src|data)\/[\w.-]+\.(html|ts|json)$/.test(url) ? url.slice(1) : null);
    if (url === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (req.method === 'GET' && url === '/model.glb' && MODEL) { const bytes = await readFile(MODEL); res.writeHead(200, {'content-type': 'model/gltf-binary', 'content-length': bytes.length, 'cache-control': 'no-store'}).end(bytes); return; }
    if (req.method !== 'GET' || !file) { res.writeHead(404).end('not served'); return; }
    const ext = path.extname(file), input = file === 'placements/default.json' ? planBytes : file === `dealer3d/data/${motion}.json` ? motionBytes : null;
    const body = input ?? await readFile(path.join(root, file), 'utf8');
    res.writeHead(200, {'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'no-store'}).end(ext === '.ts' ? stripTypeScriptTypes(body) : body);
  } catch (e) { res.writeHead(500).end(String(e)); }
});
// Find only processes whose executable and full profile argument match. Check PID, parent and start time again before stopping.
type ChromeProcess = {pid: number; parent: number; created: string};
function profileProcesses(profile: string, stop?: readonly ChromeProcess[]): ChromeProcess[] {
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$p = [regex]::Escape($env:DEALER_SHOOT_PROFILE)
$argument = '(?<!\S)(?:"--user-data-dir=' + $p + '"|--user-data-dir="' + $p + '"|--user-data-dir=' + $p + ')(?=\s|$)'
$owned = @(Get-CimInstance Win32_Process -Filter $env:DEALER_SHOOT_CHROME_FILTER | Where-Object {
  $_.ExecutablePath -ieq $env:DEALER_SHOOT_CHROME -and $_.CommandLine -match $argument
} | ForEach-Object { @{ pid = $_.ProcessId; parent = $_.ParentProcessId; created = [string]$_.CreationDate.Ticks } })
if ($env:DEALER_SHOOT_STOP) {
  foreach ($old in (ConvertFrom-Json $env:DEALER_SHOOT_STOP)) {
    $same = $owned | Where-Object { $_.pid -eq $old.pid -and $_.parent -eq $old.parent -and $_.created -eq $old.created }
    if ($same) { Stop-Process -Id $same.pid -Force -ErrorAction SilentlyContinue }
  }
}
ConvertTo-Json -InputObject $owned -Compress
`;
  const env = {...process.env, DEALER_SHOOT_PROFILE: profile, DEALER_SHOOT_CHROME: CHROME,
    DEALER_SHOOT_CHROME_FILTER: `Name='${path.basename(CHROME).replaceAll("'", "''")}'`,
    DEALER_SHOOT_STOP: stop ? JSON.stringify(stop) : ''};
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {env, encoding: 'utf8', windowsHide: true, timeout: 15000}));
}

let profile: string | undefined;
let chrome: ReturnType<typeof spawn> | undefined;
let ws: WebSocket | undefined;
let browserEndpoint: string | undefined;
let interrupted = false;
const interrupt = () => { interrupted = true; };
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);
const assertRunning = () => { if (interrupted) throw Error('Inspelningen avbröts.'); };
let code = 0;
try {
  await mkdir(out, {recursive: true});
  if (profileArg) {
    const asked = path.resolve(profileArg);
    await mkdir(path.dirname(asked), {recursive: true});
    await mkdir(asked);
    profile = asked;
  } else profile = await mkdtemp(path.join(tmpdir(), 'dealer3d-chrome-'));
  await new Promise<void>((done, fail) => server.once('error', fail).listen(SERVE, '127.0.0.1', done));
  const servePort = (server.address() as {port: number}).port;
  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', `--window-size=${W},${H}`, 'about:blank'], {stdio: 'ignore', windowsHide: true});
  let chromeError: Error | undefined;
  chrome.on('error', error => { chromeError = error; });
  let port = PORT, browserPath: string | undefined;
  const startupDeadline = Date.now() + 12000;
  while (!browserPath && Date.now() < startupDeadline) {
    assertRunning();
    if (chromeError) throw chromeError;
    if (chrome.exitCode !== null) throw Error(`Chrome avslutades före inspelningen (${chrome.exitCode}).`);
    try {
      if (PORT === 0) {
        const [selected, endpoint] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/);
        if (/^\d+$/.test(selected) && /^\/devtools\/browser\/[a-f\d-]+$/i.test(endpoint)) {
          port = Number(selected);
          browserPath = endpoint;
        }
      } else {
        const listenerPid = Number(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
          `(Get-NetTCPConnection -State Listen -LocalPort ${PORT} -ErrorAction SilentlyContinue | Where-Object LocalAddress -EQ '127.0.0.1' | Select-Object -First 1).OwningProcess`], {encoding: 'utf8', windowsHide: true, timeout: 5000}).trim());
        if (listenerPid && profileProcesses(profile).some(p => p.pid === listenerPid)) {
          browserPath = new URL((await jsonFrom(`http://127.0.0.1:${port}/json/version`)).webSocketDebuggerUrl).pathname;
        }
      }
    } catch { /* Chrome has not published an endpoint yet. */ }
    if (!browserPath) await sleep(200);
  }
  if (!browserPath) throw Error('Chrome gav ingen egen DevTools-port.');
  browserEndpoint = `ws://127.0.0.1:${port}${browserPath}`;
  const browser = await jsonFrom(`http://127.0.0.1:${port}/json/version`);
  if (new URL(browser.webSocketDebuggerUrl).pathname !== browserPath) throw Error('DevTools svarade från en annan Chrome.');
  let target: {type: string; webSocketDebuggerUrl: string} | undefined;
  for (let i = 0; i < 60 && !target; i++) {
    assertRunning();
    try { target = (await jsonFrom(`http://127.0.0.1:${port}/json`)).find((t: {type: string}) => t.type === 'page'); } catch { /* not up yet */ }
    if (!target) await sleep(200);
  }
  if (!target) throw Error('Chrome did not start.');
  const page = await connect(target.webSocketDebuggerUrl);
  ws = page;
  const pending = new Map<number, {resolve(v: any): void; reject(e: Error): void; timeout: ReturnType<typeof setTimeout>}>(), errors: string[] = []; let seq = 0;
  page.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pending.has(m.id)) { const p = pending.get(m.id)!; pending.delete(m.id); clearTimeout(p.timeout); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push('PAGE ERROR ' + JSON.stringify(m.params.exceptionDetails).slice(0, 700));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console error ' + m.params.args.map((a: {value?: unknown; description?: string}) => a.value ?? a.description).join(' ').slice(0, 400));
    else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push(`HTTP ${m.params.response.status} ${m.params.response.url}`); };
  const send = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => {
    assertRunning();
    const id = ++seq;
    page.send(JSON.stringify({id, method, params}));
    const timeout = setTimeout(() => { pending.delete(id); reject(Error(`DevTools svarade inte på ${method}.`)); }, 15000);
    pending.set(id, {resolve, reject, timeout});
  });
  const run = async (expression: string) => { const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 700)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: W, height: H, deviceScaleFactor: 1, mobile: false});
  const query = new URLSearchParams({eyes: arg('--eyes', '1,4')!, to: arg('--to', 'P4.C1')!, look: arg('--look', 'room')!, tags: arg('--tags', '1')!, ...(motion ? {motion} : {}), ...(MODEL ? {model: '1'} : {}), ...(arg('--doll') ? {docka: arg('--doll')!} : {})});
  await send('Page.navigate', {url: `http://127.0.0.1:${servePort}/dealer3d/page/index.html?${query}`});
  // A model is tens of megabytes to fetch, read and send to the graphics card: the page gets two minutes instead of twenty seconds.
  let ready = false; for (let i = 0; i < (MODEL ? 480 : 80) && !ready; i++) { assertRunning(); await sleep(250); ready = await run('!!(window.dealer3d && window.dealer3d.ready)'); if (errors.length) break; }
  if (!ready) throw Error('The page did not come up. ' + errors.join(' | '));
  const facts = await run('JSON.stringify({dealVersion: dealer3d.dealVersion, duration: dealer3d.duration, moments: dealer3d.moments, lens: dealer3d.lens, landed: dealer3d.landed, model: dealer3d.model, gl: (() => { const c = document.createElement("canvas").getContext("webgl2"); const e = c && c.getExtension("WEBGL_debug_renderer_info"); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; })()})');
  console.log('page', facts);
  const figure: unknown[] = []; // with a model: its arms' joints at every moment shot (figure-model.ts, measure)
  for (let i = 0; i < times.length; i++) {
    await run(`dealer3d.setTime(${times[i]})`); if (MODEL) figure.push(JSON.parse(await run('JSON.stringify(dealer3d.figureNow())')));
    const shot = await send('Page.captureScreenshot', {format: 'png'}), name = film ? `${prefix}-${String(i + 1).padStart(4, '0')}.png` : `${prefix}-${times[i].toFixed(2)}.png`;
    await writeFile(path.join(out, name), Buffer.from(shot.data, 'base64'));
  }
  await writeFile(path.join(out, `${prefix}.json`), JSON.stringify({page: JSON.parse(facts), chrome: browser.Browser, protocol: browser['Protocol-Version'], query: Object.fromEntries(query), size: [W, H], times, film, ...(MODEL ? {figure} : {})}, null, 1) + '\n');
  console.log(`${times.length} pictures in ${out}`, errors.length ? 'FEL: ' + errors.join(' | ') : 'no page errors');
  if (errors.length) code = 2;
} catch (e) { console.error(String(e)); code = 1; } finally {
  ws?.close();
  if (browserEndpoint) {
    let browserSocket: WebSocket | undefined;
    try {
      browserSocket = await connect(browserEndpoint);
      browserSocket.send(JSON.stringify({id: 1, method: 'Browser.close'}));
      await sleep(1200);
    } catch { /* The verified-profile fallback below handles a closed or unresponsive Chrome. */ }
    finally { browserSocket?.close(); }
  }
  server.close();
  if (profile) {
    try {
      let running = chrome?.pid ? profileProcesses(profile) : [];
      for (let i = 0; i < 3 && running.length; i++) { await sleep(350); running = profileProcesses(profile); }
      if (running.length) {
        profileProcesses(profile, running);
        await sleep(350);
        running = profileProcesses(profile);
      }
      if (running.length || (chrome?.pid && chrome.exitCode === null && chrome.signalCode === null)) throw Error(`Chrome kunde inte bekräftas stängd. Profilen finns kvar i ${profile}.`);
      await rm(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 200});
      console.log(`Chrome stängd (pid ${chrome?.pid ?? 'ingen'}) och egen profil borttagen.`);
    } catch (error) {
      code = 1;
      console.error(error);
    }
  }
  process.exitCode = code;
}
