// Records the page of the test "one deal, two chairs" (dealer3d/page/prov.ts): a file server of its own on 127.0.0.1 for
// the length of the run, one headless Chrome over the DevTools protocol (own profile, own port), a PNG per asked moment,
// and everything closed at the end. shoot.ts does the same for the folder's ordinary page; this one also serves what the
// test needs and Git does not hold (three's FBX reader, and from <work>: the laid-out scene, SAM's surface, the pack's files).
//   node dealer3d/tools/prov-shoot.ts --source sam|pack --out <folder> [--work .runtime/3d-prov] [--eyes 4,1] [--size 3528x1174]
//        --times 0,0.92,1.9      stills at those seconds, named <prefix>-<seconds>.png
//        --film                  every frame of the scene, named <prefix>-0001.png ... (ffmpeg makes the film)
//        [--prefix ruta]
// Run it under the shared lock for the graphics card and headless Chrome (docs/DRIFT.md): one run at a time, short.
// The Chrome handling is shoot.ts's own, repeated: if the test goes on, shoot.ts should take the page as an option instead.
import {createServer} from 'node:http';
import {spawn, execFileSync} from 'node:child_process';
import {mkdir, mkdtemp, readFile, realpath, rm, writeFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const arg = (name: string, fallback?: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : fallback; };
const out = arg('--out'), source = arg('--source'); if (!out || (source !== 'sam' && source !== 'pack')) throw Error('usage: prov-shoot.ts --source sam|pack --out <folder> [--times a,b,c | --film]');
const root = fileURLToPath(new URL('../../', import.meta.url)), work = path.resolve(arg('--work', path.join(root, '.runtime/3d-prov'))!), [W, H] = arg('--size', '3528x1174')!.split('x').map(Number), prefix = arg('--prefix', 'ruta')!;
const CHROME = await realpath(process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const scene = JSON.parse(await readFile(path.join(work, 'scene', `${source}.json`), 'utf8')), film = process.argv.includes('--film');
const times: number[] = film ? Array.from({length: scene.frameCount}, (_, i) => i / scene.fps) : arg('--times', '0')!.split(',').map(Number);
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
  } catch (error) { socket.close(); throw error; }
}

// The file server, only GET: this folder's pages and modules and the table's lens (TypeScript stripped of its types on the
// way out), Jakob's plan for reading, three.js and its add-ons out of the locked dependency, and the test's own files in <work>.
const TYPES: Record<string, string> = {'.html': 'text/html; charset=utf-8', '.ts': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8'};
function fileOf(url: string): string | null {
  if (url.includes('..')) return null;
  if (url === '/placements/default.json' || url === '/src/table-lens.ts' || /^\/dealer3d\/(page|src)\/[\w.-]+\.(html|ts)$/.test(url)) return path.join(root, url.slice(1));
  if (url === '/vendor/three.module.js' || url === '/vendor/three.core.js') return path.join(root, 'node_modules/three/build', path.basename(url));
  const addon = /^\/vendor\/addons\/((?:[\w-]+\/)*[\w.-]+\.js)$/.exec(url); if (addon) return path.join(root, 'node_modules/three/examples/jsm', addon[1]);
  const own = /^\/prov\/((?:scene|sam\/read|pack)\/[\w.-]+\.(?:json|f32|u32|fbx))$/i.exec(url); return own ? path.join(work, own[1]) : null;
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x').pathname, file = fileOf(url);
    if (url === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (req.method !== 'GET' || !file) { res.writeHead(404).end('not served'); return; }
    const ext = path.extname(file).toLowerCase(), bytes = await readFile(file);
    res.writeHead(200, {'content-type': TYPES[ext] ?? 'application/octet-stream', 'cache-control': 'no-store'}).end(ext === '.ts' ? stripTypeScriptTypes(bytes.toString('utf8')) : bytes);
  } catch (e) { res.writeHead((e as {code?: string}).code === 'ENOENT' ? 404 : 500).end(String(e)); }
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
  const env = {...process.env, DEALER_SHOOT_PROFILE: profile, DEALER_SHOOT_CHROME: CHROME, DEALER_SHOOT_CHROME_FILTER: `Name='${path.basename(CHROME).replaceAll("'", "''")}'`, DEALER_SHOOT_STOP: stop ? JSON.stringify(stop) : ''};
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {env, encoding: 'utf8', windowsHide: true, timeout: 15000}));
}

