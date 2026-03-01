---
phase: quick
plan: 003
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/model-router.ts
  - src/services/image-embedder.ts
  - src/cli/commands/index-cmd.ts
  - src/cli/commands/query-cmd.ts
  - src/cli/index.ts
  - src/index.ts
  - tests/unit/model-router.test.ts
autonomous: true

must_haves:
  truths:
    - "User can pass --model <path-or-id> to `ez-search index` to use a custom text/code ONNX model"
    - "User can pass --model <path-or-id> to `ez-search query` to use a custom text/code ONNX model"
    - "User can pass --clip-model <path-or-id> to override the CLIP image model"
    - "Library API accepts model and clipModel options on index() and query()"
    - "Default behavior unchanged when no custom model is specified"
  artifacts:
    - path: "src/services/model-router.ts"
      provides: "createEmbeddingPipeline accepts optional modelId override"
    - path: "src/services/image-embedder.ts"
      provides: "createImageEmbeddingPipeline and createClipTextPipeline accept optional modelId override"
    - path: "src/index.ts"
      provides: "IndexOptions.model, IndexOptions.clipModel, QueryOptions.model, QueryOptions.clipModel"
  key_links:
    - from: "src/cli/index.ts"
      to: "src/cli/commands/index-cmd.ts"
      via: "--model and --clip-model CLI options passed to runIndex"
    - from: "src/cli/commands/index-cmd.ts"
      to: "src/services/model-router.ts"
      via: "modelId option passed to createEmbeddingPipeline"
    - from: "src/cli/commands/query-cmd.ts"
      to: "src/services/model-router.ts"
      via: "modelId option passed to createEmbeddingPipeline"
---

<objective>
Allow users to specify custom ONNX model paths (local or HuggingFace IDs) for both text/code embedding and CLIP image embedding, via CLI flags and library API options.

Purpose: Users with fine-tuned or alternative ONNX models can use them instead of the bundled defaults (Qwen3-Embedding-0.6B for text/code, CLIP ViT-B/16 for images).

Output: Updated CLI with --model and --clip-model flags, updated library API with model/clipModel options, threading through to model-router and image-embedder.
</objective>

<execution_context>
@.planning/quick/003-custom-onnx-model-path-for-cli-and-api/003-PLAN.md
</execution_context>

<context>
@src/services/model-router.ts    # MODEL_REGISTRY, createEmbeddingPipeline — hardcoded model IDs
@src/services/image-embedder.ts  # CLIP_MODEL_ID, createImageEmbeddingPipeline, createClipTextPipeline
@src/cli/index.ts                # Commander program — index/query/status commands
@src/cli/commands/index-cmd.ts   # runIndex — calls createEmbeddingPipeline(type) and createImageEmbeddingPipeline()
@src/cli/commands/query-cmd.ts   # runQuery — calls createEmbeddingPipeline(type) and createClipTextPipeline()
@src/index.ts                    # Library API — IndexOptions, QueryOptions, index(), query()
@src/types.ts                    # ModelBackend type
</context>

<tasks>

<task type="auto">
  <name>Task 1: Thread model override through model-router and image-embedder</name>
  <files>
    src/services/model-router.ts
    src/services/image-embedder.ts
  </files>
  <action>
**model-router.ts:**

1. Add an optional `modelId` field to `EmbeddingPipelineOptions`:
   ```ts
   export interface EmbeddingPipelineOptions {
     progressCallback?: (progress: unknown) => void;
     modelId?: string;  // Custom HuggingFace ID or local path to ONNX model
   }
   ```

2. In `createEmbeddingPipeline`, use `options.modelId` to override the registry lookup:
   - `const effectiveModelId = options.modelId ?? model.id;`
   - Use `effectiveModelId` everywhere `model.id` was used (pipeline cache key, pipeline() call, pipelineCache.set, console.error messages)
   - IMPORTANT: When a custom model is provided, we cannot know nativeDim/dim. Default to the registry values but document that custom models must produce compatible dimensions. The user is responsible for ensuring their model outputs vectors of at least `model.dim` dimensions.
   - Update `buildPipelineWrapper` to accept the effective model ID string (instead of deriving from `model` object) and pass it through as `modelId` on the returned pipeline.

**image-embedder.ts:**

1. Add optional `modelId?: string` parameter to both `createImageEmbeddingPipeline` and `createClipTextPipeline`:
   ```ts
   export async function createImageEmbeddingPipeline(options?: { modelId?: string }): Promise<ImageEmbeddingPipeline>
   export async function createClipTextPipeline(options?: { modelId?: string }): Promise<ClipTextPipeline>
   ```

2. In both functions, use `const effectiveModelId = options?.modelId ?? CLIP_MODEL_ID;` and replace all uses of `CLIP_MODEL_ID` with `effectiveModelId` (from_pretrained calls, progress callback, console.error messages, returned `modelId` field).

