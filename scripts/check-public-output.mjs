import { lstat, readdir, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import process from "node:process";

const root = process.cwd();

const requiredFiles = [
  "index.html",
  "downloads/sail-release.json",
  "downloads/README.txt",
  "console/index.html",
];

const forbiddenPaths = [
  "downloads/console",
  "downloads/files",
];

const blockedExactNames = new Set([".env"]);

const blockedDirNames = new Set([
  ".git",
  ".sail-private",
  "runtime",
  "secrets",
]);

const blockedSuffixes = [
  ".pem",
  ".key",
  ".p8",
  ".p12",
  ".jwk",
  ".jar",
  ".map",
  ".local.md",
];

const blockedContains = ["private-deploy"];

const errors = [];

for (const file of requiredFiles) {
  const fileStats = await lstat(join(root, file)).catch(() => undefined);
  if (!fileStats?.isFile()) {
    errors.push(`missing required file: ${file}`);
  }
}

for (const path of forbiddenPaths) {
  const pathStats = await lstat(join(root, path)).catch(() => undefined);
  if (pathStats) {
    errors.push(`forbidden generated path: ${path}`);
  }
}

for (const entry of await listFiles(root)) {
  const normalized = normalize(relative(root, entry.path));
  if (normalized.startsWith(".git/")) {
    continue;
  }
  if (entry.kind === "symlink") {
    errors.push(`blocked public symlink: ${normalized}`);
  } else if (isBlocked(normalized)) {
    errors.push(`blocked public file: ${normalized}`);
  }
}

if (errors.length > 0) {
  console.error("Static site public output check failed:");
  for (const error of errors.sort()) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Static site public output check passed.");

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    const local = normalize(relative(root, fullPath));
    if (local === ".git" || local.startsWith(".git/")) {
      continue;
    }
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === ".git") {
        files.push({ kind: "path", path: fullPath });
        continue;
      }
      const childFiles = await listFiles(fullPath);
      if (childFiles.length === 0 && isBlocked(local)) {
        files.push({ kind: "path", path: fullPath });
        continue;
      }
      files.push(...childFiles);
    } else if (entry.isSymbolicLink()) {
      files.push({ kind: "symlink", path: fullPath });
    } else if (entry.isFile()) {
      files.push({ kind: "path", path: fullPath });
    }
  }
  return files;
}

function normalize(value) {
  return value.split(sep).join("/");
}

function isBlocked(file) {
  const parts = file.split("/");
  const name = parts[parts.length - 1] ?? file;
  const lowerName = name.toLowerCase();
  if (blockedExactNames.has(lowerName)) {
    return true;
  }
  if (lowerName.startsWith(".env.")) {
    return true;
  }
  if (parts.some((part) => blockedDirNames.has(part.toLowerCase()))) {
    return true;
  }
  if (blockedSuffixes.some((suffix) => lowerName.endsWith(suffix))) {
    return true;
  }
  return blockedContains.some((snippet) => file.toLowerCase().includes(snippet));
}
