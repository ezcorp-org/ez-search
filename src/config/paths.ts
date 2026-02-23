import * as crypto from 'crypto';
import * as os from 'os';
import * as path from 'path';

/**
 * Resolve the storage path for a given project directory.
 * Format: ~/.ez-search/<basename>-<8char-hash>/
 */
export function resolveProjectStoragePath(projectDir: string): string {
  const resolved = path.resolve(projectDir);
  const hash = crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 8);
  const basename = path.basename(resolved);
  return path.join(os.homedir(), '.ez-search', `${basename}-${hash}`);
}

/**
 * Resolve the shared model cache path.
 * Format: ~/.ez-search/models/
 */
export function resolveModelCachePath(): string {
  return path.join(os.homedir(), '.ez-search', 'models');
}
