import { describe, test, expect } from "bun:test";
import {
  chunkTextFile,
  MAX_CHUNK_CHARS,
  MIN_CHUNK_CHARS,
} from "../../src/services/text-chunker";

describe("chunkTextFile", () => {
  test("empty string -> empty array", () => {
    expect(chunkTextFile("")).toEqual([]);
  });

  test("whitespace only -> empty array", () => {
    expect(chunkTextFile("   \n\n\n  \t  ")).toEqual([]);
  });

  test("short text -> single chunk", () => {
    const text = "Hello world, this is a short paragraph.";
    const chunks = chunkTextFile(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
  });

  test("short text preserves content even under MIN_CHUNK_CHARS (single chunk exemption)", () => {
    const text = "Tiny.";
    expect(text.length).toBeLessThan(MIN_CHUNK_CHARS);
    const chunks = chunkTextFile(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(text);
  });

  test("splits on paragraph boundaries (\\n\\n)", () => {
    // Two paragraphs each large enough to exceed MAX_CHUNK_CHARS when combined
    const para1 = "word ".repeat(250).trim(); // ~1250 chars
    const para2 = "term ".repeat(250).trim(); // ~1250 chars
    const text = `${para1}\n\n${para2}`;
    expect(text.length).toBeGreaterThan(MAX_CHUNK_CHARS);
    const chunks = chunkTextFile(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].text).toContain("word");
  });

  test("merges small paragraphs up to MAX_CHUNK_CHARS", () => {
    // Several small paragraphs that together fit under MAX_CHUNK_CHARS
    const para = "word ".repeat(30).trim(); // ~150 chars
    const text = [para, para, para].join("\n\n");
    expect(text.length).toBeLessThan(MAX_CHUNK_CHARS);
    const chunks = chunkTextFile(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain("word");
  });

  test("does not merge past MAX_CHUNK_CHARS", () => {
    // Each paragraph is ~805 chars; two together exceed MAX_CHUNK_CHARS (1600)
    const para = "word ".repeat(161).trim(); // 161*5-1 = 804 chars
    expect(para.length).toBeGreaterThan(MAX_CHUNK_CHARS / 2);
    const text = [para, para, para].join("\n\n");
    const chunks = chunkTextFile(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    }
  });

  test("splits oversized paragraph on sentence boundaries", () => {
    // Single paragraph with many sentences, totaling > MAX_CHUNK_CHARS
    const sentence = "This is a test sentence. ";
    const repeatCount = Math.ceil(MAX_CHUNK_CHARS / sentence.length) + 10;
    const text = sentence.repeat(repeatCount).trim();
    expect(text.length).toBeGreaterThan(MAX_CHUNK_CHARS);
    // No paragraph breaks, so splitting must happen on sentence boundaries
    const chunks = chunkTextFile(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    }
  });

  test("hard-splits when no sentence boundaries", () => {
    // One continuous string with no '. ' or '.\n' and no paragraph breaks
    const text = "x".repeat(MAX_CHUNK_CHARS * 2 + 100);
    const chunks = chunkTextFile(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    }
  });

  test("drops chunks under MIN_CHUNK_CHARS when multiple exist", () => {
    // A large paragraph followed by a tiny one
    const bigPara = "word ".repeat(200).trim(); // ~1000 chars, well above MIN
    const tinyPara = "hi"; // well under MIN_CHUNK_CHARS
    expect(tinyPara.length).toBeLessThan(MIN_CHUNK_CHARS);
    const text = `${bigPara}\n\n${tinyPara}`;
    const chunks = chunkTextFile(text);
    // The tiny paragraph should be dropped since there are multiple chunks
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeGreaterThanOrEqual(MIN_CHUNK_CHARS);
    }
  });

  test("sequential chunkIndex starting from 0", () => {
    const para = "word ".repeat(200).trim(); // ~1000 chars per paragraph
    const text = [para, para, para].join("\n\n");
    const chunks = chunkTextFile(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
    }
  });

  test("charCount matches text.length", () => {
    const para = "word ".repeat(200).trim();
    const text = [para, para].join("\n\n");
    const chunks = chunkTextFile(text);
    for (const chunk of chunks) {
      expect(chunk.charCount).toBe(chunk.text.length);
    }
  });
});
