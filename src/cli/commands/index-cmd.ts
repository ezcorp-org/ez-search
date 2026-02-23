/**
 * Index command stub.
 * Note: commander's --no-ignore creates options.ignore as boolean
 * (true by default, false when --no-ignore flag is used).
 * Actual implementation (scanFiles wiring) deferred to Phase 3.
 */
export async function runIndex(
  targetPath: string,
  options: { ignore: boolean; type?: string; quiet?: boolean; clear?: boolean }
): Promise<void> {
  console.log('index command stub', { targetPath, ...options });
}
