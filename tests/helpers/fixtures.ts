import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ez-search-test-'));
}

export function cleanupTempDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export function writeFile(dir: string, relPath: string, content: string | Buffer): string {
  const fullPath = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
  return fullPath;
}

/** Minimal valid 1x1 white PNG (67 bytes) */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
  'Nl7BcQAAAABJRU5ErkJggg==',
  'base64',
);

/** Attempt index(), return null if platform lacks zvec */
export async function tryIndex(
  dir: string,
  opts?: Parameters<typeof import('../../src/index.js').index>[1],
) {
  const { index } = await import('../../src/index.js');
  try {
    return await index(dir, opts);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Prebuilt binary')) return null;
    if (err instanceof Error && err.message.includes('SCHEMA_VERSION')) return null;
    throw err;
  }
}

/** Attempt query(), return null if platform lacks zvec */
export async function tryQuery(
  text: string,
  opts?: Parameters<typeof import('../../src/index.js').query>[1],
) {
  const { query } = await import('../../src/index.js');
  try {
    return await query(text, opts);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('Prebuilt binary')) return null;
    if (err instanceof Error && err.message.includes('SCHEMA_VERSION')) return null;
    throw err;
  }
}
