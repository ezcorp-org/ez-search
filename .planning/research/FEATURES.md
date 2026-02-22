# Feature Landscape

**Domain:** Local AI Semantic Search CLI Tools
**Researched:** 2026-02-22
**Confidence:** MEDIUM-HIGH (based on analysis of grepai, mgrep, rclip, Semantra, QMD, SemTools, autodev-codebase, Roo Code indexing, and ripgrep-all)

## Table Stakes

Features users expect. Missing any of these and the tool feels broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Natural language query | The entire point of semantic search. Users type "auth logic" and expect to find `validateCredentials()`. Every competitor does this. | Medium | Query embedding + cosine similarity. Already in PRD. |
| Fast indexing with caching | grepai indexes 10k files in seconds. rclip caches vectors in SQLite. Users will not tolerate re-embedding unchanged files. | Medium | mtime/size + content hash. PRD specifies xxhash. |
| Incremental re-indexing | Every tool (grepai, rclip, SemTools, rga) caches previous work. Only process changed/new/deleted files. | Medium | Manifest-based diffing. Already in PRD. |
| .gitignore respect | ripgrep set this expectation for all code search tools. Indexing `node_modules` or `.git` is unacceptable. | Low | Use `ignore` npm package. Already in PRD. |
| Ranked results with file paths and line numbers | Users and AI agents need exact locations, not just file names. ripgrep, grepai, and mgrep all return precise locations. | Low | Metadata stored alongside embeddings. Already in PRD. |
| Machine-readable output | Primary consumer is AI coding assistants. JSON or structured text output is non-negotiable. grepai outputs JSON. mgrep is CLI-native. | Low | Already in PRD as structured format. |
| Multiple file type support | rga searches PDFs, DOCX, etc. mgrep handles code, text, PDFs, images. Single-type tools feel limited. | Medium | PRD covers code/text/images via model routing. |
| Offline / 100% local operation | Privacy is the #1 differentiator vs cloud tools. grepai, rclip, and Semantra all emphasize this. Developers on Reddit cite it as a hard requirement. | Low | Already a core design principle. No API keys needed. |
| Reasonable cold start time | Users expect CLI tools to feel instant. grepai is a single binary. SemTools is Rust. Anything over ~3s feels sluggish. | High | PRD targets 1.5s via lazy model loading. WebGPU init may challenge this. |
| Clear progress feedback | Indexing thousands of files takes time. ora spinners, progress bars, file counts. Every serious CLI tool does this. | Low | PRD mentions ora. |

## Differentiators

Features that set ez-search apart. Not expected by default, but highly valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Multimodal search (code + text + images)** | No single competitor covers all three well. grepai does code only. rclip does images only. mgrep does code+text+images but requires cloud. ez-search would be the first fully local tool spanning all three modalities. | High | Three model paths (Jina, Nomic, CLIP). Already in PRD. This is the killer differentiator. |
| **WebGPU hardware acceleration** | Most local tools use CPU inference (slow) or require Ollama as a dependency. WebGPU in Node.js v22+ means GPU-speed embeddings with zero external dependencies. | High | Experimental runtime. PRD core. Needs fallback plan. |
| **MCP server integration** | grepai's MCP server is its breakout feature. Claude Code, Cursor, and Windsurf can call search as a native tool. Without MCP, the tool requires manual invocation. | Medium | Not in PRD. Should be a phase 2 priority. The market clearly demands this. |
| **Hybrid search (semantic + keyword)** | QMD combines BM25 + vector + re-ranking. Roo Code uses hybrid. The consensus is that semantic alone misses exact matches, and keyword alone misses intent. Combining them yields the best results. | High | Not in PRD. Would require BM25 index alongside vector DB. Consider for later phase. |
| **Cross-language code search** | Jina code embeddings map semantically similar code across languages. Search "sort algorithm" and find implementations in Python, Go, and Rust. Unique to embedding-based search. | Low | Nearly free if using Jina model -- it handles this natively. Good to highlight in docs. |
| **Image-to-image search** | rclip supports using an image as a query to find similar images. CLIP's shared embedding space makes this straightforward. | Low | CLIP naturally supports this. Small addition to query command. |
| **Call graph / dependency tracing** | grepai traces callers and callees using tree-sitter AST. Powerful for "what calls this function?" queries that pure semantic search cannot answer. | High | Requires tree-sitter integration per language. Nice-to-have, not core. |
| **Watch mode / auto-reindex** | grepai and mgrep both offer file watchers. Keeps index fresh without manual re-runs. Critical for long coding sessions. | Medium | PRD explicitly defers this. Should be phase 2-3. |
| **Configurable output formats** | JSON, plain text, CSV, or even piped to other tools. rclip's `-f` flag outputs paths only for piping. grepai outputs JSON for agents. | Low | Easy to add multiple formatters. High value for tool composability. |
| **Workspace / multi-directory support** | grepai has workspace management. Roo Code indexes multi-folder workspaces. Users want to search across related repos. | Medium | PRD scopes to single directory. Natural evolution for v2. |

## Anti-Features

