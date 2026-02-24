/**
 * Ground-truth query-to-expected-result mappings for accuracy evaluation.
 *
 * Each query maps to a set of relevant filenames (basenames only, no paths).
 * Queries are grouped by content type to enable per-type metric aggregation.
 */

export type ContentType = 'code' | 'text' | 'image';

export interface GroundTruthQuery {
  query: string;
  type: ContentType;
  relevant: string[]; // filenames expected in top results
}

export const GROUND_TRUTH: GroundTruthQuery[] = [
  // ── Code queries ─────────────────────────────────────────────────────────
  {
    query: 'user authentication login logout',
    type: 'code',
    relevant: ['auth.ts', 'react-form.tsx'],
  },
  {
    query: 'sorting algorithm quicksort',
    type: 'code',
    relevant: ['sort.py'],
  },
  {
    query: 'HTTP request retry timeout',
    type: 'code',
    relevant: ['http-client.ts'],
  },
  {
    query: 'linked list data structure',
    type: 'code',
    relevant: ['linked-list.rs'],
  },
  {
    query: 'React component form validation',
    type: 'code',
    relevant: ['react-form.tsx'],
  },
  {
    query: 'database connection configuration',
    type: 'code',
    relevant: ['config.yaml'],
  },

  // ── Text queries ─────────────────────────────────────────────────────────
  {
    query: 'git branching and merging workflow',
    type: 'text',
    relevant: ['git-guide.md'],
  },
  {
    query: 'REST API design best practices',
    type: 'text',
    relevant: ['api-design.md'],
  },
  {
    query: 'Docker container deployment',
    type: 'text',
    relevant: ['deployment.txt'],
  },
  {
    query: 'HTTP status codes error handling',
    type: 'text',
    relevant: ['api-design.md'],
  },

  // ── Image queries ────────────────────────────────────────────────────────
  {
    query: 'bar chart data visualization',
    type: 'image',
    relevant: ['bar-chart.png'],
  },
  {
    query: 'login form user interface',
    type: 'image',
    relevant: ['login-form.png'],
  },
  {
    query: 'terminal command line',
    type: 'image',
    relevant: ['terminal.png'],
  },
];

/** Get queries filtered by content type. */
export function queriesByType(type: ContentType): GroundTruthQuery[] {
  return GROUND_TRUTH.filter((q) => q.type === type);
}
