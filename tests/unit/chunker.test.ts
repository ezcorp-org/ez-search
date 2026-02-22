import { describe, test, expect, mock, beforeAll } from "bun:test";

// Mock ALL native dependencies that @huggingface/transformers transitively loads.
// These must be registered before any import that triggers the dependency chain.
mock.module("onnxruntime-node", () => ({
  default: {},
  InferenceSession: {},
  Tensor: {},
}));
mock.module("sharp", () => {
  const fn = () => fn;
  return { default: Object.assign(fn, { cache: fn, concurrency: fn, counters: fn, simd: fn, versions: fn }) };
});
mock.module("@huggingface/transformers", () => ({
  AutoTokenizer: { from_pretrained: async () => ({}) },
  env: { cacheDir: "", allowRemoteModels: false },
}));
// Note: config/paths.js is NOT mocked — it loads fine without native deps.
// Only @huggingface/transformers (and its native transitive deps) need mocking.

// Dynamic import so mocks are registered first
let chunkFile: typeof import("../../src/services/chunker").chunkFile;
let CHUNK_SIZE: number;
let OVERLAP: number;

beforeAll(async () => {
  const mod = await import("../../src/services/chunker");
  chunkFile = mod.chunkFile;
  CHUNK_SIZE = mod.CHUNK_SIZE;
  OVERLAP = mod.OVERLAP;
});

function createMockTokenizer() {
  return {
    encode(text: string, _opts?: unknown): number[] {
      if (!text || text.trim().length === 0) return [];
      const tokens = text.split(/\s+/).filter((w) => w.length > 0);
      return tokens.map((_, i) => i);
    },
    decode(ids: number[], _opts?: unknown): string {
      return ids.map((_, i) => `w${i}`).join(" ");
    },
  };
}

describe("chunker constants", () => {
  test("CHUNK_SIZE is 500", () => {
    expect(CHUNK_SIZE).toBe(500);
  });

  test("OVERLAP is 50", () => {
    expect(OVERLAP).toBe(50);
  });
});

describe("chunkFile", () => {
  const tokenizer = createMockTokenizer();

  test("short text (< 500 words) -> single chunk", () => {
    const words = Array.from({ length: 100 }, (_, i) => `word${i}`);
    const text = words.join(" ");
    const chunks = chunkFile(text, tokenizer as any);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].tokenCount).toBe(100);
  });

  test("single chunk has lineStart=1, lineEnd=total lines, chunkIndex=0", () => {
    const text = "line one\nline two\nline three";
    const chunks = chunkFile(text, tokenizer as any);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].lineStart).toBe(1);
    expect(chunks[0].lineEnd).toBe(3);
    expect(chunks[0].chunkIndex).toBe(0);
  });

  test("large text splits into multiple chunks", () => {
    const words = Array.from({ length: 1200 }, (_, i) => `word${i}`);
    const text = words.join(" ");
    const chunks = chunkFile(text, tokenizer as any);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  test("stride is CHUNK_SIZE - OVERLAP (450)", () => {
    const stride = CHUNK_SIZE - OVERLAP;
    expect(stride).toBe(450);

    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`);
    const text = words.join(" ");
    const chunks = chunkFile(text, tokenizer as any);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  test("sequential chunkIndex", () => {
    const words = Array.from({ length: 1500 }, (_, i) => `word${i}`);
    const text = words.join(" ");
    const chunks = chunkFile(text, tokenizer as any);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
    }
  });

  test("tokenCount matches actual tokens per chunk", () => {
    const words = Array.from({ length: 1200 }, (_, i) => `word${i}`);
    const text = words.join(" ");
    const chunks = chunkFile(text, tokenizer as any);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeGreaterThan(0);
      expect(chunk.tokenCount).toBeLessThanOrEqual(CHUNK_SIZE);
    }
  });

  test("line tracking maps tokens to correct lines", () => {
    const lines = Array.from({ length: 10 }, (_, i) =>
      Array.from({ length: 20 }, (_, j) => `l${i}w${j}`).join(" ")
    );
    const text = lines.join("\n");
    const chunks = chunkFile(text, tokenizer as any);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].lineStart).toBe(1);
    expect(chunks[0].lineEnd).toBe(10);
  });

  test("multi-line large text has correct lineStart/lineEnd across chunks", () => {
    // 50 words per line, 30 lines = 1500 words total -> multiple chunks
    const lines = Array.from({ length: 30 }, (_, i) =>
      Array.from({ length: 50 }, (_, j) => `l${i}w${j}`).join(" ")
    );
    const text = lines.join("\n");
    const chunks = chunkFile(text, tokenizer as any);
    expect(chunks.length).toBeGreaterThanOrEqual(2);

    expect(chunks[0].lineStart).toBe(1);
    expect(chunks[chunks.length - 1].lineEnd).toBe(30);

    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].lineStart).toBeGreaterThanOrEqual(
        chunks[i - 1].lineStart
      );
    }
  });
});