Features to explicitly NOT build. Common mistakes in this domain that would hurt ez-search.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Cloud/API dependency for core search** | mgrep requires Mixedbread's hosted service. This is the #1 complaint in the space. Privacy-conscious developers reject any tool that phones home. | Keep all inference and storage local. Zero API keys for core functionality. This is already the plan. |
| **GUI / web interface** | Semantra launches a web UI. This adds complexity, dependencies, and moves away from the CLI-native audience. AI agents cannot use a web UI. | Stay CLI-only. If visualization is needed later, build it as a separate optional package. |
| **Bundled LLM for answer generation** | QMD and SemTools include "ask" commands that run LLM inference. This massively increases resource usage, model download size, and scope. The primary consumer (AI assistants) already has an LLM -- they just need retrieval. | Return ranked chunks with context. Let the calling AI assistant do the reasoning. ez-search is a retrieval engine, not a chat system. |
| **Ollama as a required dependency** | grepai requires Ollama. autodev-codebase requires Ollama. This adds installation friction and a background process. Users must download and run a separate service. | Use @huggingface/transformers with built-in ONNX runtime. Models download once on first use, no daemon required. |
| **Over-engineered chunking strategies** | Spending excessive effort on AST-aware chunking for every language. Tree-sitter supports many languages but each needs grammar maintenance. | Start with line-based chunking with overlap (as in PRD). Add AST-aware chunking for top languages (TS/JS/Python) only if retrieval quality demands it. |
| **Real-time streaming results** | Some tools try to stream results as they compute. For a CLI that returns 10 results, this adds complexity with zero benefit. | Compute all results, sort by relevance, print once. Simple and predictable. |
| **Custom model training / fine-tuning** | Some tools let users bring custom models. This is a support nightmare and the pre-trained models are already excellent for this use case. | Ship with opinionated model choices. Let advanced users swap ONNX models via config if they want, but do not build training infrastructure. |
| **Plugin / adapter system** | rga has adapters for file types. This is powerful but adds significant architectural complexity early on. | Handle core file types natively. Use a simple config for file extension to pipeline mapping. Plugins can come much later if ever. |

## Feature Dependencies

```
Incremental Indexing ──> Indexing Command (must index before you can cache)
Query Command ──────────> Indexing Command (must have an index to query)
Image Search ───────────> CLIP Model Loading (separate model path)
Code Search ────────────> Jina Model Loading (separate model path)
Text Search ────────────> Nomic Model Loading (separate model path)
MCP Server ─────────────> Query Command (MCP exposes query as a tool)
Watch Mode ─────────────> Incremental Indexing (watches for changes, triggers incremental)
Hybrid Search ──────────> Query Command + BM25 Index (parallel retrieval path)
Workspace Support ──────> Multi-directory Index Management
Call Graph Tracing ─────> Tree-sitter AST Parsing (per-language grammars)
Image-to-Image Search ──> CLIP Model Loading + Query modification
```

**Critical path:** Indexing (with one model) -> Query -> Incremental Indexing -> Multi-model routing -> MCP Server

## MVP Recommendation

For MVP, prioritize these table stakes:

1. **Single-model indexing and query** (start with code/Jina -- most relevant to primary consumer)
2. **Incremental indexing with manifest** (skip unchanged files)
3. **.gitignore respect** (essential for code projects)
4. **Machine-readable JSON output** (AI agents are the primary consumer)
5. **Ranked results with file paths and line numbers** (precise locations)

Then immediately follow with:

6. **Multi-model routing** (add Nomic for text, CLIP for images)
7. **MCP server** (this is what makes the tool discoverable by AI agents)

Defer to post-MVP:
- **Watch mode**: Manual `ez-search index` is fine for v1. Competitors started without it.
- **Hybrid search (BM25 + vector)**: Semantic-only is sufficient initially. Add keyword fallback when quality gaps appear.
- **Call graph tracing**: Cool feature but orthogonal to semantic search. Different tool concern.
- **Workspace / multi-directory**: Each project gets its own index. Cross-project search is a v2 problem.
- **Image-to-image query**: Text-to-image is the primary use case. Image-to-image is niche.

## Competitive Positioning

| Tool | Local? | Code | Text | Images | MCP | Hybrid | Watch |
|------|--------|------|------|--------|-----|--------|-------|
| **grepai** | Yes (needs Ollama) | Yes | No | No | Yes | No | Yes |
| **mgrep** | No (cloud) | Yes | Yes | Yes | Yes | Yes | Yes |
| **rclip** | Yes | No | No | Yes | No | No | No |
| **Semantra** | Yes | No | Yes | No | No | No | No |
| **SemTools** | Yes | No | Yes | No | No | No | No |
| **QMD** | Yes | No | Yes | No | No | Yes | No |
| **ez-search (planned)** | Yes (no deps) | Yes | Yes | Yes | Planned | No | No |

**The gap ez-search fills:** Fully local, zero-dependency, multimodal (code + text + images) semantic search with GPU acceleration. No other tool covers all three modalities locally without requiring Ollama or a cloud service.

## Sources

- [grepai - Semantic Code Search for AI Agents](https://yoanbernabeu.github.io/grepai/)
- [mgrep - Mixedbread AI](https://github.com/mixedbread-ai/mgrep)
- [rclip - AI-Powered Command-Line Photo Search](https://github.com/yurijmikhalevich/rclip)
- [Semantra - Multi-tool for semantic search](https://github.com/freedmand/semantra)
- [SemTools - LlamaIndex](https://github.com/run-llama/semtools)
- [QMD - Local semantic search](https://github.com/tobi/qmd)
- [autodev-codebase - MCP + Ollama code search](https://github.com/anrgct/autodev-codebase)
- [Roo Code Codebase Indexing](https://docs.roocode.com/features/codebase-indexing)
- [ripgrep-all](https://github.com/phiresky/ripgrep-all)
- [Codex CLI semantic indexing discussion](https://github.com/openai/codex/issues/5181)
- [GrepAI cost savings analysis](https://richardporter.dev/blog/grepai-semantic-code-search-claude-code)
- [6 Best Code Embedding Models Compared](https://modal.com/blog/6-best-code-embedding-models-compared)
