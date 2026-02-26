# Testing & Benchmarking Gaps — TODO

## Wave 1: Unit Tests (Critical Missing Coverage)

- [x] **Unit test: vector-db.ts** — 24 tests, 58 assertions (schema versioning, duplicate ID, colon rejection, error paths)
- [x] **Unit test: model-router.ts** — 15 tests (WebGPU→CPU fallback, caching, L2-norm, Matryoshka truncation, concurrent dedup)
- [x] **Unit test: image-embedder.ts** — 16 tests (L2-norm, CLIP text/image embedding, dispose, empty input)

## Wave 2: Edge Case Unit Tests

- [x] **Edge cases: chunker.ts** — Empty file, single-line file, no newlines
- [x] **Edge cases: text-chunker.ts** — Oversized sentence hard-split, sole chunk below MIN, PDF extraction mock
- [ ] **Edge cases: file-scanner.ts** — Special characters in filenames, permission-denied / stat errors (not tackled — low priority, OS-dependent)
- [x] **Edge cases: manifest-cache.ts** — Version mismatch returns fresh, makeChunkId stability
- [x] **Edge cases: lexical-index.ts** — fromJSON wrong version throws, empty query returns []
- [x] **Edge cases: query-utils.ts** — Dir filter `./` prefix and trailing `/` normalization
- [x] **Edge cases: staleness.ts** — Empty manifest (all new), empty filesystem (all deleted)
- [x] **Edge cases: status-cmd.ts** — Corruption detection (manifest >10 bytes but empty entries)

## Wave 3: Integration Tests

- [x] **Integration: incremental re-indexing** — 5 tests (modify, delete, add, unchanged, file count tracking)
- [x] **Integration: auto-index query path** — 4 tests (auto-index, indexing field, skip on second query, autoIndex:false error)
- [x] **Integration: --clear flag** — 4 tests (reset chunks, remove stale data, rebuild lexical, incremental after clear)
- [x] **Integration: cross-type queries** — 5 tests (code-only, text-only, both, extension checks)
- [x] **Integration: stale index detection** — 5 tests (modified, status stale, new file, re-index resolves, deleted)

## Wave 4: E2E Tests

- [x] **E2E: --no-auto-index error** — JSON output with error:true, code:'NO_INDEX'
- [x] **E2E: --dir scoping** — Results only from scoped subdirectory (skips gracefully if no native deps)
- [x] **E2E: --threshold filtering** — High threshold reduces results (skips gracefully if no native deps)
- [x] **E2E: exit codes** — Status exit code 2 for NO_INDEX, query exit code 1
- [x] **E2E: JSON vs text format** — JSON parseable, text human-readable, text error on stderr

## Wave 5: Benchmarks

- [x] **Benchmark: indexing throughput** — ~37K files/sec, ~93K chunks/sec (text chunker)
- [x] **Benchmark: query latency** — p50=5ms, p95=12ms, p99=16ms at 10K docs
- [x] **Benchmark: incremental index speed** — 7.7x speedup at 10%, 2.9x at 25%, 1.7x at 50%
- [ ] **Benchmark: accuracy by mode** — Requires ML models, deferred to CI with GPU
- [x] **Benchmark: lexical index perf** — Add, query, serialize/deserialize lifecycle at scale
- [ ] **Benchmark: memory profiling** — Requires process-level RSS tracking, deferred
- [x] **Benchmark: fusion overhead** — RRF fusion 1.1-4.5x overhead vs baseline sort

## Verification

- [x] All new tests pass: `bun test` (206 pass unit, 67 pass integration, 22 pass e2e, 16 pass benchmarks)
- [x] No regressions — 9 pre-existing failures in library-api.test.ts (tokenizer.encode env issue)
- [x] Benchmarks produce meaningful baseline numbers

## Summary

| Category | Tests Added | Files Created/Modified |
|----------|------------|----------------------|
| Unit tests (new modules) | 55 | 3 new files |
| Edge case unit tests | 16 | 6 modified, 1 new |
| Integration tests | 23 | 5 new files |
| E2E tests | 8 | 1 new file |
| Benchmarks | 16 | 5 new + 1 helper |
| **Total** | **118** | **22 files** |

### Not tackled (deferred)
- file-scanner.ts edge cases (OS-dependent, low priority)
- Accuracy by mode benchmark (requires ML models / GPU CI)
- Memory profiling benchmark (requires process-level instrumentation)
