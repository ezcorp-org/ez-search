/**
 * Chunker service — splits source code files into token-accurate chunks with line tracking.
 *
 * Uses the Jina code tokenizer (BPE, RobertaTokenizer) for accurate token counting.
 * The tokenizer must be loaded once via loadTokenizer() and reused across all chunkFile() calls.
 *
 * Chunk windows: 500 tokens per chunk, 50 token overlap between consecutive chunks.
 * Line numbers are tracked via cumulative token counts per line (1-indexed).
 *
 * NOTE: add_special_tokens: false is intentional — the embedding pipeline adds special tokens
 * at inference time (pooling: 'mean', normalize: true). Double-adding them would corrupt embeddings.
 */

import { AutoTokenizer, env } from '@huggingface/transformers';
import type { PreTrainedTokenizer } from '@huggingface/transformers';
import { resolveModelCachePath } from '../config/paths.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const CHUNK_SIZE = 500; // tokens per chunk
export const OVERLAP = 50;    // token overlap between consecutive chunks

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Chunk {
  text: string;       // decoded chunk text (stored in Zvec for search results)
  lineStart: number;  // 1-indexed start line in source file
  lineEnd: number;    // 1-indexed end line in source file
  chunkIndex: number; // 0-indexed position within file
  tokenCount: number; // number of tokens in this chunk
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Load the Jina code tokenizer from the shared model cache.
 * Call this once and pass the result to all chunkFile() calls.
 */
export async function loadTokenizer(): Promise<PreTrainedTokenizer> {
  env.cacheDir = resolveModelCachePath();
  env.allowRemoteModels = true;
  return AutoTokenizer.from_pretrained('jinaai/jina-embeddings-v2-base-code');
}

/**
 * Split a source file into token-accurate chunks with line number tracking.
 *
 * Files under CHUNK_SIZE tokens produce a single chunk spanning the entire file.
 * Larger files are split into overlapping CHUNK_SIZE-token windows with OVERLAP tokens
 * shared between consecutive windows.
 *
 * @param text - Full text content of the file
 * @param tokenizer - Pre-loaded tokenizer from loadTokenizer()
 * @returns Array of Chunk objects with accurate line numbers and token counts
 */
export function chunkFile(text: string, tokenizer: PreTrainedTokenizer): Chunk[] {
  const lines = text.split('\n');

  // Build cumulative token count per line for O(n_lines) line-number lookup.
  // Each line includes its trailing newline except the last, to match how the
  // tokenizer sees the full text.
  const cumulative: number[] = [];
  let cum = 0;
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i] + (i < lines.length - 1 ? '\n' : '');
    const ids = tokenizer.encode(lineText, { add_special_tokens: false });
    // encode() returns an array-like object — access .length directly (not a plain Array)
    cum += (ids as unknown as { length: number }).length;
    cumulative.push(cum);
  }

  // Encode full text without special tokens (pipeline adds them at inference time)
  const allIds = tokenizer.encode(text, { add_special_tokens: false }) as unknown as number[];
  const totalTokens = allIds.length;

  // Single-chunk case: file fits within one window
  if (totalTokens <= CHUNK_SIZE) {
    return [{
      text,
      lineStart: 1,
      lineEnd: lines.length,
      chunkIndex: 0,
      tokenCount: totalTokens,
    }];
  }

  // Sliding window with overlap
  const stride = CHUNK_SIZE - OVERLAP; // 450 tokens between window starts
  const chunks: Chunk[] = [];

  for (let start = 0; start < totalTokens; start += stride) {
    const end = Math.min(start + CHUNK_SIZE, totalTokens);
    const chunkIds = Array.from(allIds).slice(start, end);
    const chunkText = tokenizer.decode(chunkIds, { skip_special_tokens: true });

    chunks.push({
      text: chunkText,
      lineStart: tokenIndexToLine(start, cumulative),
      lineEnd: tokenIndexToLine(end - 1, cumulative),
      chunkIndex: chunks.length,
      tokenCount: chunkIds.length,
    });

    if (end === totalTokens) break;
  }

  return chunks;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Map a token index to a 1-indexed line number using cumulative token counts.
 * Linear scan: returns the first line whose cumulative token count exceeds tokenIdx.
 */
function tokenIndexToLine(tokenIdx: number, cumulative: number[]): number {
  for (let i = 0; i < cumulative.length; i++) {
    if (tokenIdx < cumulative[i]) return i + 1;
  }
  return cumulative.length;
}
