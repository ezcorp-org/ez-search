# Phase 1: Validation Spike - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Confirm Zvec and WebGPU/Transformers.js work on NixOS before building on them. If either dependency fails, identify and commit to a concrete fallback with a working proof. No production code — just validation and decisions.

</domain>

<decisions>
## Implementation Decisions

### Pass/fail criteria
- Zvec: full pipeline simulation — insert 1000+ vectors at realistic dimensions (768/512), query by similarity, measure that it works. Not just CRUD but realistic scale.
- Transformers.js: load Jina code model, produce embeddings, verify correct dimensions, and confirm similar inputs produce similar vectors (quality sanity check)
- Functionality is the pass/fail bar — no hard performance thresholds. Record timing numbers for reference but they don't block.
- Zvec SDK bug tolerance: Claude's discretion. Minor workarounds OK, but if core operations are fundamentally broken, switch to fallback.

### Fallback strategy
- Only test fallbacks if the primary dependency fails. Don't preemptively validate alternatives.
- Zvec fallback candidates: LanceDB or SQLite-vec — evaluate both if Zvec fails, pick the better fit.
- WebGPU fallback: CPU/WASM is a temporary bridge, not a permanent solution. WebGPU must eventually work — treat CPU-only as tech debt.
- Spike only validates, does not build abstraction layers. Wrapper interfaces come in Phase 2.

### Validation output
- No spike scripts directory or persistent test harness. Validation happens during plan execution — it works or it doesn't.
- Decision doc lives in `.planning/` capturing findings, pass/fail results, and any performance numbers observed.
- Code written in TypeScript to match the project's eventual stack.

### WebGPU vs CPU tradeoff
- GPU matters for both indexing speed and query latency equally.
- Attempt WebGPU first. If it doesn't work on NixOS, fall back to WASM/CPU. Don't investigate Vulkan or ONNX Runtime alternatives in this phase.
- No specific latency targets yet — just get it working. Optimization comes later.
- CPU/WASM is acceptable as a temporary bridge but WebGPU is the goal state.

### Claude's Discretion
- How much effort to spend patching Zvec SDK issues vs switching to fallback
- Location and structure of spike scripts (if any are needed during execution)
- Whether to wire up package.json scripts for re-running validation
- Cleanup of test artifacts

</decisions>

<specifics>
## Specific Ideas

- Zvec validation should simulate real usage (1000+ vectors, not toy examples) to catch scale issues early
- Record performance numbers even though they're not blocking — useful baseline for future optimization decisions
- If fallback is needed, the choice between LanceDB and SQLite-vec should consider which has fewer NixOS-specific issues

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-validation-spike*
*Context gathered: 2026-02-22*
