import { fileURLToPath } from 'node:url';
import { evidenceStatus, reindexEvidence, traceEvidence } from './evidence-store.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const [command, id, ...rest] = process.argv.slice(2);

try {
  if (rest.length) throw new Error('Använd: node tools/evidence.ts reindex|status|trace <id>');
  let result;
  if (command === 'reindex' && !id) result = reindexEvidence(root);
  else if (command === 'status' && !id) result = evidenceStatus(root);
  else if (command === 'trace' && id) result = traceEvidence(root, id);
  else throw new Error('Använd: node tools/evidence.ts reindex|status|trace <id>');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Evidensindexet kunde inte läsas.');
  process.exitCode = 1;
}
