// Routing Middleware of the studio's read-only copy on Vercel (Build Output API: functions/_middleware.func, Edge runtime).
// tools/build-studio-snapshot.ts type-strips this folder into that function and writes media.js beside it; the logic is in
// gate.ts. Its environment variables are set in the Vercel project, never in the repo: DEALER_LOSEN (the password),
// DEALER_KAKNYCKEL (the cookie's signing key, at least 32 characters), and optionally DEALER_MEDIA_MODE=proxy.
import {gate} from './gate.ts';
import {TryLimit} from './lock.ts';
import media from './media.ts';

// One count of login tries per running instance (see TryLimit).
const limiter = new TryLimit();

export default function middleware(request: Request): Promise<Response> {
  return gate(request, {env: process.env, media, limiter});
}
