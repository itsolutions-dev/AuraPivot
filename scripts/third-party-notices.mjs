/**
 * Emits THIRD-PARTY-NOTICES.md from the production dependency tree.
 *
 * aura-pivot ships with production dependencies that the consumer's bundler
 * resolves. MIT and BSD both require retaining the copyright notice of every
 * dependency. Peer dependencies (consumer-supplied) are excluded; only the
 * production dependency closure is attributed.
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

// Read root package.json to identify peer dependencies to exclude.
const rootPkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const rootDeps = new Set(Object.keys(rootPkg.dependencies ?? {}));
const peerDeps = new Set(Object.keys(rootPkg.peerDependencies ?? {}));

const seen = new Map();
const walk = (node, isRoot = false) => {
  for (const [name, dep] of Object.entries(node.dependencies ?? {})) {
    // At root level, enter only names in the root's dependencies.
    // Never enter a peer dependency at any depth.
    if (isRoot && !rootDeps.has(name)) continue;
    if (peerDeps.has(name)) continue;

    if (!seen.has(name) && dep.path) seen.set(name, dep.path);
    walk(dep, false);
  }
};
walk(tree, true);

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
  "aura-pivot depends on the packages below, which are installed alongside it\n" +
  "and may be bundled into applications that use it. Each is reproduced with\n" +
  "its own licence and copyright notice, as those licences require.\n\n---\n\n";

fs.writeFileSync(OUT, header + sections.join("\n---\n\n"));
console.log(`third-party-notices: wrote ${OUT} (${sections.length} packages)`);
