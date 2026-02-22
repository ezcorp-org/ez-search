import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ez-search-test-'));
}

export function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function writeFile(dir: string, relPath: string, content: string): string {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  return fullPath;
}
