/**
 * Build-time half of the React-singleton claim. The browser half proves the
 * two objects are identical; this proves the remote never had a second copy to
 * begin with, which is the failure that survives a passing smoke test.
 */
import { readFile, stat } from "node:fs/promises";

const failures = [];
const checks = [];

function check(name, pass, detail) {
  checks.push({ name, pass, detail });
  if (!pass) failures.push(name);
}

const gadget = await readFile("dist/gadgets/counter/gadget.js", "utf8");
const gadgetSize = (await stat("dist/gadgets/counter/gadget.js")).size;

check(
  "remote-imports-react-as-a-bare-specifier",
  /from\s*["']react["']/.test(gadget) &&
    /from\s*["']react\/jsx-runtime["']/.test(gadget),
  "left bare for the import map to resolve",
);
check(
  "remote-bundles-no-react-copy",
  !gadget.includes("react.transitional.element") &&
    !gadget.includes("react.forward_ref"),
  `no React internals in ${gadgetSize} bytes`,
);
check(
  "remote-stays-small",
  gadgetSize < 20_000,
  `${gadgetSize} bytes — a bundled React would be an order of magnitude larger`,
);

const reactShim = await readFile("dist/shared/react.js", "utf8");
const domShim = await readFile("dist/shared/react-dom-client.js", "utf8");
const chunkOf = (source) =>
  [...source.matchAll(/from\s*["']\.\/(react\d*\.js)["']/g)].map((m) => m[1]);
const reactChunks = chunkOf(reactShim);
const domChunks = chunkOf(domShim);
check(
  "shared-react-and-react-dom-share-one-chunk",
  reactChunks.length > 0 &&
    domChunks.length > 0 &&
    reactChunks[0] === domChunks[0],
  `react.js -> ${reactChunks.join(",")}, react-dom-client.js -> ${domChunks.join(",")}`,
);

for (const { name, pass, detail } of checks)
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
console.log(
  `\n${checks.length - failures.length}/${checks.length} bundle checks passed`,
);
if (failures.length) process.exitCode = 1;
