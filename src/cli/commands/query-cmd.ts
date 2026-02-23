/**
 * Query command stub.
 * Actual implementation deferred to Phase 3.
 */
export async function runQuery(
  text: string,
  options: { pretty?: boolean; topK: string; dir?: string }
): Promise<void> {
  console.log('query command stub', { text, ...options });
}
