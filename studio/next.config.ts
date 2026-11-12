import type { NextConfig } from "next";
import path from "node:path";

// The studio is a client app against the lab server (tools/preview.ts on 127.0.0.1:4319), which owns the files, the
// clip bank and every write. Built (`npm run build`), the studio is static files in out/ that the lab server hands
// out under /studio/, so that the lab has one address and one origin. In development (`npm run dev`) it runs on its
// own port and passes everything that is not its own on to the lab server.
const dev = process.env.NODE_ENV !== "production";
const lab = "http://127.0.0.1:4319";

const nextConfig: NextConfig = {
  basePath: "/studio",
  trailingSlash: true,
  images: { unoptimized: true },
  // The modules in ../src are written for Node's type stripping and have never been through a type checker; the
  // studio's own files are checked with `npm run types`.
  typescript: { ignoreBuildErrors: true },
  ...(dev
    ? {
        async rewrites() {
          return [
            { source: "/:first((?!studio$|_next$)[^/]+)", destination: `${lab}/:first`, basePath: false as const },
            { source: "/:first((?!studio$|_next$)[^/]+)/:rest*", destination: `${lab}/:first/:rest*`, basePath: false as const },
          ];
        },
      }
    : { output: "export" as const }),
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
