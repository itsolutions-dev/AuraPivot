/**
 * Emits THIRD-PARTY-NOTICES.md from the production dependency tree.
 *
 * aurapivot ships with production dependencies that the consumer's bundler
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

const issues = [];
const sections = [];
for (const [name, dir] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
  const pkgPath = path.join(dir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    console.warn(`⚠ ${name}: package.json not found or not readable`);
    issues.push(name);
    continue;
  }

  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch {
    console.warn(`⚠ ${name}: package.json not parseable`);
    issues.push(name);
    continue;
  }

  // Find licence file by scanning directory.
  let text = "";
  try {
    const files = fs.readdirSync(dir);
    const licenceFile = files
      .filter((f) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(f))
      .sort()[0];
    if (licenceFile) {
      const p = path.join(dir, licenceFile);
      text = fs.readFileSync(p, "utf8").trim();
    }
  } catch {
    // Silently skip unreadable directories.
  }

  // Build the licence line based on what's present.
  let licenceLine;
  if (pkg.license) {
    licenceLine = `License: ${pkg.license}\n`;
    if (!text) {
      // Has field but no file — legitimate, but make absence explicit.
      licenceLine += "No licence file is distributed with this package.\n";
      console.warn(
        `⚠ ${name}@${pkg.version}: has license field but no licence file`,
      );
      issues.push(`${name} (field only)`);
    }
  } else if (text) {
    // Has file but no field — unusual but reproducible.
    licenceLine = "License: see below\n";
  } else {
    // Has neither — must be explicit about the gap.
    licenceLine =
      "License: UNKNOWN — no licence field and no licence file found; verify manually before release.\n";
    console.warn(
      `⚠ ${name}@${pkg.version}: has neither license field nor licence file`,
    );
    issues.push(`${name} (unknown)`);
  }

  sections.push(
    `## ${name}@${pkg.version}\n\n` +
      licenceLine +
      (pkg.homepage ? `Homepage: ${pkg.homepage}\n` : "") +
      (text ? `\n\`\`\`\n${text}\n\`\`\`\n` : "\n"),
  );
}

const header =
  "# Third-party notices\n\n" +
  "aurapivot depends on the packages below, which are installed alongside it\n" +
  "and may be bundled into applications that use it. Each is reproduced with\n" +
  "its own licence and copyright notice, as those licences require.\n\n---\n\n";

fs.writeFileSync(OUT, header + sections.join("\n---\n\n"));

let summary = `third-party-notices: wrote ${OUT} (${sections.length} packages)`;
if (issues.length > 0) {
  summary += ` — ${issues.length} without complete licence info`;
}
console.log(summary);
