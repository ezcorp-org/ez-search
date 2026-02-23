/**
 * Text chunker service — splits text documents into paragraph-boundary chunks.
 *
 * Unlike code chunking (which uses token-window sliding), text documents are split
 * on paragraph boundaries (\n\n). Small paragraphs are merged up to MAX_CHUNK_CHARS;
 * oversized paragraphs are split on sentence boundaries or hard-split at MAX_CHUNK_CHARS.
 *
 * PDF extraction via pdf-parse converts binary PDF to plain text before chunking.
 * Supports: .md, .txt, .pdf, .csv, .rst and any other plain-text format.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** ~400 Nomic tokens — maximum characters per chunk */
export const MAX_CHUNK_CHARS = 1600;

/** Minimum characters to keep a chunk (prevents tiny fragments) */
export const MIN_CHUNK_CHARS = 200;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TextChunk {
  text: string;        // chunk content
  chunkIndex: number;  // 0-indexed position within file
  charCount: number;   // character count of this chunk
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Split an oversized paragraph into sentence-boundary pieces.
 * Splits on `. ` or `.\n` patterns; hard-splits at MAX_CHUNK_CHARS if needed.
 */
function splitOversizedParagraph(paragraph: string): string[] {
  if (paragraph.length <= MAX_CHUNK_CHARS) {
    return [paragraph];
  }

  // Split on sentence boundaries: ". " or ".\n"
  const sentencePattern = /(?<=\.)\s+/;
  const sentences = paragraph.split(sentencePattern).filter(s => s.length > 0);

  const pieces: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    // If a single sentence is too large, hard-split it
    if (sentence.length > MAX_CHUNK_CHARS) {
      if (current.length > 0) {
        pieces.push(current);
        current = '';
      }
      for (let i = 0; i < sentence.length; i += MAX_CHUNK_CHARS) {
        pieces.push(sentence.slice(i, i + MAX_CHUNK_CHARS));
      }
      continue;
    }

    const separator = current.length > 0 ? ' ' : '';
    if (current.length + separator.length + sentence.length > MAX_CHUNK_CHARS) {
      if (current.length > 0) {
        pieces.push(current);
      }
      current = sentence;
    } else {
      current = current.length > 0 ? current + separator + sentence : sentence;
    }
  }

  if (current.length > 0) {
    pieces.push(current);
  }

  return pieces;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Extract plain text from a PDF buffer using pdf-parse.
 *
 * @param buffer - Raw PDF file bytes
 * @returns Extracted plain text content
 * @throws Error with descriptive message if extraction fails
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`PDF text extraction failed: ${msg}`);
  }
}

/**
 * Split a text document into paragraph-boundary chunks suitable for Nomic embeddings.
 *
 * Algorithm:
 * 1. Split on paragraph boundaries (\n\n+)
 * 2. Merge small paragraphs together up to MAX_CHUNK_CHARS
 * 3. Split oversized paragraphs on sentence boundaries; hard-split if still too large
 * 4. Drop chunks under MIN_CHUNK_CHARS (unless it's the only chunk)
 *
 * @param text - Full text content of the file
 * @returns Array of TextChunk objects with sequential chunkIndex values
 */
export function chunkTextFile(text: string): TextChunk[] {
  // Split on paragraph boundaries, filter empty strings
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

  if (paragraphs.length === 0) {
    return [];
  }

  // Split pass: expand oversized paragraphs into sentence-boundary pieces
  const expanded: string[] = [];
  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (trimmed.length > MAX_CHUNK_CHARS) {
      expanded.push(...splitOversizedParagraph(trimmed));
    } else {
      expanded.push(trimmed);
    }
  }

  // Merge pass: accumulate pieces into chunks up to MAX_CHUNK_CHARS
  const raw: string[] = [];
  let current = '';

  for (const piece of expanded) {
    if (current.length === 0) {
      current = piece;
      continue;
    }

    // +2 for the "\n\n" separator
    if (current.length + 2 + piece.length > MAX_CHUNK_CHARS) {
      raw.push(current);
      current = piece;
    } else {
      current = current + '\n\n' + piece;
    }
  }

  if (current.length > 0) {
    raw.push(current);
  }

  // Filter pass: drop undersized chunks unless it's the only one
  const filtered = raw.length === 1
    ? raw
    : raw.filter(chunk => chunk.length >= MIN_CHUNK_CHARS);

  // Assign sequential chunkIndex
  return filtered.map((text, i) => ({
    text,
    chunkIndex: i,
    charCount: text.length,
  }));
}
