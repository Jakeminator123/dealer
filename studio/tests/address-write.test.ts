// A view that writes its own address must pass null as the state. Next marks its own history state (__NA) and takes a
// replaceState or pushState that carries it for one of its own, so useSearchParams does not follow: the address changes
// and the view does not (the Prov room's film list, 2026-11-13). This reads the views' source for that call.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const studio = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((item) =>
    item.isDirectory() ? sources(path.join(dir, item.name)) : /\.tsx?$/.test(item.name) ? [path.join(dir, item.name)] : [],
  );

test("no view hands Next's own history state back when it writes its address", () => {
  const files = ["app", "components", "lib"].flatMap((dir) => sources(path.join(studio, dir)));
  assert.ok(files.length > 50, "the views' source was found");
  const wrong = files.filter((file) => /history\.(?:replace|push)State\(\s*(?:window\.)?history\.state/.test(readFileSync(file, "utf8")));
  assert.deepEqual(wrong.map((file) => path.relative(studio, file).split(path.sep).join("/")), []);
});
