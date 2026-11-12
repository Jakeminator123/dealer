// The studio's way to the lab server (tools/preview.ts). Everything is asked for by an address from the server's root.

/** A file or route of the lab server: "assets/motions/x/source.mp4" and "/api/clip-bank" both name it from the root. */
export const labUrl = (path: string) => "/" + path.replace(/^\/+/, "");

export async function readJson<T = unknown>(path: string, what: string): Promise<T> {
  const response = await fetch(labUrl(path)).catch(() => null);
  if (!response?.ok) throw new Error(`${what} kunde inte läsas (${labUrl(path)}).`);
  return response.json() as Promise<T>;
}

/**
 * A module of the lab, read from the lab server at run time and not built into the studio: the 3D scene and what it
 * draws with. They are the same files the lab's own pages run, with the server's single copy of three.js, so the
 * studio shows exactly the scene the game shows, and a change in src/ needs no new build of the studio.
 */
export function labModule<T = unknown>(name: string): Promise<T> {
  const address = labUrl(name.endsWith(".js") ? name : `${name}.js`);
  return import(/* webpackIgnore: true */ /* turbopackIgnore: true */ address) as Promise<T>;
}
