// The package is "type": "module", so without this Node would read every
// emitted .js file — including the CommonJS half — as ESM and throw on the
// first `require`. Dropping a package.json into each output directory pins
// the format per directory, which is also what lets TypeScript pick the
// right .d.ts under node16/nodenext resolution.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");

for (const [subdir, type] of [
  ["esm", "module"],
  ["cjs", "commonjs"],
]) {
  const dir = join(distDir, subdir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ type }, null, 2)}\n`);
}
