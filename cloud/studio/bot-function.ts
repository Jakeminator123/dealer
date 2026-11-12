// The entry of the bot's Vercel function (Build Output API: functions/api/bot.func, Node.js runtime, launcherType Nodejs,
// response streaming on), which serves /api/bot, /api/utkast and /api/onskemal (the copy's config.json rewrites the last two
// to it). tools/build-studio-snapshot.ts type-strips this folder's bot files into the function as index.js and its
// neighbours, and writes the knowledge as bot-knowledge.js. The routes are in bot.ts; every setting comes from the Vercel
// project's environment variables (listed there), never from the repo.
import {handle} from './bot.ts';
import {nodeHandler} from './bot-node.ts';
import knowledge from './bot-knowledge.ts';

/** The largest body a function reads: a question with a screenshot of about 1,5 MB as a data URL fits with room. */
const LIMIT = 2_700_000;

export default nodeHandler((request, signal) => handle(request, {env: process.env, knowledge, signal}), LIMIT);
