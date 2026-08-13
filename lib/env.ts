/**
 * Minimal .env loader for the CLI scripts and the test runner.
 *
 * Next.js loads .env.local by itself; `tsx` and `vitest` do not, and pulling in
 * dotenv just for that is a dependency CLAUDE.md would have us ask about first.
 * Existing environment variables always win, so CI can override anything.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_FILES = ['.env.local', '.env'];

export function loadEnv(files: string[] = DEFAULT_FILES, cwd = process.cwd()): void {
  for (const file of files) {
    const path = resolve(cwd, file);
    if (!existsSync(path)) continue;
    for (const [key, value] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function parseEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}
