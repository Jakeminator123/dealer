// A look at lab pages in headless Chrome (DRIFT, "Sidor och headless Chrome"): a screenshot of each page in a list, under
// the shared lock for the graphics card and headless Chrome, so that one run at a time loads Jakob's machine. From the
// main agent's se-sidor.mjs and under-las.sh (2026-11-13 to 11-17). One Chrome of its own (its own profile, port 9591,
// checked free first), never Jakob's tab or his logged-in windows: every address is the lab's (127.0.0.1:4319) with
// robot=1, so the page never takes the place of his lab tab (src/preview-ui.ts). Chrome is closed with Browser.close,
// checked by its profile afterwards and its profile removed; the lock is released only if it is still this run's.
// Nothing that saves is pressed by this tool; a list presses only what sets view state. It does not start the lab server.
//
//   node tools/lab-look.ts <lista.json> <utmapp> [--vad "<vad>"] [--vem <namn>] [--minuter <n>]
//   lista.json: [{name, url (after http://127.0.0.1:4319), wait (ms, default 2500), width, height,
//                 clicks: [{sel, text, wait}], facts: "<js expression>"}]
import {spawn, execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const LAB = 'http://127.0.0.1:4319';
export const LOCK = 'D:/dealer-scratch/tmp/gpu-och-headless.lock';
export const STALE_MS = 20 * 60 * 1000; // a lock older than 20 minutes was left by a run that died (as tools of the lanes read it)
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe', PORT = 9591, PROFILES = 'D:/dealer-scratch/tmp/labbtitt';

export type Click = {sel: string; text?: string; wait?: number};
export type Item = {name: string; url: string; wait?: number; width?: number; height?: number; clicks?: Click[]; facts?: string};

/** Reads and checks a list: safe file names, addresses on the lab only, sizes and waits within reason. */
export function parseList(text: string): Item[] {
  const list = JSON.parse(text);
  if (!Array.isArray(list) || !list.length) throw Error('listan ska vara en lista med minst en sida');
  const names = new Set<string>();
  return list.map((item, i) => {
    const at = `sida ${i + 1}`;
    if (typeof item?.name !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,80}$/i.test(item.name)) throw Error(`${at}: name ska vara ett filnamn (bokstäver, siffror, . _ -)`);
    if (names.has(item.name)) throw Error(`${at}: namnet ${item.name} finns redan`);
    names.add(item.name);
    labUrl(item.url);
    for (const key of ['wait', 'width', 'height'] as const) {
      const v = item[key], [lo, hi] = key === 'wait' ? [0, 60000] : [200, 8000];
      if (v !== undefined && !(Number.isInteger(v) && v >= lo && v <= hi)) throw Error(`${at}: ${key} ska vara ett heltal ${lo}–${hi}`);
    }
    if (item.clicks !== undefined && !(Array.isArray(item.clicks) && item.clicks.every((c: Click) => typeof c?.sel === 'string' && c.sel && (c.text === undefined || typeof c.text === 'string')))) throw Error(`${at}: clicks ska vara [{sel, text}]`);
    if (item.facts !== undefined && typeof item.facts !== 'string') throw Error(`${at}: facts ska vara ett uttryck som text`);
    return item as Item;
  });
}

/** The lab's address for a path in a list, always with robot=1; anything outside the lab is refused. */
export function labUrl(url: unknown): string {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) throw Error(`adressen ska börja med / och ligga på labbet: ${String(url)}`);
  const full = new URL(url, LAB);
  if (full.origin !== LAB) throw Error(`adressen lämnar labbet: ${url}`);
  full.searchParams.set('robot', '1');
  return full.href;
}

