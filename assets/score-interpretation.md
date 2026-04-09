# ez-search Score Interpretation

## Relevance Scores

| Score | Meaning | Action |
|-------|---------|--------|
| 0.85+ | Near-exact semantic match | Read immediately |
| 0.70 – 0.84 | Strong match | High priority read |
| 0.50 – 0.69 | Relevant | Scan if top results are insufficient |
| 0.30 – 0.49 | Weak relevance | Usually noise — skip |
| Below 0.30 | Not relevant | Ignore |

Use `--threshold 0.5` to automatically filter weak and irrelevant results.

## Search Mode Selection

| Situation | Mode | Flag |
|-----------|------|------|
| General "find where X happens" queries | Hybrid | `--mode hybrid` (default) |
| Conceptual or vague queries | Semantic | `--mode semantic` |
| Known function/variable name | Keyword | `--mode keyword` |
| Debugging a specific symbol | Keyword | `--mode keyword` |
| Exploring related code patterns | Semantic | `--mode semantic` |

## Type Selection

| Looking for... | Flag |
|----------------|------|
| Implementation code | `--type code` |
| Documentation, READMEs, prose | `--type text` |
| Diagrams, screenshots, images | `--type image` |
| Everything | omit the flag |

## Quick Reference

```bash
# Hybrid search (best default)
ez-search query "error handling" --format json --threshold 0.5

# Semantic only (conceptual search)
ez-search query "how does the app handle failures" --format json --mode semantic

# Keyword only (exact identifier)
ez-search query "handleUserAuth" --format json --mode keyword

# Scoped to directory
ez-search query "database queries" --format json --dir src/db/

# Code only
ez-search query "validation logic" --format json --type code --top-k 5
```
