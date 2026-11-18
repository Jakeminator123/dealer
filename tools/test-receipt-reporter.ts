import {captureRunContext, committedPlan, fullGitSha} from './evidence-context.ts';
import {writeRunReceipt} from './evidence-store.ts';

type Summary = {
  file?: string;
  success: boolean;
  counts: {passed: number; failed: number; skipped: number; todo: number; cancelled: number};
};
type Event = {type: string; data: Summary};

// Node loads the module before it starts the tests. The async generator can start after a short test.
const root = process.cwd(), startedAt = new Date().toISOString();
const before = captureRunContext(root);
const publication = process.env.DEALER_TEST_KIND === 'publication';

function record(status: string, notes: string[], summary?: Summary, after = before) {
  const counts = summary?.counts;
  const stableStudio = before.studioRevision === after.studioRevision;
  return writeRunReceipt(before.storageRoot, {
    kind: publication ? 'publication' : 'tests',
    startedAt, finishedAt: new Date().toISOString(), status, revision: before.revision,
    studioRevision: stableStudio ? before.studioRevision : null,
    dirtyInputs: [...new Set([...before.dirtyInputs, ...after.dirtyInputs])], inputs: before.inputs,
    counts: {pass: counts?.passed ?? 0, fail: counts?.failed ?? 0, skip: counts?.skipped ?? 0,
      todo: counts?.todo ?? 0, cancelled: counts?.cancelled ?? 0},
    notes: [...new Set(['code-tests', 'media-not-verified', 'committed-card-plan',
      ...(root !== before.storageRoot ? ['linked-checkout'] : []),
      ...(before.dirtyInputs.length ? ['working-tree-modified'] : []),
      ...(before.studioNote ? [before.studioNote] : []), ...(after.studioNote ? [after.studioNote] : []),
      ...(!stableStudio ? ['studio-stamp-changed-during-run'] : []), ...notes])],
  });
}

if (publication) {
  const expected = process.env.DEALER_TEST_REVISION;
  const reason = !expected || !fullGitSha.test(expected) || expected !== before.revision
    ? 'publication-revision-mismatch'
    : before.dirtyInputs.some(file => file !== committedPlan) ? 'publication-dirty-inputs' : null;
  if (reason) {
    const receipt = record('invalidated', [reason]);
    const problem = reason === 'publication-dirty-inputs' ? 'Aktiva testindata skiljer sig från HEAD vid teststart.'
      : 'HEAD stämmer inte med publiceringskontrollens förväntade commit vid teststart.';
    throw Error(problem + ' Körkvitto: ' + receipt);
  }
}

// Read Node's cumulative structured summary without parsing or duplicating the console logs.
export default async function* testReceipt(source: AsyncIterable<Event>) {
  let summary: Summary | undefined;
  let interrupted = false;
  for await (const event of source) {
    if (event.type === 'test:summary' && event.data.file === undefined) summary = event.data;
    if (event.type === 'test:interrupted') interrupted = true;
  }
  const after = captureRunContext(root);
  const changed = before.fingerprint !== after.fingerprint;
  const status = interrupted || !summary ? 'incomplete' : changed ? 'invalidated' : summary.success ? 'pass' : 'fail';
  const receipt = record(status, changed ? ['inputs-changed-during-run'] : [], summary, after);
  if (status === 'incomplete' || status === 'invalidated') process.exitCode = 1;
  yield `Körkvitto: ${receipt} (${status})\n`;
}