export type LockState = 'free' | 'stale' | 'held';
/** The lock's state from its file's age (undefined: no file). */
export const lockState = (mtimeMs: number | undefined, now: number): LockState => mtimeMs === undefined ? 'free' : now - mtimeMs > STALE_MS ? 'stale' : 'held';
/** The line written in the lock: who, when, what, for how long, and this process. */
export const lockLine = (who: string, what: string, minutes: number, at: Date, pid = process.pid) =>
  `${who} ${at.toISOString().slice(0, 16).replace('T', ' ')}: ${what}, ${minutes} min (labbtitt pid ${pid})`;

type LockIo = {now?: () => number; sleep?: (ms: number) => Promise<void>; maxWaitMs?: number; say?: (line: string) => void};
const mtimeOf = (file: string) => { try { return statSync(file).mtimeMs; } catch { return undefined; } };

/** Takes the lock: waits while another run holds it (at most maxWaitMs, default 20 minutes), takes over a stale one.
 *  Returns false when it was still held at the end, with its line said. */
export async function takeLock(file: string, line: string, io: LockIo = {}): Promise<boolean> {
  const now = io.now ?? Date.now, sleep = io.sleep ?? (ms => new Promise(r => setTimeout(r, ms))), say = io.say ?? console.log;
  const until = now() + (io.maxWaitMs ?? STALE_MS);
  for (let first = true; ; first = false) {
    const state = lockState(mtimeOf(file), now());
    if (state !== 'held') {
      try { writeFileSync(file, line + '\n', {flag: state === 'free' ? 'wx' : 'w'}); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue; throw error; }
      if (readFileSync(file, 'utf8').trim() === line) return true;
    } else if (now() >= until) { say(`LÅST: ${readFileSync(file, 'utf8').trim()}`); return false; }
    else if (first) say(`väntar på låset: ${readFileSync(file, 'utf8').trim()}`);
    await sleep(5000);
  }
}

/** Removes the lock only if it still holds this run's line. */
export function releaseLock(file: string, line: string): boolean {
  try { if (readFileSync(file, 'utf8').trim() !== line) return false; unlinkSync(file); return true; } catch { return false; }
}

/** Chrome's arguments: headless, its own profile and port, no sound. */
export const chromeArgs = (port: number, profile: string) =>
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--mute-audio', '--window-size=1440,900', 'about:blank'];

// The Chrome processes started with a profile (by its folder in the command line), never by name or port alone.
const withProfile = (profile: string): number[] => {
  const needle = path.basename(profile);
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${needle}*' } | ForEach-Object { $_.ProcessId }`], {encoding: 'utf8'});
  return out.split(/\s+/).filter(Boolean).map(Number);
};

