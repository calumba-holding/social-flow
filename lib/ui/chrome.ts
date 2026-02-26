const chalk = require('chalk');
const MINT_HEX = '#66FFCC';
const MINT_DARK_HEX = '#3FD9A9';

function stripAnsi(input) {
  return String(input || '').replace(/\u001b\[[0-9;]*m/g, '');
}

function visibleLength(input) {
  return stripAnsi(input).length;
}

function padVisible(input, width) {
  const text = String(input || '');
  const padding = Math.max(0, Number(width || 0) - visibleLength(text));
  return text + ' '.repeat(padding);
}

function renderPanel(options = {}) {
  const title = String(options.title || '').trim();
  const rows = Array.isArray(options.rows) ? options.rows.map((line) => String(line ?? '')) : [];
  const minWidth = Number.isFinite(options.minWidth) ? Math.max(0, Number(options.minWidth)) : 56;
  const borderColor = typeof options.borderColor === 'function'
    ? options.borderColor
    : (value) => chalk.hex(MINT_HEX)(value);

  const widestRow = rows.reduce((max, line) => Math.max(max, visibleLength(line)), 0);
  const contentWidth = Math.max(minWidth, visibleLength(title), widestRow);

  const out = [];
  out.push(`${borderColor('┌')}${borderColor('─'.repeat(contentWidth + 2))}${borderColor('┐')}`);

  if (title) {
    out.push(`${borderColor('│')} ${padVisible(chalk.bold(title), contentWidth)} ${borderColor('│')}`);
    out.push(`${borderColor('├')}${borderColor('─'.repeat(contentWidth + 2))}${borderColor('┤')}`);
  }

  rows.forEach((line) => {
    out.push(`${borderColor('│')} ${padVisible(line, contentWidth)} ${borderColor('│')}`);
  });

  out.push(`${borderColor('└')}${borderColor('─'.repeat(contentWidth + 2))}${borderColor('┘')}`);
  return out.join('\n');
}

function formatBadge(label, options = {}) {
  const tone = String(options.tone || 'info').trim().toLowerCase();
  const width = Number.isFinite(options.width) ? Math.max(0, Number(options.width)) : 0;
  const text = width ? String(label || '').padEnd(width, ' ') : String(label || '');

  const palette = {
    success: (value) => chalk.black.bgGreen(` ${value} `),
    warn: (value) => chalk.black.bgYellow(` ${value} `),
    danger: (value) => chalk.white.bgRed(` ${value} `),
    neutral: (value) => chalk.white.bgBlackBright(` ${value} `),
    info: (value) => chalk.black.bgHex(MINT_DARK_HEX)(` ${value} `)
  };

  const painter = palette[tone] || palette.info;
  return painter(text);
}

function kv(label, value, options = {}) {
  const labelWidth = Number.isFinite(options.labelWidth) ? Math.max(0, Number(options.labelWidth)) : 18;
  const empty = options.empty === undefined ? 'not set' : String(options.empty);
  const output = value === null || value === undefined || value === '' ? chalk.gray(empty) : String(value);
  return `${chalk.gray(String(label || '').padEnd(labelWidth, ' '))} ${output}`;
}

function formatTokenPreview(token) {
  const raw = String(token || '').trim();
  if (!raw) return '';
  if (raw.length <= 12) return raw;
  return `${raw.slice(0, 6)}...${raw.slice(-4)}`;
}

function mint(value) {
  return chalk.hex(MINT_HEX)(String(value || ''));
}

function mintSoft(value) {
  return chalk.hex(MINT_DARK_HEX)(String(value || ''));
}

module.exports = {
  MINT_HEX,
  MINT_DARK_HEX,
  stripAnsi,
  visibleLength,
  padVisible,
  renderPanel,
  formatBadge,
  kv,
  formatTokenPreview,
  mint,
  mintSoft
};
