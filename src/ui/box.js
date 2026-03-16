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
/**
 * Renders a bordered box to a string (no ANSI colour codes stripped from content,
 * but padding is calculated from the raw/stripped length).
 *
 * @param {Array<string|null>} lines
 * @returns {string}
 */
function renderBox(lines) {
  const w = BOX_WIDTH;
  const top    = `╔${'═'.repeat(w + 2)}╗`;
  const bottom = `╚${'═'.repeat(w + 2)}╝`;
  const div    = `╠${'═'.repeat(w + 2)}╣`;

  const parts = ['\n', top + '\n'];
  for (const line of lines) {
    if (line === null) {
      parts.push(div + '\n');
    } else {
      const raw = stripAnsi(line);
      const pad = Math.max(0, w - raw.length);
      parts.push(`║  ${line}${' '.repeat(pad)}  ║\n`);
    }
  }
  parts.push(bottom + '\n\n');
  return parts.join('');
}

function printBox(lines) {
  process.stdout.write(renderBox(lines));
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

module.exports = { printBox, renderBox, printNextSteps, BOX_WIDTH };
