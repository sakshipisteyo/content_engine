#!/usr/bin/env node
/**
 * Tripwire: fail fast if the repo shows signs of a code-injection attack like the
 * "PolinRider" campaign that hit this repo in commit 571b629 (an obfuscated payload
 * hidden after hundreds of spaces at the end of apps/review/postcss.config.mjs, plus
 * .gitignore entries hiding the malware's temp_*_push.bat helpers).
 *
 * Runs in CI, in the Vercel build (a tripped wire means nothing is deployed) and as a
 * local pre-commit hook (.githooks/pre-commit). Zero dependencies, read-only.
 *   node scripts/tripwire.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const MAX_LINE = 1000; // longest legit line in the repo is ~340 (SPEC.md prose)
const LOCKFILES = new Set(["pnpm-lock.yaml", "packages/engine/package-lock.json"]);
const SCRIPT_EXT = /\.(bat|cmd|ps1|vbs|vbe|wsf|scr|exe|dll|hta|lnk)$/i;
const MALWARE_NAMES = ["branch_structure.json", "temp_auto_push.bat", "temp_interactive_push.bat"];
const CONFIG_FILE = /(^|\/)[^/]*\.config\.(c|m)?[jt]s$|(^|\/)(vercel|package)\.json$/;
const OBFUSCATION = [
  /_0x[0-9a-f]{4,}/i, // javascript-obfuscator identifiers
  /\bglobal\.[a-z]\s*=\s*['"]/i, // PolinRider marker: a one-letter global set to a string
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
  /\\x[0-9a-f]{2}(\\x[0-9a-f]{2}){8,}/i, // long hex-escaped strings
];

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const problems = [];
const flag = (file, why) => problems.push(`${file}: ${why}`);

for (const file of files) {
  const base = file.split("/").pop();
  if (SCRIPT_EXT.test(file)) flag(file, "Windows script/executable is tracked");
  if (MALWARE_NAMES.includes(base)) flag(file, "known malware helper file");

  let text;
  try {
    const buf = readFileSync(file);
    if (buf.includes(0)) continue; // binary (images); checked by type above
    text = buf.toString("utf8");
  } catch {
    continue; // deleted in the working tree
  }

  if (base === ".gitignore") {
    for (const name of MALWARE_NAMES) {
      if (text.includes(name)) flag(file, `ignores "${name}" (hides malware helpers)`);
    }
  }
  if (LOCKFILES.has(file)) {
    for (const m of text.matchAll(/https?:\/\/[^\s"')]+\.tgz/g)) {
      if (!m[0].startsWith("https://registry.npmjs.org/")) flag(file, `non-npm tarball ${m[0]}`);
    }
    continue;
  }

  text.split("\n").forEach((line, i) => {
    const where = `line ${i + 1}`;
    if (line.length > MAX_LINE) flag(file, `${where} is ${line.length} chars (hidden payload?)`);
    if (/[ \t]{120,}\S/.test(line)) flag(file, `${where} hides code after a long run of whitespace`);
    if (CONFIG_FILE.test(file) || file.endsWith(".mjs")) {
      for (const re of OBFUSCATION) if (re.test(line)) flag(file, `${where} matches obfuscation pattern ${re}`);
    }
  });

  if (base === "package.json") {
    const scripts = JSON.parse(text).scripts ?? {};
    for (const hook of ["preinstall", "install", "postinstall", "prepare"]) {
      if (scripts[hook]) flag(file, `defines a "${hook}" script: ${scripts[hook]}`);
    }
  }
}

if (problems.length) {
  console.error(`\nTRIPWIRE: ${problems.length} problem(s) — do not build, run or deploy this tree.\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nSee README "Security: tripwire" and check the commit that introduced it.\n');
  process.exit(1);
}
console.log(`tripwire: ${files.length} tracked files clean`);
