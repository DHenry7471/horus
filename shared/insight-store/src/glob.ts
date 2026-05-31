/**
 * Minimal glob utility — no external dependencies.
 * Supports patterns like 'services/**\/*.ts' and an exclude list of directory/file prefixes.
 */

import fs from 'node:fs';
import path from 'node:path';

export async function glob(
  rootDir: string,
  patterns: string[],
  excludes: string[] = []
): Promise<string[]> {
  const results: string[] = [];
  const compiledPatterns = patterns.map(compileGlob);
  const compiledExcludes = excludes.map((e) => new RegExp(e.replace(/\*/g, '[^/]*')));

  walk(rootDir, rootDir, compiledPatterns, compiledExcludes, results);
  return results;
}

function walk(
  rootDir: string,
  dir: string,
  patterns: RegExp[],
  excludes: RegExp[],
  results: string[]
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(rootDir, abs).replace(/\\/g, '/');

    if (excludes.some((ex) => ex.test(rel) || ex.test(entry.name))) continue;

    if (entry.isDirectory()) {
      walk(rootDir, abs, patterns, excludes, results);
    } else if (entry.isFile()) {
      if (patterns.some((p) => p.test(rel))) {
        results.push(abs);
      }
    }
  }
}

function compileGlob(pattern: string): RegExp {
  const escaped = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*\//g, '(.+/)?')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}
