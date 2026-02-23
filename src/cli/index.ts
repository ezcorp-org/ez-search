#!/usr/bin/env node
import { Command } from 'commander';

const program = new Command();

program
  .name('ez-search')
  .description('Semantic codebase search with zero cloud dependencies')
  .version('0.1.0');

program
  .command('index <path>')
  .description('Index a directory for semantic search')
  .option('--no-ignore', 'disable .gitignore and .cursorignore filtering')
  .option('--type <type>', 'filter files by type: code|text|image')
  .option('-q, --quiet', 'suppress status output')
  .option('--clear', 'remove existing index before indexing')
  .option('--format <mode>', 'output format: json (default) or text')
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
  .action(async (text: string, options: { format?: string; topK: string; dir?: string; threshold?: string }) => {
    const { runQuery } = await import('./commands/query-cmd.js');
    await runQuery(text, options);
  });

program
  .command('status')
  .description('Show indexing status for the current directory')
  .action(async () => {
    const { runStatus } = await import('./commands/status-cmd.js');
    await runStatus();
  });

program.parse();

export { program };
