'use strict';

const { isTTY, green, dim } = require('./colors');

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const BAR_WIDTH = 16;

/**
 * Creates a spinner for operations without known size.
 * Returns { stop(success) } — call stop() to clear the line.
 */
function createSpinner(label) {
  if (!isTTY) {
    process.stdout.write(`  ${label}...\n`);
    return { stop: (msg) => { if (msg) process.stdout.write(`  ${msg}\n`); } };
  }

  let frame = 0;
  const iv = setInterval(() => {
    process.stdout.write(`\r  ${SPINNER_FRAMES[frame % SPINNER_FRAMES.length]}  ${label}...`);
    frame++;
  }, 80);

  return {
    stop(msg) {
      clearInterval(iv);
      if (msg) {
        process.stdout.write(`\r  ${msg}\n`);
      } else {
        process.stdout.write('\r\x1b[K');
      }
    },
  };
}

/**
 * Renders a progress bar to stdout in-place.
 *
 * @param {string}  label       - Left-side label (padded to fixed width)
 * @param {number}  downloaded  - Bytes received so far
 * @param {number}  total       - Total bytes (0 = unknown)
 */
function renderProgress(label, downloaded, total) {
  if (!isTTY) return;

  const LABEL_WIDTH = 28;
  const paddedLabel = label.padEnd(LABEL_WIDTH).slice(0, LABEL_WIDTH);

  if (total > 0) {
    const pct = Math.min(1, downloaded / total);
    const filled = Math.round(pct * BAR_WIDTH);
    const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
    const pctStr = `${Math.round(pct * 100)}%`.padStart(4);
    const sizeStr = `(${formatBytes(total)})`;
    process.stdout.write(`\r  ${paddedLabel} ${green(bar)} ${pctStr} ${dim(sizeStr)}`);
  } else {
    const dots = '.'.repeat((Date.now() / 300 | 0) % 4);
    process.stdout.write(`\r  ${paddedLabel} downloading${dots.padEnd(4)}`);
  }
}

/**
 * Finalise a progress line (clears + prints done message).
 */
function doneProgress(label, total) {
  if (!isTTY) {
    process.stdout.write(`  ${label}... done\n`);
    return;
  }
  const LABEL_WIDTH = 28;
  const paddedLabel = label.padEnd(LABEL_WIDTH).slice(0, LABEL_WIDTH);
  const bar = '█'.repeat(BAR_WIDTH);
  const sizeStr = total ? `(${formatBytes(total)})` : '';
  process.stdout.write(`\r  ${paddedLabel} ${green(bar)} 100% ${dim(sizeStr)}\n`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Prints a two-column status line, right-side auto-aligned.
 * e.g.  "  Detecting platform...          linux/amd64 ✓"
 */
function statusLine(label, value, ok = true) {
  const LABEL_WIDTH = 32;
  const paddedLabel = label.padEnd(LABEL_WIDTH).slice(0, LABEL_WIDTH);
  process.stdout.write(`  ${paddedLabel} ${value}${ok ? '' : ''}\n`);
}

module.exports = { createSpinner, renderProgress, doneProgress, statusLine, formatBytes };
