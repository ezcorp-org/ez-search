#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json');

const program = new Command();

program
  .name('ez-search')
  .description('Semantic codebase search with zero cloud dependencies')
  .version(version);

program
  .command('index <path>')
  .description('Index a directory for semantic search')
  .option('--no-ignore', 'disable .gitignore and .cursorignore filtering')
  .option('--type <type>', 'filter files by type: code|text|image')
  .option('-q, --quiet', 'suppress status output')
  .option('--clear', 'remove existing index before indexing')
  .option('--format <mode>', 'output format: json (default) or text')
  .addHelpText('after', `
Examples:
  $ ez-search index .                          Index current directory
  $ ez-search index . --format json            Index and output JSON stats
  $ ez-search index . --clear --type code      Re-index only code files
  $ ez-search index src/ --no-ignore           Index src/ including gitignored files`)
  .action(async (targetPath: string, options: { ignore: boolean; type?: string; quiet?: boolean; clear?: boolean; format?: string }) => {
    const { runIndex } = await import('./commands/index-cmd.js');
    await runIndex(targetPath, options);
  });

program
  .command('query <text>')
  .description('Search the index with a natural language query')
  .option('--format <mode>', 'output format: json (default) or text')
  .option('-k, --top-k <n>', 'number of results to return', '10')
  .option('--dir <path>', 'scope search to a subdirectory')
  .option('--threshold <score>', 'minimum relevance score (0-1) to include')
  .option('--type <type>', 'search specific type only: code|text|image')
  .option('--no-auto-index', 'disable automatic indexing when no index exists')
  .addHelpText('after', `
Examples:
  $ ez-search query "authentication logic"     Semantic search (auto-indexes if needed)
  $ ez-search query "db connections" --format json --type code --top-k 5
  $ ez-search query "error handling" --threshold 0.5 --dir src/
  $ ez-search query "test" --no-auto-index     Fail if no index exists`)
  .action(async (text: string, options: { format?: string; topK: string; dir?: string; threshold?: string; type?: string; autoIndex?: boolean }) => {
    const { runQuery } = await import('./commands/query-cmd.js');
    await runQuery(text, options);
  });

program
  .command('status')
  .description('Show indexing status for the current directory')
  .option('--format <mode>', 'output format: json (default) or text')
  .option('--no-ignore', 'disable .gitignore and .cursorignore filtering')
  .addHelpText('after', `
Examples:
  $ ez-search status                           Show index status as JSON
  $ ez-search status --format text             Show human-readable summary`)
  .action(async (options: { format?: string; ignore: boolean }) => {
    const { runStatus } = await import('./commands/status-cmd.js');
    await runStatus(options);
  });

program.parse();

export { program };
