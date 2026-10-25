import { build } from "esbuild";
import { mkdir, copyFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
await mkdir(new URL("dist/", root), { recursive: true });
const licenses = await Promise.all(["curves", "hashes"].map(async (name) =>
  `@noble/${name}\n${await readFile(new URL(`node_modules/@noble/${name}/LICENSE`, root), "utf8")}`));
licenses.push(await readFile(new URL("src/omp.LICENSE", root), "utf8"));
const result = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ["src/index.mjs"], outfile: "dist/plugin.js",
  bundle: true, format: "esm", platform: "browser", target: "es2022",
  loader: { ".svg": "text" },
  legalComments: "inline", metafile: true,
  banner: { js: `/*\n${licenses.join("\n")}\n*/` },
});
if (Object.values(result.metafile.outputs).some((output) => output.imports.length))
  throw new Error("Plugin must be a self-contained module");
for (const file of ["manifest.json", "README.md"])
  await copyFile(new URL(file, root), new URL(`dist/${file}`, root));
console.log("Built dist/manifest.json, dist/plugin.js and dist/README.md");
