// The bot's store as files on disk, for the local rehearsal (tools/serve-studio-snapshot.ts, under .runtime/) and the tests.
// It keeps the Blob store's promises within one process: a write that names a version or asks to create is checked and done
// under one lock per key, and a file is written whole (to a temporary name, then renamed) or not at all. It never ships.
import {mkdir, readFile, readdir, rename, writeFile} from 'node:fs/promises';
import {createHash, randomUUID} from 'node:crypto';
import path from 'node:path';
import {bytesOf, checkKey, type Store} from './bot-store.ts';

export function fileStore(root: string): Store {
  const base = path.resolve(root);
  const fileOf = (key: string) => path.join(base, ...checkKey(key).split('/'));
  const etagOf = (bytes: Uint8Array) => `"${createHash('sha256').update(bytes).digest('hex').slice(0, 32)}"`;
  const locks = new Map<string, Promise<unknown>>();
  const locked = <T>(key: string, work: () => Promise<T>): Promise<T> => {
    const before = locks.get(key) ?? Promise.resolve();
    const run = before.then(work, work);
    locks.set(key, run.catch(() => {}));
    return run;
  };
  const read = async (key: string) => {
    const bytes = await readFile(fileOf(key)).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return null; throw e; });
    return bytes ? new Uint8Array(bytes) : null;
  };
  return {
    async get(key) {
      const bytes = await read(key);
      return bytes ? {body: bytes, etag: etagOf(bytes), type: key.endsWith('.png') ? 'image/png' : key.endsWith('.json') ? 'application/json' : 'application/octet-stream'} : null;
    },
    put(key, body, _type, cond = {}) {
      return locked(key, async () => {
        const have = await read(key);
        if (cond.create && have) return {ok: false as const};
        if (cond.ifMatch && (!have || etagOf(have) !== cond.ifMatch)) return {ok: false as const};
        const bytes = bytesOf(body), file = fileOf(key), temporary = `${file}.${randomUUID()}.tmp`;
        await mkdir(path.dirname(file), {recursive: true});
        await writeFile(temporary, bytes);
        await rename(temporary, file);
        return {ok: true as const, etag: etagOf(bytes)};
      });
    },
    async list(prefix) {
      const keys: string[] = [];
      const walk = async (dir: string, rel: string): Promise<void> => {
        for (const entry of await readdir(dir, {withFileTypes: true}).catch(() => [])) {
          const key = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory()) await walk(path.join(dir, entry.name), key);
          else if (entry.isFile() && !entry.name.endsWith('.tmp')) keys.push(key);
        }
      };
      await walk(base, '');
      return keys.filter(k => k.startsWith(prefix));
    },
  };
}
