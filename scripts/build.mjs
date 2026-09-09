import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const banner = `/*! ${pkg.name} v${pkg.version} - ${pkg.license}
 * ${pkg.homepage}
 *  * Runs entirely in the browser. It reads two same-origin endpoints on the site
 * it is installed on, and stores nothing.
 */`;

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });

const result = await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/ip-lookup.js",
  bundle: true,
  format: "iife",
  target: "es2020",
  platform: "browser",
  minify: false,
  sourcemap: false,
  legalComments: "none",
  banner: { js: banner },
  metafile: true,
});

await build({
  entryPoints: ["src/style.css"],
  outfile: "dist/ip-lookup.css",
  bundle: true,
  minify: false,
  banner: { css: banner },
});

const out = result.metafile.outputs["dist/ip-lookup.js"];
const css = await readFile(new URL("../dist/ip-lookup.css", import.meta.url));

await writeFile(
  new URL("../dist/BUILD.txt", import.meta.url),
  [
    `${pkg.name} v${pkg.version}`,
    `js   ${out.bytes} bytes`,
    `css  ${css.length} bytes`,
    "",
    "Drop both into the site's assets directory and reference them from the",
    "page. The script is a plain IIFE - no module, no defer requirement beyond",
    "the site's own convention. It does nothing unless the page contains an",
    "element with a data-ipl attribute.",
    "",
  ].join("\n"),
);

console.log(`built  js ${out.bytes}B  css ${css.length}B`);
