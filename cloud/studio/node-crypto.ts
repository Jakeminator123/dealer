// node:crypto for the game engine in a browser page. The studio's online copy has no server that could hold a game, so the
// engine of game/ runs in the game page itself (cloud/studio/game-local.ts), and tools/build-studio-snapshot.ts points the
// engine's imports of node:crypto here. Only what game/ uses: createHash('sha256') with update, digest and copy (copy is
// game/rng.ts's HMAC for a seeded shoe); randomFillSync, randomBytes and randomUUID from the browser's own
// crypto.getRandomValues and crypto.randomUUID, so the secure shoe is drawn as the lab draws it, from the platform's CSPRNG;
// and a Buffer with the few methods game/rng.ts calls, put on globalThis where there is none (game/rng.ts names Buffer as a
// global). Only Web APIs here. Tested against Node's own in tools/studio-freeze.test.ts.

const encoder = new TextEncoder(), decoder = new TextDecoder();
const HEX = /^(?:[0-9a-f]{2})*$/i;

/** The part of Node's Buffer that game/ uses: a Uint8Array with from, alloc, copy, readUInt32BE, writeBigUInt64BE and hex. */
export class ShimBuffer extends Uint8Array {
  static from(value: string | ArrayLike<number> | ArrayBuffer, encoding: string = 'utf8'): ShimBuffer {
    if (typeof value === 'string') {
      if (encoding === 'hex') {
        if (!HEX.test(value)) throw new TypeError('Ogiltig hex-sträng.');
        const out = new ShimBuffer(value.length / 2);
        for (let i = 0; i < out.length; i++) out[i] = parseInt(value.slice(2 * i, 2 * i + 2), 16);
        return out;
      }
      if (encoding !== 'utf8' && encoding !== 'utf-8') throw new TypeError(`Kodningen ${encoding} finns inte här.`);
      const bytes = encoder.encode(value), out = new ShimBuffer(bytes.length);
      out.set(bytes);
      return out;
    }
    const source = value instanceof ArrayBuffer ? new Uint8Array(value) : value, out = new ShimBuffer(source.length);
    for (let i = 0; i < source.length; i++) out[i] = source[i] & 0xff;
    return out;
  }
  static alloc(size: number): ShimBuffer { return new ShimBuffer(size); }
  static isBuffer(value: unknown): boolean { return value instanceof ShimBuffer; }
  toString(encoding: string = 'utf8'): string {
    if (encoding === 'hex') { let out = ''; for (const byte of this) out += byte.toString(16).padStart(2, '0'); return out; }
    return decoder.decode(this);
  }
  copy(target: Uint8Array, targetStart = 0, sourceStart = 0, sourceEnd = this.length): number {
    const part = this.subarray(sourceStart, sourceEnd), count = Math.max(0, Math.min(part.length, target.length - targetStart));
    target.set(part.subarray(0, count), targetStart);
    return count;
  }
  readUInt32BE(offset = 0): number { return new DataView(this.buffer, this.byteOffset, this.byteLength).getUint32(offset, false); }
  writeBigUInt64BE(value: bigint, offset = 0): number { new DataView(this.buffer, this.byteOffset, this.byteLength).setBigUint64(offset, value, false); return offset + 8; }
}

// ── SHA-256 (FIPS 180-4), incremental, with copy ────────────────────────────
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const START = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

function bytesOf(data: unknown, encoding?: string): Uint8Array {
  if (typeof data === 'string') return ShimBuffer.from(data, encoding ?? 'utf8');
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  throw new TypeError('update tar text eller bytes.');
}

/** One SHA-256 in progress, as Node's Hash: update(text or bytes), digest() or digest('hex'), and copy(). */
export class Sha256 {
  h = Uint32Array.from(START);
  block = new Uint8Array(64);
  used = 0;
  length = 0; // bytes taken so far
  done = false;
  w = new Uint32Array(64);
  compress(chunk: Uint8Array, at: number) {
    const w = this.w, h = this.h;
    for (let i = 0; i < 16; i++) w[i] = (chunk[at + 4 * i] << 24) | (chunk[at + 4 * i + 1] << 16) | (chunk[at + 4 * i + 2] << 8) | chunk[at + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], k = h[7];
    for (let i = 0; i < 64; i++) {
      const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += k;
  }
  update(data: string | Uint8Array, encoding?: string): this {
    if (this.done) throw new Error('Digest already called');
    const bytes = bytesOf(data, encoding);
    let at = 0;
    this.length += bytes.length;
    if (this.used) {
      const take = Math.min(64 - this.used, bytes.length);
      this.block.set(bytes.subarray(0, take), this.used); this.used += take; at = take;
      if (this.used < 64) return this;
      this.compress(this.block, 0); this.used = 0;
    }
    for (; at + 64 <= bytes.length; at += 64) this.compress(bytes, at);
    if (at < bytes.length) { this.block.set(bytes.subarray(at), 0); this.used = bytes.length - at; }
    return this;
  }
  digest(encoding?: string): string | ShimBuffer {
    if (this.done) throw new Error('Digest already called');
    this.done = true;
    const bits = this.length * 8, tail = new Uint8Array(((this.used + 9 + 63) >> 6) << 6);
    tail.set(this.block.subarray(0, this.used)); tail[this.used] = 0x80;
    const view = new DataView(tail.buffer);
    view.setUint32(tail.length - 8, Math.floor(bits / 0x100000000), false); view.setUint32(tail.length - 4, bits >>> 0, false);
    for (let at = 0; at < tail.length; at += 64) this.compress(tail, at);
    const out = new ShimBuffer(32), outView = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) outView.setUint32(4 * i, this.h[i], false);
    if (encoding === undefined) return out;
    if (encoding === 'hex') return out.toString('hex');
    throw new TypeError(`Kodningen ${encoding} finns inte här.`);
  }
  copy(): Sha256 {
    if (this.done) throw new Error('Digest already called');
    const twin = new Sha256();
    twin.h.set(this.h); twin.block.set(this.block); twin.used = this.used; twin.length = this.length;
    return twin;
  }
}

export function createHash(algorithm: string): Sha256 {
  if (String(algorithm).toLowerCase() !== 'sha256') throw new Error(`Bara sha256 finns här, inte ${algorithm}.`);
  return new Sha256();
}

type Platform = {getRandomValues<T extends ArrayBufferView>(array: T): T; randomUUID(): string};
const platform = (): Platform => {
  const c = (globalThis as {crypto?: Platform}).crypto;
  if (!c?.getRandomValues) throw new Error('Webbläsaren saknar crypto.getRandomValues.');
  return c;
};

/** Fills the bytes of an integer view from the platform's CSPRNG, at most 65 536 bytes per call as getRandomValues allows. */
export function randomFillSync<T extends ArrayBufferView>(target: T): T {
  const bytes = new Uint8Array(target.buffer, target.byteOffset, target.byteLength), c = platform();
  for (let at = 0; at < bytes.length; at += 65536) c.getRandomValues(bytes.subarray(at, Math.min(bytes.length, at + 65536)));
  return target;
}
export const randomBytes = (size: number): ShimBuffer => randomFillSync(new ShimBuffer(size));
export const randomUUID = (): string => platform().randomUUID();

// game/rng.ts names Buffer as a global (Buffer.from at its top). A page has none, so this one is put there; Node keeps its own.
const scope = globalThis as {Buffer?: unknown};
if (scope.Buffer === undefined) scope.Buffer = ShimBuffer;
