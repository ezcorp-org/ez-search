/**
 * Lexical index — BM25 keyword search via MiniSearch with code-aware tokenization.
 *
 * codeTokenize: splits identifiers on camelCase, snake_case, kebab-case, dot.notation
 * LexicalIndex: wraps MiniSearch for add/remove/query/serialize operations
 */

import MiniSearch from 'minisearch';

// ── Code-aware tokenizer ─────────────────────────────────────────────────────

/**
 * Split text into code-aware tokens:
 *  - Split on non-alphanumeric/underscore boundaries
 *  - Sub-split camelCase: handleUserAuth → [handle, user, auth, handleuserauth]
 *  - Sub-split snake_case/SCREAMING_SNAKE on underscores
 *  - Sub-split kebab-case on hyphens, dot.notation on dots
 *  - Handle acronyms: getHTTPResponse → [get, http, response]
 *  - Lowercase all, drop < 2 chars, keep compound token for exact-match
 */
export function codeTokenize(text: string): string[] {
  const tokens: string[] = [];
  // Split on non-word characters (but keep underscores for snake_case splitting)
  const words = text.split(/[^a-zA-Z0-9_]+/).filter(Boolean);

  for (const word of words) {
    // Sub-split on underscores (snake_case / SCREAMING_SNAKE)
    const underscoreParts = word.split('_').filter(Boolean);

    for (const part of underscoreParts) {
      // Sub-split on dots (shouldn't normally appear after first split, but defensive)
      const dotParts = part.split('.').filter(Boolean);

      for (const segment of dotParts) {
        const subTokens = splitCamelCase(segment);

        if (subTokens.length > 1) {
          // Add individual sub-tokens
          for (const t of subTokens) {
            const lower = t.toLowerCase();
            if (lower.length >= 2) tokens.push(lower);
          }
          // Add compound token for exact-match boost
          const compound = segment.toLowerCase();
          if (compound.length >= 2) tokens.push(compound);
        } else if (subTokens.length === 1) {
          const lower = subTokens[0].toLowerCase();
          if (lower.length >= 2) tokens.push(lower);
        }
      }
    }
  }

  return tokens;
}

/**
 * Split a single segment on camelCase/PascalCase boundaries, handling acronyms.
 * getHTTPResponse → [get, HTTP, Response]
 * handleUserAuth → [handle, User, Auth]
 * v2Config → [v2, Config]
 */
function splitCamelCase(str: string): string[] {
  if (!str) return [];
  // Split on: lowercase→uppercase, uppercase→uppercase+lowercase (acronym boundary),
  // letter→digit, digit→letter boundaries
  const parts = str.split(/(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|(?<=[a-zA-Z])(?=[0-9])|(?<=[0-9])(?=[a-zA-Z])/);
  return parts.filter(Boolean);
}

// ── Lexical result type ──────────────────────────────────────────────────────

export interface LexicalResult {
  id: string;
  filePath: string;
  chunkIndex: number;
  lineStart: number;
  lineEnd: number;
  chunkText: string;
  score: number;
}

// ── Serialization wrapper ────────────────────────────────────────────────────

interface SerializedLexicalIndex {
  version: 1;
  minisearch: ReturnType<MiniSearch['toJSON']>;
}

// ── LexicalIndex class ───────────────────────────────────────────────────────

const MINISEARCH_OPTIONS = {
  fields: ['text'] as string[],
  storeFields: ['filePath', 'chunkIndex', 'lineStart', 'lineEnd', 'chunkText'] as string[],
  tokenize: codeTokenize,
  searchOptions: {
    tokenize: codeTokenize,
    prefix: true,
  },
};

export class LexicalIndex {
  private ms: MiniSearch;

  constructor() {
    this.ms = new MiniSearch(MINISEARCH_OPTIONS);
  }

  addDocument(id: string, text: string, meta: { filePath: string; chunkIndex: number; lineStart: number; lineEnd: number }): void {
    // Remove existing doc with same ID (MiniSearch throws on duplicate)
    try { this.ms.discard(id); } catch { /* not found, fine */ }
    this.ms.add({
      id,
      text,
      filePath: meta.filePath,
      chunkIndex: meta.chunkIndex,
      lineStart: meta.lineStart,
      lineEnd: meta.lineEnd,
      chunkText: text,
    });
  }

  removeDocument(id: string): void {
    try { this.ms.discard(id); } catch { /* not found */ }
  }

  query(text: string, topK: number, opts?: { dir?: string }): LexicalResult[] {
    const raw = this.ms.search(text, {
      prefix: true,
      tokenize: codeTokenize,
    });

    let results: LexicalResult[] = raw.map((r) => ({
      id: String(r.id),
      filePath: String(r.filePath ?? ''),
      chunkIndex: Number(r.chunkIndex ?? 0),
      lineStart: Number(r.lineStart ?? 0),
      lineEnd: Number(r.lineEnd ?? 0),
      chunkText: String(r.chunkText ?? ''),
      score: r.score,
    }));

    // Apply dir filter
    if (opts?.dir) {
      const normalizedDir = opts.dir.replace(/^\.\//, '').replace(/\/$/, '');
      results = results.filter((r) => r.filePath.startsWith(normalizedDir));
    }

    return results.slice(0, topK);
  }

  toJSON(): string {
    const wrapper: SerializedLexicalIndex = {
      version: 1,
      minisearch: this.ms.toJSON(),
    };
    return JSON.stringify(wrapper);
  }

  static fromJSON(json: string): LexicalIndex {
    const parsed: SerializedLexicalIndex = JSON.parse(json);
    if (!parsed || parsed.version !== 1) {
      throw new Error(`Unsupported lexical index version: ${parsed?.version}`);
    }
    const instance = new LexicalIndex();
    instance.ms = MiniSearch.loadJSON(JSON.stringify(parsed.minisearch), MINISEARCH_OPTIONS);
    return instance;
  }

  get size(): number {
    return this.ms.documentCount;
  }
}
