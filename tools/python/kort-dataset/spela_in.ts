// Spelar in Scen ruta för ruta, headless under det delade låset (samma lås, port och stängning som tools/lab-look.ts):
// en bild per ruta, och det labbprovet "kortprov" läste i rutan (ljuset, oskärpan) i en json per variant.
//   node tools/python/kort-dataset/spela_in.ts <klipp> <från> <till> <utmapp> <namn>=<kortprov-ord>@<bredd>x<höjd>[/<bildbredd>] ...   (spelets storlek: 1764x1174/640)
//   ordet "mat" ändrar inget på sidan (Scens förval: det styva kortet), "idag,mat" är filmens lagrade spår, "kant" provet med den vita
//   kanten och "1" hela det äldre provet; rutorna stegas framåt en i taget från fyra rutor före <från>.
import {spawn, execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync, rmSync} from 'node:fs';
import path from 'node:path';
import {LAB, LOCK, labUrl, lockLine, takeLock, releaseLock, chromeArgs} from '../../lab-look.ts';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe', PORT = 9591, PROFILES = 'D:/dealer-scratch/tmp/labbtitt';
const [clip, fromS, toS, out, ...variants] = process.argv.slice(2), from = Number(fromS), to = Number(toS);
if (!clip || !Number.isFinite(from) || !Number.isFinite(to) || !out || !variants.length) { console.error('Använd: spela_in.ts <klipp> <från> <till> <utmapp> <namn>=<ord>@<b>x<h> ...'); process.exit(1); }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const withProfile = (profile: string): number[] => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
  `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${path.basename(profile)}*' } | ForEach-Object { $_.ProcessId }`], {encoding: 'utf8'}).split(/\s+/).filter(Boolean).map(Number);

