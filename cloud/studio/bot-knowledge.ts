// The bot's knowledge. This file is the empty stand-in that keeps the function importable from the repo;
// tools/build-studio-snapshot.ts writes the real one as bot-knowledge.js beside the function (tools/build-knowledge.ts),
// so the knowledge ships only with the function and never as a file anyone can fetch.
import type {Knowledge} from './bot-search.ts';

const knowledge: Knowledge | null = null;
export default knowledge;
