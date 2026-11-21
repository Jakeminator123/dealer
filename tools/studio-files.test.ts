// tools/studio-files.ts sendFile: how the lab server sends a file. The whole file or a range, nothing for a HEAD, and never a
// file left open: 2026-11-21 the studio's prefetches, cancelled by the browser while the server was still looking the file
// up, held files in studio/out open until the server was restarted, and the next build could not be moved in (EPERM).
// Whether a file is still open is read as Windows reads it: its folder cannot be renamed. Run: node --test tools/studio-files.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtempSync, mkdirSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';
import {sendFile} from './studio-files.ts';

const SIZE = 1800;

async function withServer(run: (port: number, out: string) => Promise<void>) {
  const root = mkdtempSync(path.join(tmpdir(), 'studio-files-')), out = path.join(root, 'out');
  mkdirSync(out);
  const file = path.join(out, '__PAGE__.txt');
  writeFileSync(file, Buffer.from(Array.from({length: SIZE}, (_, i) => 97 + (i % 26))));
  const server = http.createServer(async (req, res) => {
    await wait(40); // the look-up (resolveStudio, stat): the browser may cancel meanwhile
    const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? ''), start = m ? Number(m[1]) : 0, end = m ? Number(m[2]) : SIZE - 1;
    res.writeHead(m ? 206 : 200, {'Content-Length': end - start + 1});
    sendFile(req, res, file, start, end);
  });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
  try { await run((server.address() as {port: number}).port, out); }
  finally { server.closeAllConnections(); await new Promise(r => server.close(r)); rmSync(root, {recursive: true, force: true}); }
}

const ask = (port: number, method: string, headers: Record<string, string> = {}) => new Promise<{status: number; body: string}>((done, fail) => {
  const req = http.request({host: '127.0.0.1', port, path: '/', method, headers, agent: false}, res => {
    let body = ''; res.setEncoding('latin1'); res.on('data', c => { body += c; }); res.on('end', () => done({status: res.statusCode ?? 0, body}));
  });
  req.on('error', fail); req.end();
});

/** True when the folder can be renamed, which Windows refuses while a file in it is open. */
function released(out: string): boolean {
  try { renameSync(out, `${out}-moved`); renameSync(`${out}-moved`, out); return true; } catch { return false; }
}

test('a request cut off before the answer leaves no file open', async () => {
  await withServer(async (port, out) => {
    for (let i = 0; i < 5; i++) {
      await new Promise<void>(done => {
        const req = http.request({host: '127.0.0.1', port, path: '/', method: 'GET', agent: false});
        req.on('error', () => done()); req.end();
        setTimeout(() => { req.destroy(); done(); }, 10);
      });
    }
    await wait(250);
    assert.ok(released(out), 'the folder can be moved: no file in it is held open');
  });
});

test('the whole file, a range, and nothing for a HEAD', async () => {
  await withServer(async (port, out) => {
    const whole = await ask(port, 'GET');
    assert.deepEqual([whole.status, whole.body.length, whole.body.slice(0, 3)], [200, SIZE, 'abc']);
    const part = await ask(port, 'GET', {Range: 'bytes=26-28'});
    assert.deepEqual([part.status, part.body], [206, 'abc']);
    const head = await ask(port, 'HEAD');
    assert.deepEqual([head.status, head.body], [200, '']);
    await wait(100);
    assert.ok(released(out), 'nothing left open after answers that ended');
  });
});
