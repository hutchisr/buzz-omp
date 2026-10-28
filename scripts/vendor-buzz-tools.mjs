// Refresh the shared tool snapshot from the reviewed Buzz revision, never the
// checkout's uncommitted files. Normal builds need only the committed snapshot.
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "esbuild";

const revision = "c75ef6821f495c20a18f33577d2dc519efe942ce";
const repository = resolve(process.argv[2] ?? "../buzz-app");
const temporary = await mkdtemp(join(tmpdir(), "buzz-tools-"));
const output = new URL("../vendor/buzz/", import.meta.url);
try {
  const archive = execFileSync("git", ["-C", repository, "archive", revision, "src", "LICENSE", "NOTICE.md"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-xf", "-", "-C", temporary], { input: archive });
  const result = await build({
    absWorkingDir: temporary,
    stdin: { resolveDir: temporary, loader: "ts", contents: `
export { appClient } from "./src/buzz-mcp/app-client.ts";
export { sessionTools, callSessionTool, turnNote } from "./src/buzz-mcp/session-tools.ts";
export { content } from "./src/buzz-mcp/rpc.ts";
` },
    bundle: true, format: "esm", platform: "browser", target: "es2022",
    packages: "external", write: false, metafile: true,
  });
  await mkdir(output, { recursive: true });
  await writeFile(new URL("session-tools.mjs", output),
    `// Generated from block/buzz ${revision}. Do not edit; run scripts/vendor-buzz-tools.mjs.\n// Apache-2.0; see LICENSE and NOTICE.md. TypeScript transpiled and local modules bundled.\n${result.outputFiles[0].text}`);
  for (const file of ["LICENSE", "NOTICE.md"])
    await writeFile(new URL(file, output), await readFile(join(temporary, file)));
  await writeFile(new URL("source.json", output), `${JSON.stringify({
    repository: "https://github.com/block/buzz", revision,
    files: Object.keys(result.metafile.inputs).filter((path) => path !== "<stdin>").sort(),
  }, null, 2)}\n`);
  console.log(`Vendored Buzz session tools from ${revision}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
