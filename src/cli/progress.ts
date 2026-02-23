/**
 * Live progress reporter for CLI indexing.
 *
 * Writes a single updating line to stderr using \r + ANSI clear.
 * Only active when stderr is a TTY and output isn't suppressed.
 * Does not interfere with JSON/text output on stdout.
 */

const BAR_WIDTH = 20;

export class ProgressReporter {
  private enabled: boolean;

  constructor(opts: { quiet?: boolean; json?: boolean }) {
    this.enabled = !opts.quiet && !opts.json && !!process.stderr.isTTY;
  }

  /** Overwrite the current line with a status message + optional progress bar. */
  update(message: string, current?: number, total?: number): void {
    if (!this.enabled) return;

    let line = message;
    if (total != null && current != null && total > 0) {
      const pct = Math.min(current / total, 1);
      const filled = Math.round(pct * BAR_WIDTH);
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(BAR_WIDTH - filled);
      line = `${message} [${bar}] ${current}/${total}`;
    }

    process.stderr.write(`\r\x1b[K${line}`);
  }

  /** Clear the progress line. Call when indexing is complete. */
  done(): void {
    if (!this.enabled) return;
    process.stderr.write('\r\x1b[K');
  }
}