async function look(list: Item[], out: string, say: (line: string) => void): Promise<void> {
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); throw Error(`något svarar redan på port ${PORT}; ingen titt startas`); } catch (error) { if ((error as Error).message.includes('svarar redan')) throw error; }
  try { await fetch(`${LAB}/studio/`); } catch { throw Error('labbservern svarar inte; starta den inte härifrån (node tools/preview.ts --ensure är huvudagentens)'); }
  mkdirSync(PROFILES, {recursive: true});
  const profile = path.join(PROFILES, `profil-${process.pid}-${Date.now()}`);
  const chrome = spawn(CHROME, chromeArgs(PORT, profile), {stdio: 'ignore', env: {...process.env, TEMP: 'D:/dealer-scratch/tmp', TMP: 'D:/dealer-scratch/tmp'}});
  let ws: WebSocket | undefined;
  try {
    let target: {type: string; webSocketDebuggerUrl: string} | undefined;
    for (let i = 0; i < 60 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t: {type: string}) => t.type === 'page'); } catch {} }
    if (!target) throw Error('Chrome startade inte');
    const page = new WebSocket(target.webSocketDebuggerUrl); ws = page;
    const pending = new Map<number, {resolve: (v: any) => void; reject: (e: Error) => void}>();
    let seq = 0, errors: string[] = [];
    await new Promise((r, j) => { page.onopen = r; page.onerror = j; });
    page.onmessage = e => {
      const m = JSON.parse(String(e.data));
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id)!; pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
      else if (m.method === 'Runtime.exceptionThrown') errors.push('SIDFEL ' + JSON.stringify(m.params.exceptionDetails).slice(0, 500));
      else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console error ' + m.params.args.map((a: {value?: unknown; description?: string}) => a.value ?? a.description).join(' ').slice(0, 300));
      else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push(`HTTP ${m.params.response.status} ${m.params.response.url}`);
    };
    const send = (method: string, params = {}) => new Promise<any>((resolve, reject) => { const id = ++seq; pending.set(id, {resolve, reject}); page.send(JSON.stringify({id, method, params})); });
    const run = async (expression: string) => { const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; };
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    mkdirSync(out, {recursive: true});
    for (const item of list) {
      errors = [];
      await send('Emulation.setDeviceMetricsOverride', {width: item.width ?? 1440, height: item.height ?? 900, deviceScaleFactor: 1, mobile: false});
      await send('Page.navigate', {url: labUrl(item.url)});
      for (let i = 0; i < 80; i++) { await sleep(250); if (await run(`document.readyState === 'complete'`).catch(() => false)) break; }
      await sleep(item.wait ?? 2500);
      for (const c of item.clicks ?? []) {
        const how = await run(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(c.sel)})].find(e => ${c.text ? `e.textContent.trim().startsWith(${JSON.stringify(c.text)})` : 'true'}); if (!b) return 'saknas'; b.click(); return 'ok'; })()`);
        say(`${item.name} klick ${c.sel} ${c.text ?? ''} ${how}`);
        await sleep(c.wait ?? 1200);
      }
      const shot = await send('Page.captureScreenshot', {format: 'png'});
      writeFileSync(path.join(out, `${item.name}.png`), Buffer.from(shot.data, 'base64'));
      const where = await run('location.pathname + location.search');
      say(`${item.name} → ${where} ${item.facts ? JSON.stringify(await run(item.facts)) : ''} ${errors.length ? 'FEL: ' + errors.join(' | ') : 'inga fel'}`);
    }
  } finally {
    try {
      ws?.close();
      const browser = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl;
      const b = new WebSocket(browser); await new Promise((r, j) => { b.onopen = r; b.onerror = j; });
      b.send(JSON.stringify({id: 1, method: 'Browser.close'})); await sleep(1500);
    } catch {}
    for (let i = 0; i < 20 && withProfile(profile).length; i++) await sleep(250);
    for (const pid of withProfile(profile)) try { execFileSync('taskkill', ['/PID', String(pid), '/F']); } catch {}
    const left = withProfile(profile);
    say(`chrome stängd (pid ${chrome.pid}); kvar nu: ${left.length ? left.join(' ') : 'inga'}`);
    rmSync(profile, {recursive: true, force: true});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
  const what = flag('--vad') ?? 'ser på labbsidor', who = flag('--vem') ?? 'labbtitt', minutes = Number(flag('--minuter') ?? 3);
  const [listFile, out] = args;
  const say = (line: string) => console.log(line);
  try {
    if (!listFile || !out || args.length !== 2) throw Error('Använd: node tools/lab-look.ts <lista.json> <utmapp> [--vad "<vad>"] [--vem <namn>] [--minuter <n>]');
    if (!existsSync(listFile)) throw Error(`listan finns inte: ${listFile}`);
    const list = parseList(readFileSync(listFile, 'utf8'));
    const line = lockLine(who, what, minutes, new Date());
    if (!await takeLock(LOCK, line, {say})) process.exitCode = 75;
    else {
      say(`lås taget ${new Date().toTimeString().slice(0, 8)}`);
      try { await look(list, out, say); }
      finally { say(releaseLock(LOCK, line) ? `lås släppt ${new Date().toTimeString().slice(0, 8)}` : 'låset är inte längre mitt; det lämnas'); }
    }
  } catch (error) { console.error(`[RÖD] ${(error as Error).message}`); process.exitCode = 1; }
}
