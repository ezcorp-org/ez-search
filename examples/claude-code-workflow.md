# Example: Using ez-search in a Claude Code Session

> [ez-search](https://ez-search.ezcorp.org/) — local, privacy-first semantic search for code, docs, and images.

## Scenario

A user asks: **"Where is the authentication middleware defined and how does it validate tokens?"**

The project is a large Node.js backend with hundreds of files, docs, and diagrams. Grep-based search would require knowing the exact function or variable names. ez-search finds the answer by meaning across code, documents, and images.

## Walkthrough

### Step 1: Check if an index exists

```bash
ez-search status --format json
```

Response (no index yet):
```json
{
  "error": true,
  "code": "NO_INDEX",
  "message": "No indexed content found",
  "suggestion": "Run `ez-search index .` first"
}
```

### Step 2: Index the codebase

```bash
ez-search index . --format json
```

Response:
```json
{
  "status": "ok",
  "filesIndexed": 247,
  "durationMs": 8500,
  "types": {
    "code": 198,
    "text": 49
  }
}
```

### Step 3: Search for authentication code

```bash
ez-search query "authentication middleware token validation" --format json --type code --threshold 0.5
```

Response:
```json
{
  "query": "authentication middleware token validation",
  "totalIndexed": 247,
  "searchScope": ".",
  "mode": "hybrid",
  "code": [
    {
      "file": "src/middleware/auth.ts",
      "lines": { "start": 15, "end": 42 },
      "score": 0.89,
      "text": "export async function authenticateRequest(req: Request, res: Response, next: NextFunction) {\n  const token = req.headers.authorization?.split('Bearer ')[1];\n  if (!token) { return res.status(401).json({ error: 'Missing token' }); }\n  try {\n    const payload = jwt.verify(token, config.jwtSecret);\n    req.user = payload;\n    next();\n  } catch (err) {\n    return res.status(401).json({ error: 'Invalid token' });\n  }\n}"
    },
    {
      "file": "src/middleware/rbac.ts",
      "lines": { "start": 8, "end": 28 },
      "score": 0.74,
      "text": "export function requireRole(...roles: string[]) { ... }"
    },
    {
      "file": "src/utils/jwt.ts",
      "lines": { "start": 1, "end": 18 },
      "score": 0.71,
      "text": "export function signToken(payload: object) { ... }"
    }
  ]
}
```

### Step 4: Read the top result

The agent reads `src/middleware/auth.ts` (lines 15-42) to understand the full authentication implementation.

### Step 5: Follow up with documentation search

```bash
ez-search query "authentication flow documentation" --format json --type text
```

Response:
```json
{
  "query": "authentication flow documentation",
  "totalIndexed": 247,
  "searchScope": ".",
  "mode": "hybrid",
  "text": [
    {
      "file": "docs/architecture.md",
      "score": 0.82,
      "text": "## Authentication\n\nAll API routes pass through the auth middleware which validates JWT tokens..."
    }
  ]
}
```

### Step 6: Synthesize the answer

The agent combines findings from code (`src/middleware/auth.ts`) and documentation (`docs/architecture.md`) to give the user a complete answer about where authentication is defined and how token validation works.

## Key Patterns

- **Always use `--format json`** for structured output the agent can parse
- **Search code first, then docs** for implementation questions
- **Use `--type` to focus** on code, text, or image results as needed
- **Use `--type image`** to find diagrams, screenshots, or visual assets by description
- **Use `--threshold 0.5`** to filter noise from results
- **Read the files** identified by ez-search to get full context — the snippets are chunks, not complete implementations
