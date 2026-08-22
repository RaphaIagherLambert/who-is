#!/usr/bin/env node
/**
 * Fails if .env or other secret files are tracked by git.
 * Run before deploy: npm run security:check --prefix server
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

const tracked = git('ls-files ".env" "server/.env" "client/.env" "*.pem" "*.key"')
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

if (tracked.length > 0) {
  console.error("SECURITY CHECK FAILED — secret files are tracked by git:");
  for (const file of tracked) console.error(`  - ${file}`);
  console.error("\nRun: git rm --cached <file>  then commit.");
  process.exit(1);
}

const envPath = path.join(root, ".env");
if (existsSync(envPath)) {
  console.log("OK: .env exists locally but is not tracked by git.");
} else {
  console.log("OK: no .env in repo root (use .env.example as template).");
}

console.log("Security check passed.");