async function record() {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); throw Error(`något svarar redan på port ${PORT}`); } catch (e) { if ((e as Error).message.includes('svarar redan')) throw e; }
  try { await fetch(`${LAB}/studio/`); } catch { throw Error('labbservern svarar inte'); }
  mkdirSync(PROFILES, {recursive: true});
  const profile = path.join(PROFILES, `profil-${process.pid}-${Date.now()}`);
  const chrome = spawn(CHROME, chromeArgs(PORT, profile), {stdio: 'ignore', env: {...process.env, TEMP: 'D:/dealer-scratch/tmp', TMP: 'D:/dealer-scratch/tmp'}});
  let ws: WebSocket | undefined;
  try {
    let target: {type: string; webSocketDebuggerUrl: string} | undefined;
    for (let i = 0; i < 60 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t: {type: string}) => t.type === 'page'); } catch {} }
    if (!target) throw Error('Chrome startade inte');
    const page = new WebSocket(target.webSocketDebuggerUrl); ws = page;
    const pending = new Map<number, {resolve: (v: any) => void; reject: (e: Error) => void}>(); let seq = 0, errors: string[] = [];
    await new Promise((r, j) => { page.onopen = r; page.onerror = j; });
    page.onmessage = e => { const m = JSON.parse(String(e.data));
      if (m.id && pending.has(m.id)) { const p = pending.get(m.id)!; pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); }
      else if (m.method === 'Runtime.exceptionThrown') errors.push('SIDFEL ' + JSON.stringify(m.params.exceptionDetails).slice(0, 400));
      else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console error ' + m.params.args.map((a: {value?: unknown; description?: string}) => a.value ?? a.description).join(' ').slice(0, 300));
      else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push(`HTTP ${m.params.response.status} ${m.params.response.url}`); };
    const send = (method: string, params = {}) => new Promise<any>((resolve, reject) => { const id = ++seq; pending.set(id, {resolve, reject}); page.send(JSON.stringify({id, method, params})); });
    const run = async (expression: string) => { const r = await send('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true}); if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    for (const v of variants) {
      const m = /^([a-z0-9-]+)=([a-z0-9,]+)@(\d+)x(\d+)(?:\/(\d+))?$/.exec(v); if (!m) throw Error(`varianten förstås inte: ${v}`);
      const [, name, word, w, h, wide] = m, dir = path.join(out, name); mkdirSync(dir, {recursive: true}); errors = [];
      // /<bildbredd>: sidan läggs ut i <b>x<h> (filmen fyller bilden, som i spelet) men ritas så många bildpunkter bred. I ett fönster på 640x426 lägger Scen i stället ut hela rummet i en remsa.
      await send('Emulation.setDeviceMetricsOverride', {width: Number(w), height: Number(h), deviceScaleFactor: wide ? Number(wide) / Number(w) : 1, mobile: false});
      await send('Page.navigate', {url: labUrl(`/scene3d.html?clip=${encodeURIComponent(clip)}&ui=0&cards=1&cardInHand=1&kortprov=${word}`)}); // det ritade kortet i handen (kort=hand): det läge provet gäller
      const shown = async () => String(await run(`document.documentElement.dataset.kortprovRuta || ''`).catch(() => ''));
      for (let i = 0; i < 160 && !(await shown()); i++) await sleep(250);
      if (!(await shown())) throw Error(`${name}: sidan ritade aldrig ett kort (inget kortprovRuta)`);
      await sleep(1500);
      const frameNow = async () => parseInt(await shown(), 10);
      const key = (code: string) => run(`(window.dispatchEvent(new KeyboardEvent('keydown', {code: '${code}', bubbles: true})), 1)`);
      const settle = () => run('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
      const stepTo = async (want: number) => { for (let tries = 0; tries < 400; tries++) { const c = await frameNow(); if (c === want) return; await key(c < want ? 'ArrowRight' : 'ArrowLeft');
        for (let i = 0; i < 60 && (await frameNow()) === c; i++) await sleep(35); } throw Error(`${name}: kom inte till ruta ${want}`); };
      const log: unknown[] = []; await stepTo(Math.max(0, from - 4));
      for (let f = Math.max(0, from - 4) + 1; f <= to; f++) {
        await stepTo(f); await settle(); await sleep(90); await settle();
        if (f < from) continue;
        const shot = await send('Page.captureScreenshot', {format: 'png'}); writeFileSync(path.join(dir, `${String(f).padStart(3, '0')}.png`), Buffer.from(shot.data, 'base64'));
        const read = await run(`document.documentElement.dataset.kortprov || ''`), mark = await shown(); let parsed: {frame?: number} | null = null; try { parsed = read ? JSON.parse(read) : null; } catch {}
        log.push({ruta: f, spar: mark.includes('spar'), last: parsed && parsed.frame === f ? parsed : null});
      }
      writeFileSync(path.join(out, `${name}.json`), JSON.stringify(log).replace(/\{"ruta"/g, '\n{"ruta"') + '\n');
      console.log(`${name}: rutor ${from}-${to} i ${dir}; provets spår i ${log.filter(l => (l as {spar: boolean}).spar).length} av ${log.length}; ${errors.length ? 'FEL: ' + [...new Set(errors)].slice(0, 4).join(' | ') : 'inga fel'}`);
    }
  } finally {
    try { ws?.close(); const browser = (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl;
      const b = new WebSocket(browser); await new Promise((r, j) => { b.onopen = r; b.onerror = j; }); b.send(JSON.stringify({id: 1, method: 'Browser.close'})); await sleep(1500); } catch {}
    for (let i = 0; i < 20 && withProfile(profile).length; i++) await sleep(250);
    for (const pid of withProfile(profile)) try { execFileSync('taskkill', ['/PID', String(pid), '/F']); } catch {}
    console.log(`chrome stängd (pid ${chrome.pid}); kvar nu: ${withProfile(profile).length || 'inga'}`);
    rmSync(profile, {recursive: true, force: true});
  }
}

const line = lockLine('kort-dataset', `spelar in Scen ruta för ruta (${clip} ${from}-${to})`, 4, new Date());
if (!await takeLock(LOCK, line)) process.exit(75);
console.log(`lås taget ${new Date().toTimeString().slice(0, 8)}`);
try { await record(); } catch (e) { console.error(`[RÖD] ${(e as Error).message}`); process.exitCode = 1; }
finally { console.log(releaseLock(LOCK, line) ? `lås släppt ${new Date().toTimeString().slice(0, 8)}` : 'låset är inte längre mitt; det lämnas'); }