Do NOT change the default behavior when no override is provided. The pipeline cache in model-router should use the effective model ID as cache key (it already uses `model.id`, just switch to `effectiveModelId`).
  </action>
  <verify>
    `bun run build` succeeds with no type errors. Existing tests still pass: `bun test tests/unit/model-router.test.ts`
  </verify>
  <done>
    createEmbeddingPipeline, createImageEmbeddingPipeline, and createClipTextPipeline all accept an optional model ID override while maintaining backward compatibility.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add CLI flags and library API options, wire through commands</name>
  <files>
    src/cli/index.ts
    src/cli/commands/index-cmd.ts
    src/cli/commands/query-cmd.ts
    src/index.ts
  </files>
  <action>
**src/index.ts (library API):**

1. Add to `IndexOptions`:
   ```ts
   /** Custom text/code embedding model (HuggingFace ID or local ONNX path) */
   model?: string;
   /** Custom CLIP image model (HuggingFace ID or local ONNX path) */
   clipModel?: string;
   ```

2. Add to `QueryOptions`:
   ```ts
   /** Custom text/code embedding model (HuggingFace ID or local ONNX path) */
   model?: string;
   /** Custom CLIP image model (HuggingFace ID or local ONNX path) */
   clipModel?: string;
   ```

3. Pass through in `index()`: add `model` and `clipModel` to the options object passed to `runIndex`.
4. Pass through in `query()`: add `model` and `clipModel` to the options object passed to `runQuery`.

**src/cli/index.ts (CLI):**

1. Add to the `index` command (before `.action`):
   ```ts
   .option('--model <path>', 'custom text/code embedding model (HuggingFace ID or local ONNX path)')
   .option('--clip-model <path>', 'custom CLIP image model (HuggingFace ID or local ONNX path)')
   ```

2. Add to the `query` command (before `.action`):
   ```ts
   .option('--model <path>', 'custom text/code embedding model (HuggingFace ID or local ONNX path)')
   .option('--clip-model <path>', 'custom CLIP image model (HuggingFace ID or local ONNX path)')
   ```

3. Pass `model` and `clipModel` through in both action handlers. Commander will camelCase `--clip-model` to `clipModel` automatically.

**src/cli/commands/index-cmd.ts:**

1. Add `model?: string; clipModel?: string` to `runIndex`'s options parameter type.

2. Where `createEmbeddingPipeline(type)` is called (inside `runTextEmbeddingPipeline`), pass the model override. This requires adding `model?: string` to `runTextEmbeddingPipeline`'s opts parameter and threading it through:
   ```ts
   pipe = await createEmbeddingPipeline(type, { modelId: opts.model });
   ```
   Since `runTextEmbeddingPipeline` is a module-level function, add `model?: string` to its opts type and pass it from `runIndex`.

3. Where `createImageEmbeddingPipeline()` is called (image pipeline section), pass:
   ```ts
   const imagePipeline = await createImageEmbeddingPipeline({ modelId: options.clipModel });
   ```

**src/cli/commands/query-cmd.ts:**

1. Add `model?: string; clipModel?: string` to `QueryOptions` interface (the internal one, not the exported result type).

2. Where `createEmbeddingPipeline(type)` is called in `queryCodeOrText`, thread the model override. Add `model?: string` to `queryCodeOrText`'s opts parameter:
   ```ts
   pipe = await createEmbeddingPipeline(type, { modelId: opts.model });
   ```
   Pass `options.model` when calling `queryCodeOrText` from `runQuery`.

3. Where `createClipTextPipeline()` is called (image query section), pass:
   ```ts
   pipe = await createClipTextPipeline({ modelId: options.clipModel });
   ```

4. In `runQuery`, when auto-indexing occurs, pass the model options to `runIndex`:
   ```ts
   autoIndexResult = await runIndex(projectDir, { ignore: true, _silent: silent, model: options.model, clipModel: options.clipModel });
   ```
  </action>
  <verify>
    `bun run build` succeeds. `bun test` passes all existing tests. Verify CLI help shows new options: `node dist/cli/index.js index --help` and `node dist/cli/index.js query --help` both show --model and --clip-model.
  </verify>
  <done>
    CLI flags --model and --clip-model available on index and query commands. Library API accepts model and clipModel on IndexOptions and QueryOptions. Options flow through to model-router and image-embedder. Default behavior is unchanged when options are omitted.
  </done>
</task>

</tasks>

<verification>
1. `bun run build` — no type errors
2. `bun test` — all existing tests pass (no regressions)
3. `node dist/cli/index.js index --help` shows --model and --clip-model options
4. `node dist/cli/index.js query --help` shows --model and --clip-model options
5. Library types: IndexOptions and QueryOptions include model and clipModel fields
</verification>

<success_criteria>
- CLI users can pass `--model /path/to/custom-onnx-model` to both `index` and `query`
- CLI users can pass `--clip-model /path/to/custom-clip-model` to both `index` and `query`
- Library users can pass `model` and `clipModel` in IndexOptions and QueryOptions
- All options thread through to the underlying pipeline creation functions
- Default behavior is identical when no custom model is specified
- All existing tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/003-custom-onnx-model-path-for-cli-and-api/003-SUMMARY.md`
</output>
