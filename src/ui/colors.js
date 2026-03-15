'use strict';

// Zero-dependency ANSI color helpers.
// Automatically disabled in non-TTY environments.

const isTTY = process.stdout.isTTY && process.stderr.isTTY;
const isCI = !!process.env.CI;

function ansi(code) {
  return isTTY ? `\x1b[${code}m` : '';
}

const reset  = () => ansi('0');
const bold   = (s) => `${ansi('1')}${s}${ansi('0')}`;
const dim    = (s) => `${ansi('2')}${s}${ansi('0')}`;
const green  = (s) => `${ansi('32')}${s}${ansi('0')}`;
const yellow = (s) => `${ansi('33')}${s}${ansi('0')}`;
const red    = (s) => `${ansi('31')}${s}${ansi('0')}`;
const cyan   = (s) => `${ansi('36')}${s}${ansi('0')}`;
const white  = (s) => `${ansi('97')}${s}${ansi('0')}`;

const tick  = () => isTTY ? green('✓') : 'OK';
const cross = () => isTTY ? red('✗')  : 'FAIL';
const warn  = () => isTTY ? yellow('⚠') : 'WARN';
const arrow = () => isTTY ? cyan('→')  : '->';

module.exports = { isTTY, isCI, bold, dim, green, yellow, red, cyan, white, tick, cross, warn, arrow, reset };
