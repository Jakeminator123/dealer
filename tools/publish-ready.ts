import {setTimeout as sleep} from 'node:timers/promises';

const WAIT_MS = 30_000;
const FETCH_MS = 3000;
const INTERVAL_MS = 2000;
const FULL_COMMIT = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

type ProbeOptions = {
  cookie?: string;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutSignal?: (milliseconds: number) => AbortSignal;
};

export type PublishReadiness = {ready: boolean; attempts: number; detail: string};

/** Read the public alias until two consecutive probes see the requested clean build. */
export async function waitForPublishedCommit(site: string, expected: string, options: ProbeOptions = {}): Promise<PublishReadiness> {
  if (!FULL_COMMIT.test(expected)) throw Error('Publiceringskontrollen kräver en full commit-hash.');
  const request = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => performance.now());
  const pause = options.sleep ?? sleep;
  const timeoutSignal = options.timeoutSignal ?? AbortSignal.timeout;
  const url = new URL('/meta.json', site).href, deadline = now() + WAIT_MS;
  const headers = options.cookie ? {cookie: options.cookie} : undefined;
  let consecutive = 0, attempts = 0, detail = 'inget svar';

  for (;;) {
    const budget = Math.floor(deadline - now());
    if (budget < 1) break;
    const signal = timeoutSignal(Math.min(FETCH_MS, budget));
    attempts++;
    let problem: string | null;
    try {
      const response = await request(url, {cache: 'no-store', redirect: 'manual', headers, signal});
      if (!response.ok) {
        void response.body?.cancel().catch(() => {});
        problem = `HTTP ${response.status}`;
      } else {
        const meta: {sourceCommit?: unknown; sourceDirty?: unknown} | null = await response.json();
        const commit = meta?.sourceCommit;
        if (commit !== expected) problem = typeof commit === 'string' && FULL_COMMIT.test(commit) ? `såg ${commit.slice(0, 7)}` : 'saknar full commit-hash';
        else if (meta?.sourceDirty !== false) problem = meta?.sourceDirty === true ? 'bygget har lokala ändringar' : 'saknar uppgift om rent bygge';
        else problem = null;
      }
    } catch {
      problem = 'kunde inte läsa /meta.json';
    }

    if (signal.aborted) problem = 'tidsgräns för /meta.json';
    if (problem) {
      consecutive = 0;
      detail = problem;
    } else if (now() <= deadline && ++consecutive === 2) {
      return {ready: true, attempts, detail: `${expected.slice(0, 7)} två gånger i följd`};
    } else {
      detail = 'två träffar i följd saknas inom tidsgränsen';
    }
    const remaining = deadline - now();
    if (remaining < 1) break;
    await pause(Math.min(INTERVAL_MS, remaining));
  }

  return {ready: false, attempts, detail};
}
