import { build, transform } from "esbuild";
import { mkdir, copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
await mkdir(new URL("dist/", root), { recursive: true });
const result = await build({
  absWorkingDir: fileURLToPath(root),
  entryPoints: ["src/index.mjs"], outfile: "dist/plugin.js",
  bundle: true, format: "esm", platform: "browser", target: "es2022",
  loader: { ".svg": "text" },
  legalComments: "inline", metafile: true, write: false,
});
if (Object.values(result.metafile.outputs).some((output) => output.imports.length))
  throw new Error("Plugin must be a self-contained module");
const packages = [...new Set(Object.keys(result.metafile.inputs)
  .map((path) => path.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean))].sort();
const licenses = await Promise.all(packages.map(async (path) => {
  const directory = new URL(`${path}/`, root);
  const pkg = JSON.parse(await readFile(new URL("package.json", directory), "utf8"));
  const files = (await readdir(directory)).filter((file) => /^licen[cs]e(?:\..*)?$/i.test(file));
  if (!files.length) throw new Error(`Missing license for bundled dependency ${pkg.name}`);
  return `${pkg.name} ${pkg.version}\n${(await Promise.all(files.map((file) => readFile(new URL(file, directory), "utf8")))).join("\n")}`;
}));
for (const path of ["vendor/buzz/LICENSE", "vendor/buzz/NOTICE.md", "src/omp.LICENSE"])
  licenses.push(await readFile(new URL(path, root), "utf8"));
// Notices can contain paths like src/bundled/*/icon.png; line comments keep
// their original text without allowing it to close a block comment.
const notices = licenses.join("\n").split(/\r?\n/).map((line) => `// ${line}`.trimEnd()).join("\n");
const source = `${notices}\n${result.outputFiles[0].text}`;
await transform(source, { loader: "js", target: "es2022" });
await writeFile(new URL("dist/plugin.js", root), source);
for (const file of ["manifest.json", "README.md"])
  await copyFile(new URL(file, root), new URL(`dist/${file}`, root));
console.log("Built dist/manifest.json, dist/plugin.js and dist/README.md");
