/**
 * Emits THIRD-PARTY-NOTICES.md from the production dependency tree.
 *
 * MIT and BSD both require retaining the copyright notice of redistributed
 * code. Anything rollup inlines into dist/ is redistributed by us, so its
 * notice has to travel with the tarball.
 *
 * Usage: node scripts/third-party-notices.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const OUT = "THIRD-PARTY-NOTICES.md";
const LICENSE_FILES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE"];

const tree = JSON.parse(
  execSync("npm ls --omit=dev --long --json --all", {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  }),
);

const seen = new Map();
const walk = (node) => {
  for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
    if (!seen.has(name) && dep.path) seen.set(name, dep.path);
    walk(dep);
  }
};
walk(tree);

const sections = [];
for (const [name, dir] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  let text = "";
  for (const f of LICENSE_FILES) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) {
      text = fs.readFileSync(p, "utf8").trim();
      break;
    }
  }

  sections.push(
    `## ${name}@${pkg.version}\n\n` +
      `License: ${pkg.license ?? "see below"}\n` +
      (pkg.homepage ? `Homepage: ${pkg.homepage}\n` : "") +
      (text ? `\n\`\`\`\n${text}\n\`\`\`\n` : "\n"),
  );
}

const header =
  "# Third-party notices\n\n" +
  "aura-pivot redistributes portions of the packages below. Each is\n" +
  "reproduced with its own licence and copyright notice, as those licences\n" +
  "require.\n\n---\n\n";

fs.writeFileSync(OUT, header + sections.join("\n---\n\n"));
console.log(`third-party-notices: wrote ${OUT} (${sections.length} packages)`);
