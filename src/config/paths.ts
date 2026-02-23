import * as os from 'os';
import * as path from 'path';

/**
 * Resolve the storage path for a given project directory.
 * Format: <projectDir>/.ez-search/
 */
export function resolveProjectStoragePath(projectDir: string): string {
  return path.join(path.resolve(projectDir), '.ez-search');
}

/**
 * Resolve the shared model cache path.
 * Format: ~/.ez-search/models/
 */
export function resolveModelCachePath(): string {
  return path.join(os.homedir(), '.ez-search', 'models');
}
