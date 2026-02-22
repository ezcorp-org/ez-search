/**
 * Transformers.js v4 Spike: WebGPU-to-CPU Fallback + Embedding Quality Validation
 *
 * Validates:
 * 1. WebGPU attempted first, CPU fallback engaged if unavailable
 * 2. jinaai/jina-embeddings-v2-base-code loads and produces 768-dim embeddings
 * 3. nomic-ai/nomic-embed-text-v1.5 loads with task prefixes and produces 768-dim embeddings
 * 4. Cosine similarity sanity check: similar inputs > dissimilar inputs
 * 5. Timing data for model load and inference
 */

import { pipeline, cos_sim, env } from "@huggingface/transformers";

// Allow remote model downloads
env.allowRemoteModels = true;

// ── Types ──────────────────────────────────────────────────────────────────

type Backend = "webgpu" | "cpu";

interface PipelineResult {
  pipe: Awaited<ReturnType<typeof pipeline>>;
  backend: Backend;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two Float32Array / number[] vectors.
 * Falls back to manual implementation if cos_sim is unavailable.
 */
function cosineSimilarity(a: number[] | Float32Array, b: number[] | Float32Array): number {
  // Use library function if available
  if (typeof cos_sim === "function") {
    return cos_sim(a as number[], b as number[]);
  }
  // Manual implementation
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Extract the flat Float32Array from a pipeline Tensor output.
 * The pipeline returns a Tensor; its raw data lives in `.data`.
 */
function extractEmbedding(output: unknown): Float32Array {
  // Tensor has a .data property (Float32Array)
  if (output && typeof output === "object" && "data" in output) {
    return (output as { data: Float32Array }).data;
  }
  // Fallback: tolist() returns nested array
  if (output && typeof output === "object" && "tolist" in output) {
    const nested = (output as { tolist: () => number[][] }).tolist();
    return new Float32Array(nested.flat());
  }
  throw new Error(`Unexpected embedding output shape: ${JSON.stringify(output)}`);
}

function pass(condition: boolean): string {
  return condition ? "PASS" : "FAIL";
}

function ms(start: number, end: number): string {
  return `${(end - start).toFixed(0)}ms`;
}

// ── Pipeline Factory ───────────────────────────────────────────────────────

/**
 * Tries WebGPU first; falls back to CPU q8 if unavailable.
 * Returns the pipeline and which backend was selected.
 */
async function createPipeline(modelId: string): Promise<PipelineResult> {
  // Attempt WebGPU
  try {
    const pipe = await pipeline("feature-extraction", modelId, {
      device: "webgpu",
      dtype: "fp32",
    });
    console.log(`[backend] WebGPU selected for ${modelId}`);
    return { pipe, backend: "webgpu" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[backend] WebGPU unavailable: ${msg}`);
    console.log(`[backend] Falling back to CPU (q8) for ${modelId}`);
  }

  const pipe = await pipeline("feature-extraction", modelId, {
    device: "cpu",
    dtype: "q8",
  });
  console.log(`[backend] CPU selected for ${modelId}`);
  return { pipe, backend: "cpu" };
}

// ── Main Spike ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const results: { test: string; pass: boolean }[] = [];

  console.log("\n════════════════════════════════════════");
  console.log("  Transformers.js v4 Validation Spike");
  console.log("════════════════════════════════════════\n");

  // ── 1. Jina Code Embeddings ──────────────────────────────────────────────
  console.log("── Task A: jinaai/jina-embeddings-v2-base-code ──");

  const jinaModelId = "jinaai/jina-embeddings-v2-base-code";
  let jinaBackend: Backend;

  const jinaLoadStart = performance.now();
  const { pipe: jinaPipe, backend: jBackend } = await createPipeline(jinaModelId);
  const jinaLoadEnd = performance.now();
  jinaBackend = jBackend;

  console.log(`  Model load time : ${ms(jinaLoadStart, jinaLoadEnd)}`);
  console.log(`  Backend         : ${jinaBackend}`);

  const jinaInputs = [
    "function add(a: number, b: number) { return a + b; }",
    "function sum(x: number, y: number) { return x + y; }",
    "class DatabaseConnection { constructor(private url: string) {} }",
  ];

  const jinaInferStart = performance.now();
  const jinaOutputs = await Promise.all(
    jinaInputs.map((text) => jinaPipe(text, { pooling: "mean" }))
  );
  const jinaInferEnd = performance.now();

  console.log(`  Inference time  : ${ms(jinaInferStart, jinaInferEnd)} (${jinaInputs.length} inputs)`);

  const jinaEmbeddings = jinaOutputs.map(extractEmbedding);

  // Check dimensions
  const jinaDims = jinaEmbeddings.map((e) => e.length);
  const jinaAllCorrectDims = jinaDims.every((d) => d === 768);
  console.log(`  Dimensions      : [${jinaDims.join(", ")}] ${pass(jinaAllCorrectDims)}`);
  results.push({ test: "Jina: 768-dim embeddings", pass: jinaAllCorrectDims });

  // Cosine similarity: add vs sum (SIMILAR), add vs DB (DISSIMILAR)
  const jinaAddSumSim = cosineSimilarity(jinaEmbeddings[0], jinaEmbeddings[1]);
  const jinaAddDbSim = cosineSimilarity(jinaEmbeddings[0], jinaEmbeddings[2]);

  const jinaSimHigh = jinaAddSumSim > 0.8;
  const jinaSimOrdering = jinaAddSumSim > jinaAddDbSim;

  console.log(`  add vs sum sim  : ${jinaAddSumSim.toFixed(4)} ${pass(jinaSimHigh)} (>0.8)`);
  console.log(`  add vs db  sim  : ${jinaAddDbSim.toFixed(4)}`);
  console.log(`  Ordering check  : add/sum > add/db ? ${pass(jinaSimOrdering)}`);

  results.push({ test: "Jina: add/sum similarity > 0.8", pass: jinaSimHigh });
  results.push({ test: "Jina: similar > dissimilar ordering", pass: jinaSimOrdering });

  // ── 2. Nomic Text Embeddings ─────────────────────────────────────────────
  console.log("\n── Task B: nomic-ai/nomic-embed-text-v1.5 ──");

  const nomicModelId = "nomic-ai/nomic-embed-text-v1.5";
  let nomicBackend: Backend;

  const nomicLoadStart = performance.now();
  const { pipe: nomicPipe, backend: nBackend } = await createPipeline(nomicModelId);
  const nomicLoadEnd = performance.now();
  nomicBackend = nBackend;

  console.log(`  Model load time : ${ms(nomicLoadStart, nomicLoadEnd)}`);
  console.log(`  Backend         : ${nomicBackend}`);

  const nomicInputs = [
    "search_document: How to authenticate users with JWT tokens",
    "search_query: jwt authentication",
    "search_document: Recipe for chocolate cake with frosting",
  ];

  const nomicInferStart = performance.now();
  const nomicOutputs = await Promise.all(
    nomicInputs.map((text) => nomicPipe(text, { pooling: "mean", normalize: true }))
  );
  const nomicInferEnd = performance.now();

  console.log(`  Inference time  : ${ms(nomicInferStart, nomicInferEnd)} (${nomicInputs.length} inputs)`);

  const nomicEmbeddings = nomicOutputs.map(extractEmbedding);

  // Check dimensions
  const nomicDims = nomicEmbeddings.map((e) => e.length);
  const nomicAllCorrectDims = nomicDims.every((d) => d === 768);
  console.log(`  Dimensions      : [${nomicDims.join(", ")}] ${pass(nomicAllCorrectDims)}`);
  results.push({ test: "Nomic: 768-dim embeddings", pass: nomicAllCorrectDims });

  // Cosine similarity: jwt_doc vs jwt_query (SIMILAR), jwt_doc vs cake (DISSIMILAR)
  const nomicJwtDocQuerySim = cosineSimilarity(nomicEmbeddings[0], nomicEmbeddings[1]);
  const nomicJwtCakeSim = cosineSimilarity(nomicEmbeddings[0], nomicEmbeddings[2]);

  const nomicSimOrdering = nomicJwtDocQuerySim > nomicJwtCakeSim;

  console.log(`  jwt_doc vs jwt_query sim : ${nomicJwtDocQuerySim.toFixed(4)}`);
  console.log(`  jwt_doc vs cake_doc  sim : ${nomicJwtCakeSim.toFixed(4)}`);
  console.log(`  Ordering check           : jwt/jwt > jwt/cake ? ${pass(nomicSimOrdering)}`);

  results.push({ test: "Nomic: similar > dissimilar ordering", pass: nomicSimOrdering });

  // ── 3. Summary ───────────────────────────────────────────────────────────
  console.log("\n════════════════════════════════════════");
  console.log("  Results Summary");
  console.log("════════════════════════════════════════");
  console.log(`  Jina backend  : ${jinaBackend}`);
  console.log(`  Nomic backend : ${nomicBackend}`);
  console.log("");

  const allPass = results.every((r) => r.pass);
  for (const r of results) {
    const icon = r.pass ? "✓" : "✗";
    console.log(`  ${icon} ${r.test}`);
  }

  console.log("");
  console.log(`  Overall: ${allPass ? "PASS" : "FAIL"}`);
  console.log("════════════════════════════════════════\n");

  if (!allPass) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Spike failed:", err);
  process.exit(1);
});

/*
 * ── Findings (observed 2026-02-23 on NixOS, @huggingface/transformers v4.0.0-next.4) ──
 *
 * Backend determination:
 *   SELECTED: cpu (q8)
 *   WebGPU attempted first. Failure message:
 *     "Warning: Couldn't load Vulkan: libvulkan.so.1: cannot open shared object file: No such file or directory"
 *     "Failed to get a WebGPU adapter: No supported adapters"
 *   CPU fallback engaged automatically -- no code changes needed.
 *
 * NixOS-specific requirements for WebGPU:
 *   - vulkan-loader must be in LD_LIBRARY_PATH for WebGPU to work:
 *       export LD_LIBRARY_PATH=$(nix-build '<nixpkgs>' -A vulkan-loader --no-out-link)/lib:$LD_LIBRARY_PATH
 *   - Or configure shell.nix / devShell with:
 *       buildInputs = [ pkgs.vulkan-loader pkgs.mesa ];
 *       shellHook = "export LD_LIBRARY_PATH=${pkgs.vulkan-loader}/lib:$LD_LIBRARY_PATH";
 *   - Without vulkan-loader, Dawn (WebGPU impl used by ONNX Runtime) cannot find libvulkan.so.1.
 *
 * Observed timing (CPU, q8 quantized, cached models):
 *   Jina model load  : ~8846ms (first run; ~500ms cached)
 *   Jina inference   : ~48ms  (3 inputs)
 *   Nomic model load : ~6407ms (first run; ~400ms cached)
 *   Nomic inference  : ~68ms  (3 inputs)
 *
 * Model download sizes (q8 quantized):
 *   jinaai/jina-embeddings-v2-base-code : ~130MB, cached at ~/.cache/huggingface/hub/
 *   nomic-ai/nomic-embed-text-v1.5      : ~140MB, cached at ~/.cache/huggingface/hub/
 *
 * Embedding quality (observed):
 *   Jina code model:
 *     add() vs sum()             : 0.8277 PASS (>0.8 threshold)
 *     add() vs DatabaseConnection: 0.1091 (much lower, as expected)
 *   Nomic text model:
 *     jwt_doc vs jwt_query: 0.7541 PASS (higher)
 *     jwt_doc vs cake_doc : 0.4697 (lower, as expected)
 *
 * Key pitfalls encountered / avoided:
 *   - device: 'cpu' is correct for Node.js fallback (NOT 'wasm')
 *   - Official model IDs required (jinaai/, nomic-ai/) -- Xenova/ mirrors return 401
 *   - nomic model REQUIRES task prefixes ("search_document:", "search_query:")
 *   - Pipeline output is a Tensor; use .data for raw Float32Array
 *   - cos_sim IS exported from @huggingface/transformers v4 (no manual impl needed)
 *   - @huggingface/transformers@next resolves to v4.0.0-next.4 (specify exact if needed)
 *
 * Conclusion:
 *   Transformers.js v4 works on NixOS with CPU fallback. WebGPU requires vulkan-loader
 *   in the Nix shell. CPU q8 is fast enough for interactive search (<100ms inference).
 *   Both Jina (code) and Nomic (text) models produce high-quality 768-dim embeddings.
 */