let profile: string | undefined, chrome: ReturnType<typeof spawn> | undefined, ws: WebSocket | undefined, browserEndpoint: string | undefined, interrupted = false, code = 0;
const interrupt = () => { interrupted = true; }; process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt);
const assertRunning = () => { if (interrupted) throw Error('Inspelningen avbröts.'); };
try {
  await mkdir(out, {recursive: true});
  profile = await mkdtemp(path.join(tmpdir(), 'dealer3d-prov-chrome-'));
  await new Promise<void>((done, fail) => server.once('error', fail).listen(0, '127.0.0.1', done));
  const servePort = (server.address() as {port: number}).port;
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars', '--mute-audio', '--ignore-gpu-blocklist', '--use-angle=d3d11', `--window-size=${W},${H}`, 'about:blank'], {stdio: 'ignore', windowsHide: true});
  let chromeError: Error | undefined; chrome.on('error', error => { chromeError = error; });
  let port = 0, browserPath: string | undefined; const startupDeadline = Date.now() + 12000;
  while (!browserPath && Date.now() < startupDeadline) {
    assertRunning(); if (chromeError) throw chromeError; if (chrome.exitCode !== null) throw Error(`Chrome avslutades före inspelningen (${chrome.exitCode}).`);
    try { const [selected, endpoint] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).trim().split(/\r?\n/); if (/^\d+$/.test(selected) && /^\/devtools\/browser\/[a-f\d-]+$/i.test(endpoint)) { port = Number(selected); browserPath = endpoint; } } catch { /* Chrome has not published an endpoint yet. */ }
    if (!browserPath) await sleep(200);
  }
  if (!browserPath) throw Error('Chrome gav ingen egen DevTools-port.');
  browserEndpoint = `ws://127.0.0.1:${port}${browserPath}`;
  const browser = await jsonFrom(`http://127.0.0.1:${port}/json/version`);
  if (new URL(browser.webSocketDebuggerUrl).pathname !== browserPath) throw Error('DevTools svarade från en annan Chrome.');
  let target: {type: string; webSocketDebuggerUrl: string} | undefined;
  for (let i = 0; i < 60 && !target; i++) { assertRunning(); try { target = (await jsonFrom(`http://127.0.0.1:${port}/json`)).find((t: {type: string}) => t.type === 'page'); } catch { /* not up yet */ } if (!target) await sleep(200); }
  if (!target) throw Error('Chrome did not start.');
  const page = await connect(target.webSocketDebuggerUrl); ws = page;
  const pending = new Map<number, {resolve(v: any): void; reject(e: Error): void; timeout: ReturnType<typeof setTimeout>}>(), errors: string[] = []; let seq = 0;
  page.onmessage = e => { const m = JSON.parse(String(e.data)); if (m.id && pending.has(m.id)) { const p = pending.get(m.id)!; pending.delete(m.id); clearTimeout(p.timeout); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errors.push('PAGE ERROR ' + JSON.stringify(m.params.exceptionDetails).slice(0, 700));
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console error ' + m.params.args.map((a: {value?: unknown; description?: string}) => a.value ?? a.description).join(' ').slice(0, 400));
    else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push(`HTTP ${m.params.response.status} ${m.params.response.url}`); };
  const send = (method: string, params: object = {}) => new Promise<any>((resolve, reject) => { assertRunning(); const id = ++seq; page.send(JSON.stringify({id, method, params}));
    const timeout = setTimeout(() => { pending.delete(id); reject(Error(`DevTools svarade inte på ${method}.`)); }, 20000); pending.set(id, {resolve, reject, timeout}); });
  const run = async (expression: string) => { const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 700)); return r.result.value; };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: W, height: H, deviceScaleFactor: 1, mobile: false});
  const query = new URLSearchParams({source, eyes: arg('--eyes', '4,1')!}), began = Date.now();
  await send('Page.navigate', {url: `http://127.0.0.1:${servePort}/dealer3d/page/prov.html?${query}`});
  let ready = false; for (let i = 0; i < 240 && !ready; i++) { assertRunning(); await sleep(250); ready = await run('!!(window.dealer3d && window.dealer3d.ready)'); if (errors.length) break; }
  if (!ready) throw Error('The page did not come up. ' + errors.join(' | '));
  const facts = await run('JSON.stringify({source: dealer3d.source, duration: dealer3d.duration, frameCount: dealer3d.frameCount, fps: dealer3d.fps, beats: dealer3d.beats, triangles: dealer3d.triangles, loadMs: dealer3d.loadMs, gl: (() => { const c = document.createElement("canvas").getContext("webgl2"); const e = c && c.getExtension("WEBGL_debug_renderer_info"); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; })()})');
  console.log('page', facts);
  for (let i = 0; i < times.length; i++) {
    await run(`dealer3d.setTime(${times[i]})`);
    const shot = await send('Page.captureScreenshot', {format: 'png'}), name = film ? `${prefix}-${String(i + 1).padStart(4, '0')}.png` : `${prefix}-${times[i].toFixed(2)}.png`;
    await writeFile(path.join(out, name), Buffer.from(shot.data, 'base64'));
  }
  await writeFile(path.join(out, `${prefix}.json`), JSON.stringify({page: JSON.parse(facts), chrome: browser.Browser, query: Object.fromEntries(query), size: [W, H], times, film, seconds: +((Date.now() - began) / 1000).toFixed(1)}, null, 1) + '\n');
  console.log(`${times.length} pictures in ${out} in ${((Date.now() - began) / 1000).toFixed(1)} s`, errors.length ? 'FEL: ' + errors.join(' | ') : 'no page errors');
  if (errors.length) code = 2;
} catch (e) { console.error(String(e)); code = 1; } finally {
  ws?.close();
  if (browserEndpoint) { let browserSocket: WebSocket | undefined;
    try { browserSocket = await connect(browserEndpoint); browserSocket.send(JSON.stringify({id: 1, method: 'Browser.close'})); await sleep(1200); } catch { /* The verified-profile fallback below handles a closed or unresponsive Chrome. */ } finally { browserSocket?.close(); } }
  server.close();
  if (profile) {
    try {
      let running = chrome?.pid ? profileProcesses(profile) : [];
      for (let i = 0; i < 3 && running.length; i++) { await sleep(350); running = profileProcesses(profile); }
      if (running.length) { profileProcesses(profile, running); await sleep(350); running = profileProcesses(profile); }
      if (running.length || (chrome?.pid && chrome.exitCode === null && chrome.signalCode === null)) throw Error(`Chrome kunde inte bekräftas stängd. Profilen finns kvar i ${profile}.`);
      await rm(profile, {recursive: true, force: true, maxRetries: 3, retryDelay: 200});
      console.log(`Chrome stängd (pid ${chrome?.pid ?? 'ingen'}) och egen profil borttagen.`);
    } catch (error) { code = 1; console.error(error); }
  }
  process.exitCode = code;
}
