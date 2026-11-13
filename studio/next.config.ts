import type { NextConfig } from "next";
import path from "node:path";

// The studio is a client app against the lab server (tools/preview.ts on 127.0.0.1:4319), which owns the files, the
// clip bank and every write. Built (`npm run build`), the studio is static files in out/ that the lab server hands
// out under /studio/, so that the lab has one address and one origin. In development (`npm run dev`) it runs on its
// own port and passes everything that is not its own on to the lab server.
const dev = process.env.NODE_ENV !== "production";
const lab = "http://127.0.0.1:4319";
// The locked online copy (lib/mode.ts) is built by `node scripts/build.mjs --snapshot` for tools/build-studio-snapshot.ts.
// Its export goes to its own folder outside studio/ (in the repo's ignored .runtime/), so that it never replaces the out/
// the lab server hands out. With output "export", a custom distDir names the export's destination (the build's own files
// stay in .next, which is why one build at a time still holds).
const snapshot = process.env.NEXT_PUBLIC_DEALER_MODE === "snapshot";
const SNAPSHOT_OUT = "../.runtime/studio-snapshot/out";

const nextConfig: NextConfig = {
  basePath: "/studio",
  trailingSlash: true,
  images: { unoptimized: true },
  // The modules in ../src are written for Node's type stripping and have never been through a type checker; the
  // studio's own files are checked with `npm run types`.
  typescript: { ignoreBuildErrors: true },
  ...(dev
    ? {
        // Like the lab server, the bare origin leads to the studio.
        async redirects() {
          return [{ source: "/", destination: "/studio/", basePath: false as const, permanent: false }];
        },
        async rewrites() {
          return [
            { source: "/:first((?!studio$|_next$)[^/]+)", destination: `${lab}/:first`, basePath: false as const },
            { source: "/:first((?!studio$|_next$)[^/]+)/:rest*", destination: `${lab}/:first/:rest*`, basePath: false as const },
          ];
        },
      }
    : { output: "export" as const, ...(snapshot ? { distDir: SNAPSHOT_OUT } : {}) }),
  turbopack: {
    // The repo, not this folder: the studio imports the lab's own modules from ../src.
    root: path.join(__dirname, ".."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
