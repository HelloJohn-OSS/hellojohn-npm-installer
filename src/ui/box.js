'use strict';

const { isTTY } = require('./colors');

const BOX_WIDTH = 54; // inner content width

/**
 * Renders a bordered box to stdout.
 *
 * @param {Array<string|null>} lines
 *   Strings are content rows. `null` inserts a ╠═╣ divider.
 *
 * Example:
 *   printBox([
 *     '✅  HelloJohn OSS v1.2.3 installed successfully',
 *     null,
 *     'Next steps:',
 *     '  hjctl local init',
 *   ]);
 */
function printBox(lines) {
  const w = BOX_WIDTH;
  const top    = `╔${'═'.repeat(w + 2)}╗`;
  const bottom = `╚${'═'.repeat(w + 2)}╝`;
  const div    = `╠${'═'.repeat(w + 2)}╣`;

  process.stdout.write('\n');
  process.stdout.write(top + '\n');

  for (const line of lines) {
    if (line === null) {
      process.stdout.write(div + '\n');
    } else {
      // Strip ANSI codes for length measurement
      const raw = stripAnsi(line);
      const pad = Math.max(0, w - raw.length);
      process.stdout.write(`║  ${line}${' '.repeat(pad)}  ║\n`);
    }
  }

  process.stdout.write(bottom + '\n\n');
}

/**
 * Prints a minimal "next steps" box.
 */
function printNextSteps(steps, header = 'Next steps:') {
  const lines = [header, null, ...steps.map(s => `  ${s}`)];
  printBox(lines);
}

/** Strip ANSI escape codes from a string for length measurement. */
function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

module.exports = { printBox, printNextSteps, BOX_WIDTH };
