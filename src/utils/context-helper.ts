import path from "path";
import crypto from "crypto";
import fs from "fs";

/**
 * Validates that a path is safe and doesn't contain path traversal attempts.
 * Resolves the path and ensures it doesn't escape the intended directory.
 */
function validatePath(inputPath: string, basePath?: string): string {
  const resolved = path.resolve(inputPath);
  
  // Check for path traversal sequences
  const normalized = path.normalize(inputPath);
  if (normalized.includes("..")) {
    throw new Error(`Path traversal detected: ${inputPath}`);
  }
  
  // If basePath is provided, ensure resolved path is within it
  if (basePath) {
    const resolvedBase = path.resolve(basePath);
    const relative = path.relative(resolvedBase, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error(`Path escapes base directory: ${inputPath}`);
    }
  }
  
  return resolved;
}

/**
 * Derives a project ID from the current working directory.
 * Useful for auto-detecting which project context to use.
 */
export function getProjectIdFromCwd(cwd?: string): string {
  const dir = cwd ?? process.cwd();
  return crypto.createHash("sha1").update(dir).digest("hex").slice(0, 12);
}

/**
 * Returns a sanitized project name from a directory path.
 */
export function getProjectNameFromCwd(cwd?: string): string {
  const dir = cwd ?? process.cwd();
  return path.basename(dir);
}

/**
 * Generates a random unique ID.
 */
export function generateId(): string {
  return crypto.randomUUID();
}

const CACHE_DIR = ".cache/memory-pro";
const CACHE_FILE = "project.json";

/**
 * Saves project context to a local cache file in the target project root.
 */
export function saveProjectContext(targetCwd: string, projectId: string, name: string): void {
  const validatedCwd = validatePath(targetCwd);
  const dir = path.resolve(validatedCwd, CACHE_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const cachePath = path.join(dir, CACHE_FILE);
  fs.writeFileSync(cachePath, JSON.stringify({ projectId, name, updatedAt: new Date().toISOString() }, null, 2));
  
  ensureGitIgnore(validatedCwd);
}

/**
 * Loads project context by walking up from the starting directory.
 */
export function loadProjectContext(startDir?: string): { projectId: string; name: string } | null {
  const validatedStartDir = validatePath(startDir ?? process.cwd());
  let current = validatedStartDir;

  while (true) {
    const cachePath = path.join(current, CACHE_DIR, CACHE_FILE);
    if (fs.existsSync(cachePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
        return { projectId: data.projectId, name: data.name };
      } catch {
        return null;
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/**
 * Ensures that the .cache folder is added to .gitignore.
 */
export function ensureGitIgnore(targetCwd: string): void {
  const validatedCwd = validatePath(targetCwd);
  const gitIgnorePath = path.join(validatedCwd, ".gitignore");
  const ignoreEntry = "\n# MCP Memory Pro Cache\n.cache/memory-pro/\n";

  if (fs.existsSync(gitIgnorePath)) {
    const content = fs.readFileSync(gitIgnorePath, "utf-8");
    if (!content.includes(".cache/memory-pro")) {
      fs.appendFileSync(gitIgnorePath, ignoreEntry);
    }
  } else {
    fs.writeFileSync(gitIgnorePath, ignoreEntry);
  }
}
