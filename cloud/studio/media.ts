// The films of the online copy and their objects in Blob. This file is the empty stand-in that keeps the middleware
// importable from the repo; tools/build-studio-snapshot.ts writes the real map as media.js into the built middleware.
import type {MediaMap} from './gate.ts';

const media: MediaMap = {};
export default media;
