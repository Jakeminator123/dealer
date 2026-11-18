import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";

async function check(t: TestContext, compiler: string | null, ...scope: string[]) {
  const root = await mkdtemp(path.join(os.tmpdir(), "studio-types-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const script = path.join(root, "types.mjs");
  await copyFile(new URL("../scripts/types.mjs", import.meta.url), script);
  if (compiler !== null) {
    const bin = path.join(root, "node_modules/typescript/bin");
    await mkdir(bin, { recursive: true });
    await writeFile(path.join(bin, "tsc"), compiler);
  }
  const result = spawnSync(process.execPath, [script, ...scope], { cwd: root, encoding: "utf8" });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  return result;
}

test("a nonzero compiler exit without TypeScript diagnostics fails with the compiler's message", async (t) => {
  const result = await check(t, 'console.error("Unexpected compiler failure"); process.exitCode = 2;');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /kod 2 utan läsbara fel/);
  assert.match(result.stderr, /Unexpected compiler failure/);
});

test("a compiler that cannot be found or finish fails before the diagnostics summary", async (t) => {
  const absent = await check(t, null);
  assert.equal(absent.status, 1);
  assert.match(absent.stderr, /TypeScript-kompilatorn kunde inte hittas/);
  assert.doesNotMatch(absent.stdout, /0 fel/);

  const overLimit = await check(t, 'process.stdout.write("x".repeat(2 * 1024 * 1024));');
  assert.equal(overLimit.status, 1);
  assert.match(overLimit.stderr, /TypeScript-kontrollen avbröts/);
  assert.doesNotMatch(overLimit.stdout, /0 fel/);
});

test("project diagnostics without a source path fail even with a scope", async (t) => {
  const result = await check(t, 'console.error("error TS5058: The specified path does not exist."); process.exitCode = 1;', "components/map");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /error TS5058/);
});

const errorRows = `
console.log("components/map/file.ts(1,2): error TS2322: selected folder");
console.log("components/mapping/file.ts(1,2): error TS2322: prefix folder");
console.error("lib/example.ts(3,4): error TS2345: selected file");
console.error("lib/example.tsx(3,4): error TS2345: prefixed filename");
console.log("../src/order-model.ts(5,6): error TS2345: external file");
process.exitCode = 2;
`;

test("a scoped check matches a file or directory on path boundaries", async (t) => {
  const result = await check(t, errorRows, "./components/map/", "lib/example.ts");
  assert.equal(result.status, 1);
  assert.match(result.stdout, /selected folder/);
  assert.match(result.stdout, /selected file/);
  assert.match(result.stdout, /2 fel i dina filer\. 2 i andra studiofiler\. 1 fel i importerade filer utanför studion/);
  assert.doesNotMatch(result.stdout, /prefix folder|prefixed filename/);
});

test("other studio diagnostics are counted without failing a scoped check", async (t) => {
  const scoped = await check(t, 'console.log("components/other.ts(1,2): error TS2322: outside scope"); process.exitCode = 2;', "components/game");
  assert.equal(scoped.status, 0);
  assert.match(scoped.stdout, /0 fel i dina filer\. 1 i andra studiofiler\. 0 fel i importerade filer utanför studion/);
  assert.doesNotMatch(scoped.stdout, /outside scope/);
});

test("diagnostics from imported code fail and are shown with or without a studio scope", async (t) => {
  const compiler = 'console.log("../src/order-model.ts(5,6): error TS2345: imported file"); process.exitCode = 2;';
  for (const scope of [[], ["components/game"]]) {
    const result = await check(t, compiler, ...scope);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /\.\.\/src\/order-model\.ts\(5,6\): error TS2345: imported file/);
    assert.match(result.stdout, /1 fel i importerade filer utanför studion/);
  }
});
